// Neon Panels editor: wires the controls to the cover engine. A photo per panel
// (drag to move it, scroll to zoom it), words, layout, grade and export size,
// with a live preview on the canvas. A `?shot=` query sets up a fixed scene for
// a screenshot instead (./shots.js).

import { drawCover, panelQuads, pointInQuad, SIZES } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('stage');
const captionInput = document.getElementById('caption');
const taglineInput = document.getElementById('tagline');
const layoutInput = document.getElementById('layout');
const gradeInput = document.getElementById('grade');
const sizeInput = document.getElementById('size');
const status = document.getElementById('status');

const state = {
  photos: [null, null, null, null],
  caption: captionInput.value,
  tagline: taglineInput.value,
  layout: layoutInput.value,
  grade: gradeInput.value,
};
let selected = 0;

function redraw() {
  drawCover(canvas, state, { selected });
}

/** Loads an image from a URL, resolving to the image once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function setPhoto(index, img) {
  state.photos[index] = { img, zoom: 1, ox: 0, oy: 0 };
}

async function readFileInto(index, file) {
  if (!file) return;
  const img = await loadImage(URL.createObjectURL(file));
  setPhoto(index, img);
  selected = index;
  redraw();
}

for (let i = 0; i < 4; i++) {
  document.getElementById(`file${i}`).addEventListener('change', (e) => {
    readFileInto(i, e.target.files[0]).catch(() => {
      status.textContent = 'That photo could not be read.';
    });
  });
}
document.getElementById('fileAll').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = await loadImage(URL.createObjectURL(file));
    for (let i = 0; i < 4; i++) setPhoto(i, img);
    redraw();
  } catch {
    status.textContent = 'That photo could not be read.';
  }
});
document.getElementById('samples').addEventListener('click', async () => {
  try {
    const first = await loadImage('samples/boulevard.jpg');
    const second = await loadImage('samples/pier.jpg');
    setPhoto(0, first);
    setPhoto(1, second);
    setPhoto(2, first);
    setPhoto(3, second);
    redraw();
  } catch {
    status.textContent = 'The sample photos could not be loaded.';
  }
});

captionInput.addEventListener('input', () => {
  state.caption = captionInput.value;
  redraw();
});
taglineInput.addEventListener('input', () => {
  state.tagline = taglineInput.value;
  redraw();
});
layoutInput.addEventListener('change', () => {
  state.layout = layoutInput.value;
  redraw();
});
gradeInput.addEventListener('change', () => {
  state.grade = gradeInput.value;
  redraw();
});
sizeInput.addEventListener('change', () => {
  const [w, h] = SIZES[sizeInput.value] || SIZES['1920x1080'];
  canvas.width = w;
  canvas.height = h;
  redraw();
});

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return [
    ((event.clientX - rect.left) * canvas.width) / rect.width,
    ((event.clientY - rect.top) * canvas.height) / rect.height,
  ];
}

let dragging = null;
canvas.addEventListener('pointerdown', (event) => {
  const [x, y] = canvasPoint(event);
  const quads = panelQuads(canvas.width, canvas.height, state.layout);
  const hit = quads.findIndex((quad) => pointInQuad(x, y, quad));
  if (hit === -1) return;
  selected = hit;
  dragging = { x, y };
  canvas.setPointerCapture(event.pointerId);
  redraw();
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const [x, y] = canvasPoint(event);
  const shot = state.photos[selected];
  if (shot) {
    const quads = panelQuads(canvas.width, canvas.height, state.layout);
    const quad = quads[selected];
    const pw = Math.max(...quad.map((p) => p[0])) - Math.min(...quad.map((p) => p[0]));
    const ph = Math.max(...quad.map((p) => p[1])) - Math.min(...quad.map((p) => p[1]));
    shot.ox = Math.max(-1, Math.min(1, shot.ox + ((x - dragging.x) / pw) * 1.5));
    shot.oy = Math.max(-1, Math.min(1, shot.oy + ((y - dragging.y) / ph) * 1.5));
    redraw();
  }
  dragging = { x, y };
});
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const shot = state.photos[selected];
  if (!shot) return;
  shot.zoom = Math.max(1, Math.min(2.4, shot.zoom * Math.exp(-event.deltaY * 0.0012)));
  redraw();
}, { passive: false });

document.getElementById('export').addEventListener('click', () => {
  drawCover(canvas, state);
  canvas.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'The export failed — try again.';
      redraw();
      return;
    }
    const name = `neon-panels-${canvas.width}x${canvas.height}.png`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    status.textContent = `Saved ${name}`;
    redraw();
  }, 'image/png');
});

async function readyFonts() {
  try {
    await Promise.all([
      document.fonts.load('16px Anton'),
      document.fonts.load('16px "Bebas Neue"'),
    ]);
    await document.fonts.ready;
  } catch { /* the canvas falls back to sans-serif */ }
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  runShot(shot, params, async (scene) => {
    if (scene.mode === 'cover') document.body.classList.add('shot-cover');
    const [w, h] = SIZES[scene.size] || SIZES['1920x1080'];
    canvas.width = w;
    canvas.height = h;
    sizeInput.value = scene.size;
    captionInput.value = scene.caption;
    taglineInput.value = scene.tagline;
    layoutInput.value = scene.layout;
    gradeInput.value = scene.grade;
    state.caption = scene.caption;
    state.tagline = scene.tagline;
    state.layout = scene.layout;
    state.grade = scene.grade;
    const loaded = [];
    for (const name of scene.photos) {
      loaded.push(await loadImage(`samples/${name}.jpg`));
    }
    loaded.forEach((img, i) => {
      setPhoto(i, img);
      if (scene.focus) state.photos[i].oy = scene.focus[i] || 0;
    });
    // A cover scene is the finished art: no selection outline on it.
    selected = scene.mode === 'cover' ? null : 0;
    await readyFonts();
    redraw();
  });
} else {
  readyFonts().then(redraw);
  redraw();
}
