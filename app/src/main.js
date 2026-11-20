// Wires the Neon Panels editor: photo uploads, per-panel crop and position, caption and grade, live preview
// and PNG export in the three post sizes. A `?shot=` query sets up a fixed scene for a screenshot instead.
import { drawCover, panelAt, panelPolygons } from './cover.js';
import { runShot } from './shots.js';

const SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 },
};

const canvas = document.getElementById('cover');
const captionInput = document.getElementById('caption');
const taglineInput = document.getElementById('tagline');
const gradeInput = document.getElementById('grade');
const zoomInput = document.getElementById('zoom');
const scopeInput = document.getElementById('scope');
const status = document.getElementById('status');

const state = {
  size: { ...SIZES['1080x1350'] },
  caption: captionInput.value,
  tagline: taglineInput.value,
  grade: Number(gradeInput.value) / 100,
  panels: [0, 1, 2, 3].map(() => ({ img: null, zoom: 1, ox: 0, oy: 0 })),
};
let selected = 0;
let fontsReady = false;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function redraw() {
  drawCover(canvas, state);
}

function selectPanel(i) {
  selected = i;
  document.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('active', Number(b.dataset.panel) === i));
  zoomInput.value = String(state.panels[i].zoom);
}

function setSize(size) {
  state.size = { ...size };
  document.querySelectorAll('[data-size]').forEach((b) => {
    const [w, h] = b.dataset.size.split('x').map(Number);
    b.classList.toggle('active', w === size.w && h === size.h);
  });
  redraw();
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function applyPhoto(img) {
  const targets = scopeInput.value === 'all' ? [0, 1, 2, 3] : [selected];
  for (const i of targets) state.panels[i].img = img;
  redraw();
}

function readFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => loadImage(reader.result).then(resolve, reject);
    reader.onerror = () => reject(new Error('could not read that file'));
    reader.readAsDataURL(file);
  });
}

document.getElementById('photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    applyPhoto(await readFileAsImage(file));
    status.textContent = `Loaded ${file.name}`;
  } catch (err) {
    status.textContent = String(err.message || err);
  }
  e.target.value = '';
});

document.querySelectorAll('[data-sample]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      applyPhoto(await loadImage(`samples/${button.dataset.sample}.jpg`));
      status.textContent = `Loaded sample ${button.dataset.sample}`;
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });
});

document.querySelectorAll('[data-panel]').forEach((button) => {
  button.addEventListener('click', () => selectPanel(Number(button.dataset.panel)));
});

document.querySelectorAll('[data-size]').forEach((button) => {
  button.addEventListener('click', () => setSize(SIZES[button.dataset.size]));
});

zoomInput.addEventListener('input', () => {
  state.panels[selected].zoom = Number(zoomInput.value);
  redraw();
});

document.getElementById('center').addEventListener('click', () => {
  state.panels[selected].ox = 0;
  state.panels[selected].oy = 0;
  redraw();
});

captionInput.addEventListener('input', () => { state.caption = captionInput.value; redraw(); });
taglineInput.addEventListener('input', () => { state.tagline = taglineInput.value; redraw(); });
gradeInput.addEventListener('input', () => { state.grade = Number(gradeInput.value) / 100; redraw(); });

document.getElementById('export').addEventListener('click', () => {
  const off = document.createElement('canvas');
  drawCover(off, state);
  off.toBlob((blob) => {
    if (!blob) { status.textContent = 'Export failed'; return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cover-${state.size.w}x${state.size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    status.textContent = `Saved cover-${state.size.w}x${state.size.h}.png`;
  }, 'image/png');
});

// Drag a panel's photo to move it, scroll over it to zoom it.
let drag = null;
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}
canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const i = panelAt(p.x, p.y, canvas.width, canvas.height);
  if (i < 0) return;
  selectPanel(i);
  drag = { x: p.x, y: p.y, ox: state.panels[i].ox, oy: state.panels[i].oy };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const panel = state.panels[selected];
  const poly = panelPolygons(canvas.width, canvas.height)[selected];
  const xs = poly.map((pt) => pt[0]);
  const ys = poly.map((pt) => pt[1]);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  // Offsets are fractions of the panel's own width and height; the renderer clamps them so the
  // photo always covers the panel.
  panel.ox = clamp(drag.ox + (p.x - drag.x) / bw, -1, 1);
  panel.oy = clamp(drag.oy + (p.y - drag.y) / bh, -1, 1);
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  const p = canvasPoint(e);
  const i = panelAt(p.x, p.y, canvas.width, canvas.height);
  if (i < 0) return;
  e.preventDefault();
  selectPanel(i);
  const panel = state.panels[i];
  panel.zoom = clamp(panel.zoom * (1 - e.deltaY * 0.001), 1, 3);
  zoomInput.value = String(panel.zoom);
  redraw();
}, { passive: false });

async function ensureFonts() {
  if (fontsReady) return;
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('100px "Bebas Neue"'),
    ]);
    await document.fonts.ready;
  } catch {
    // The canvas falls back to its sans-serif stack.
  }
  fontsReady = true;
}

const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  runShot(shot, new URLSearchParams(location.search), {
    loadImage,
    setPanel(i, img, ox = 0, oy = 0) {
      state.panels[i].img = img;
      state.panels[i].ox = ox;
      state.panels[i].oy = oy;
    },
    setCaption(text) { state.caption = text; captionInput.value = text; },
    setTagline(text) { state.tagline = text; taglineInput.value = text; },
    setSize(size) { setSize(size); },
    async fontsReady() { await ensureFonts(); },
    redraw,
  });
} else {
  ensureFonts().then(redraw);
  redraw();
}
