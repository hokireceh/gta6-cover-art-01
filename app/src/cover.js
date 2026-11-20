// Draws the multi-panel cover: four photo panels split by slanted gutters, a sunset/neon grade over each
// photo, and the caption as big gradient lettering in a title band along the foot. Everything is drawn in
// fractions of the canvas size, so the same state renders at any export size.

const TITLE_BAND = 0.22; // fraction of the height the title band takes
const GAP = 0.008; // gutter width, as a fraction of the width

/** The four panel polygons, in canvas pixels, for a cover of W by H. */
export function panelPolygons(w, h) {
  const ph = h * (1 - TITLE_BAND);
  // Slanted dividers: the vertical one leans left as it falls, the horizontal one falls as it runs right.
  const vTop = 0.62 * w;
  const vBot = 0.56 * w;
  const hLeft = 0.55 * ph;
  const hRight = 0.5 * ph;
  // Intersection of the two divider lines, solved from their parametric forms.
  const a = (vBot - vTop) / w; // dx per unit t, in fractions of w
  const b = (hRight - hLeft) / ph; // dy per unit s, in fractions of ph
  const t = (hLeft / ph + b * (vTop / w)) / (1 - b * a);
  const s = vTop / w + a * t;
  const cx = s * w;
  const cy = t * ph;
  return [
    [[0, 0], [vTop, 0], [cx, cy], [0, hLeft]],
    [[vTop, 0], [w, 0], [w, hRight], [cx, cy]],
    [[0, hLeft], [cx, cy], [vBot, ph], [0, ph]],
    [[cx, cy], [w, hRight], [w, ph], [vBot, ph]],
  ];
}

function insidePolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Which panel (0-3) holds point (x, y) on a W by H cover, or -1 for the title band. */
export function panelAt(x, y, w, h) {
  const polys = panelPolygons(w, h);
  for (let i = 0; i < polys.length; i++) if (insidePolygon(polys[i], x, y)) return i;
  return -1;
}

/** Draws the whole cover onto `canvas` from `state` ({ size, caption, tagline, grade, panels }). */
export function drawCover(canvas, state) {
  const { w, h } = state.size;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const ph = h * (1 - TITLE_BAND);
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(0, 0, w, h);
  const polys = panelPolygons(w, h);
  for (let i = 0; i < 4; i++) drawPanel(ctx, polys[i], state.panels[i], state.grade);
  // Slanted gutters over the seams.
  const gap = Math.max(4, Math.round(w * GAP));
  ctx.strokeStyle = '#0d0a14';
  ctx.lineWidth = gap;
  ctx.beginPath();
  ctx.moveTo(0.62 * w, 0);
  ctx.lineTo(0.56 * w, ph);
  ctx.moveTo(0, 0.55 * ph);
  ctx.lineTo(w, 0.5 * ph);
  ctx.stroke();
  drawTitleBand(ctx, w, h, ph, state);
}

function drawPanel(ctx, poly, panel, grade) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const bw = x1 - x0;
  const bh = y1 - y0;
  ctx.save();
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
  if (panel.img) {
    const zoom = panel.zoom ?? 1;
    const scale = Math.max(bw / panel.img.naturalWidth, bh / panel.img.naturalHeight) * zoom;
    const pw = panel.img.naturalWidth * scale;
    const pheight = panel.img.naturalHeight * scale;
    // Pan only as far as the photo still covers the panel: no empty edges.
    const maxOx = Math.max(0, (pw - bw) / 2 / bw);
    const maxOy = Math.max(0, (pheight - bh) / 2 / bh);
    const ox = Math.min(maxOx, Math.max(-maxOx, panel.ox ?? 0)) * bw;
    const oy = Math.min(maxOy, Math.max(-maxOy, panel.oy ?? 0)) * bh;
    ctx.drawImage(panel.img, x0 + (bw - pw) / 2 + ox, y0 + (bh - pheight) / 2 + oy, pw, pheight);
  } else {
    drawEmptyPanel(ctx, x0, y0, bw, bh);
  }
  applyGrade(ctx, x0, y0, bw, bh, grade);
  ctx.restore();
  // Thin light edge so each panel reads as its own frame.
  ctx.save();
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = Math.max(1, bw * 0.004);
  ctx.stroke();
  ctx.restore();
}

