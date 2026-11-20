// Neon Panels cover engine: draws a slanted multi-panel GTA-style poster onto a
// canvas. The state holds one photo per panel (with its own zoom and pan), the
// words, the layout and the colour grade. Nothing here reads the network; the
// photos are images already on the machine, the fonts are files under app/.

export const LAYOUTS = {
  quad: 'Quad — four panels',
  hero: 'Hero — one big panel, three small',
};

export const GRADES = {
  sunset: 'Sunset',
  neon: 'Neon',
  dusk: 'Dusk',
};

export const SIZES = {
  '1080x1080': [1080, 1080],
  '1080x1350': [1080, 1350],
  '1920x1080': [1920, 1080],
};

// A grade is a wash the photos are tinted with: a vertical gradient from `top`
// to `bottom`, plus an `overlay` tint laid over the whole cover.
const GRADE_TABLE = {
  sunset: {
    top: 'rgba(255, 176, 66, 0.10)',
    bottom: 'rgba(255, 45, 120, 0.34)',
    wash: 'rgba(255, 120, 40, 0.10)',
  },
  neon: {
    top: 'rgba(0, 240, 255, 0.12)',
    bottom: 'rgba(255, 0, 170, 0.38)',
    wash: 'rgba(255, 0, 150, 0.10)',
  },
  dusk: {
    top: 'rgba(130, 90, 255, 0.14)',
    bottom: 'rgba(16, 8, 48, 0.46)',
    wash: 'rgba(90, 60, 220, 0.10)',
  },
};

/** The four panel outlines for a cover of size w x h, as quads of [x, y] corners. */
export function panelQuads(w, h, layout) {
  const slant = Math.round(w * 0.02);
  if (layout === 'hero') {
    const split = w * 0.55;
    const third = h / 3;
    return [
      [[0, 0], [split + slant, 0], [split - slant, h], [0, h]],
      [[split + slant, 0], [w, 0], [w, third + slant / 2], [split + slant / 3, third]],
      [[split + slant / 3, third], [w, third + slant / 2], [w, 2 * third - slant / 2], [split - slant / 3, 2 * third]],
      [[split - slant / 3, 2 * third], [w, 2 * third - slant / 2], [w, h], [split - slant, h]],
    ];
  }
  const half = w / 2;
  const mid = h / 2;
  return [
    [[0, 0], [half + slant, 0], [half, mid], [0, mid - slant / 2]],
    [[half + slant, 0], [w, 0], [w, mid + slant / 2], [half, mid]],
    [[0, mid - slant / 2], [half, mid], [half - slant, h], [0, h]],
    [[half, mid], [w, mid + slant / 2], [w, h], [half - slant, h]],
  ];
}

/** Shrink a quad toward its centre by `d` pixels on every side (the gutter). */
export function insetQuad(quad, d) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / quad.length;
  const cy = quad.reduce((s, p) => s + p[1], 0) / quad.length;
  return quad.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * d, y + (dy / len) * d];
  });
}

/** True when the point (x, y) falls inside the quad (ray casting). */
export function pointInQuad(x, y, quad) {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const [xi, yi] = quad[i];
    const [xj, yj] = quad[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function traceQuad(ctx, quad) {
  ctx.beginPath();
  ctx.moveTo(quad[0][0], quad[0][1]);
  for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i][0], quad[i][1]);
  ctx.closePath();
}

function drawPanelPhoto(ctx, quad, shot) {
  if (!shot || !shot.img) return;
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  const img = shot.img;
  const base = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
  const scale = base * (shot.zoom || 1);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const ox = (shot.ox || 0) * Math.max(0, (dw - bw) / 2);
  const oy = (shot.oy || 0) * Math.max(0, (dh - bh) / 2);
  ctx.save();
  traceQuad(ctx, quad);
  ctx.clip();
  ctx.drawImage(img, bx + (bw - dw) / 2 + ox, by + (bh - dh) / 2 + oy, dw, dh);
  ctx.restore();
}