function drawEmptyPanel(ctx, x0, y0, bw, bh) {
  ctx.fillStyle = '#171226';
  ctx.fillRect(x0, y0, bw, bh);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let d = -bh; d < bw; d += 18) {
    ctx.beginPath();
    ctx.moveTo(x0 + d, y0);
    ctx.lineTo(x0 + d + bh, y0 + bh);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = `${Math.max(14, Math.round(bh * 0.07))}px "Bebas Neue", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('ADD A PHOTO', x0 + bw / 2, y0 + bh / 2);
}

function applyGrade(ctx, x0, y0, bw, bh, grade) {
  const g = Math.max(0, Math.min(1, grade ?? 0.7));
  if (g <= 0) return;
  // Warm sunset wash, stronger toward the foot of the panel.
  const warm = ctx.createLinearGradient(x0, y0, x0, y0 + bh);
  warm.addColorStop(0, `rgba(255, 170, 60, ${0.1 * g})`);
  warm.addColorStop(0.55, `rgba(255, 110, 80, ${0.12 * g})`);
  warm.addColorStop(1, `rgba(255, 40, 130, ${0.28 * g})`);
  ctx.fillStyle = warm;
  ctx.fillRect(x0, y0, bw, bh);
  // Cool neon shadow from the top.
  const cool = ctx.createLinearGradient(x0, y0, x0, y0 + bh * 0.5);
  cool.addColorStop(0, `rgba(40, 20, 90, ${0.18 * g})`);
  cool.addColorStop(1, 'rgba(40, 20, 90, 0)');
  ctx.fillStyle = cool;
  ctx.fillRect(x0, y0, bw, bh * 0.5);
  // Vignette: darken the corners.
  const vx = x0 + bw / 2;
  const vy = y0 + bh / 2;
  const vr = Math.max(bw, bh) * 0.75;
  const vig = ctx.createRadialGradient(vx, vy, vr * 0.45, vx, vy, vr);
  vig.addColorStop(0, 'rgba(8, 4, 18, 0)');
  vig.addColorStop(1, `rgba(8, 4, 18, ${0.32 * g})`);
  ctx.fillStyle = vig;
  ctx.fillRect(x0, y0, bw, bh);
}

function drawTitleBand(ctx, w, h, ph, state) {
  const bandH = h - ph;
  // Neon hairline above the band.
  const line = ctx.createLinearGradient(0, 0, w, 0);
  line.addColorStop(0, '#ffb020');
  line.addColorStop(0.5, '#ff2e88');
  line.addColorStop(1, '#22d3ee');
  ctx.fillStyle = line;
  ctx.fillRect(0, ph - 2, w, 4);
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(0, ph + 2, w, bandH - 2);
  const text = (state.caption || '').trim().toUpperCase();
  const tag = (state.tagline || '').trim().toUpperCase();
  const cx = w / 2;
  const cy = ph + bandH / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.02);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (text) {
    let size = bandH * (tag ? 0.42 : 0.58);
    ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    while (ctx.measureText(text).width > w * 0.92 && size > 10) {
      size -= 2;
      ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
    }
    const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    grad.addColorStop(0, '#ffe259');
    grad.addColorStop(0.5, '#ff7a18');
    grad.addColorStop(1, '#ff2e88');
    ctx.shadowColor = 'rgba(255, 46, 136, 0.55)';
    ctx.shadowBlur = size * 0.22;
    ctx.shadowOffsetY = size * 0.03;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14060f';
    ctx.lineWidth = size * 0.09;
    ctx.strokeText(text, 0, tag ? -bandH * 0.14 : 0);
    ctx.fillStyle = grad;
    ctx.fillText(text, 0, tag ? -bandH * 0.14 : 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  if (tag) {
    const tSize = Math.max(12, bandH * 0.16);
    ctx.font = `${tSize}px "Bebas Neue", sans-serif`;
    ctx.letterSpacing = `${Math.round(tSize * 0.35)}px`;
    ctx.fillStyle = '#67e8f9';
    ctx.fillText(tag, 0, bandH * 0.3);
    // Measure while the letter spacing is still on, so the diamonds clear the text.
    const tw = ctx.measureText(tag).width;
    ctx.letterSpacing = '0px';
    // Neon diamonds flanking the tagline.
    const d = tSize * 0.32;
    ctx.fillStyle = '#ff2e88';
    for (const sx of [-1, 1]) {
      const dx = sx * (tw / 2 + d * 2);
      const dy = bandH * 0.3;
      ctx.beginPath();
      ctx.moveTo(dx, dy - d);
      ctx.lineTo(dx + d, dy);
      ctx.lineTo(dx, dy + d);
      ctx.lineTo(dx - d, dy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