function gradeCover(ctx, w, h, gradeName) {
  const grade = GRADE_TABLE[gradeName] || GRADE_TABLE.sunset;
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, grade.top);
  wash.addColorStop(1, grade.bottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = grade.wash;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  const shade = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.35,
    w / 2, h / 2, Math.max(w, h) * 0.75,
  );
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(8, 2, 16, 0.38)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
}

function fitFont(ctx, text, fontFamily, startSize, maxWidth) {
  let size = startSize;
  ctx.font = `${size}px ${fontFamily}`;
  while (size > 16 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${size}px ${fontFamily}`;
  }
  return size;
}

function drawWords(ctx, w, h, caption, tagline) {
  const words = (caption || '').trim().toUpperCase();
  const sub = (tagline || '').trim().toUpperCase();
  const floor = ctx.createLinearGradient(0, h * 0.68, 0, h);
  floor.addColorStop(0, 'rgba(10, 4, 18, 0)');
  floor.addColorStop(1, 'rgba(10, 4, 18, 0.6)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.68, w, h * 0.32);

  ctx.save();
  ctx.translate(w / 2, h - h * 0.13);
  ctx.rotate(-0.02);
  if (words) {
    const size = fitFont(ctx, words, 'Anton, sans-serif', Math.round(w * 0.115), w * 0.92);
    const paint = ctx.createLinearGradient(0, -size * 0.8, 0, size * 0.2);
    paint.addColorStop(0, '#ffe259');
    paint.addColorStop(0.55, '#ff7e2d');
    paint.addColorStop(1, '#ff2d78');
    ctx.font = `${size}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a0b2e';
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.shadowColor = 'rgba(255, 45, 120, 0.85)';
    ctx.shadowBlur = size * 0.22;
    ctx.strokeText(words, 0, 0);
    ctx.fillStyle = paint;
    ctx.fillText(words, 0, 0);
    ctx.shadowBlur = 0;
  }
  if (sub) {
    const size = fitFont(ctx, sub, '"Bebas Neue", sans-serif', Math.round(w * 0.038), w * 0.8);
    ctx.font = `${size}px "Bebas Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 240, 255, 0.9)';
    ctx.shadowBlur = size * 0.5;
    try { ctx.letterSpacing = `${Math.round(size * 0.22)}px`; } catch { /* older canvas */ }
    ctx.fillText(`◆  ${sub}  ◆`, 0, size * 1.5);
    try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/**
 * Paints the whole cover onto `canvas` from `state`:
 *   { photos: [{img, zoom, ox, oy} | null] x4, caption, tagline, layout, grade }
 * `options.selected` (a panel index) draws a neon outline around that panel,
 * for the editor preview only — exports pass nothing.
 */
export function drawCover(canvas, state, options = {}) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.fillStyle = '#12081c';
  ctx.fillRect(0, 0, w, h);
  const quads = panelQuads(w, h, state.layout || 'quad');
  const gutter = Math.max(6, Math.round(w * 0.007));
  const photos = state.photos || [];
  quads.forEach((quad, i) => {
    const inner = insetQuad(quad, gutter / 2);
    drawPanelPhoto(ctx, inner, photos[i]);
    ctx.save();
    traceQuad(ctx, inner);
    ctx.strokeStyle = 'rgba(255, 210, 90, 0.35)';
    ctx.lineWidth = Math.max(1, w * 0.001);
    ctx.stroke();
    ctx.restore();
  });
  gradeCover(ctx, w, h, state.grade || 'sunset');
  drawWords(ctx, w, h, state.caption, state.tagline);
  if (options.selected !== undefined && options.selected !== null && quads[options.selected]) {
    ctx.save();
    traceQuad(ctx, insetQuad(quads[options.selected], gutter / 2));
    ctx.setLineDash([Math.round(w * 0.008), Math.round(w * 0.006)]);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = Math.max(2, w * 0.002);
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = w * 0.006;
    ctx.stroke();
    ctx.restore();
  }
}
