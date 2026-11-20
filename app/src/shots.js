// Fixed scenes for screenshots. `?shot=cover` draws the cover alone, full frame;
// `?shot=editor` shows the editor with sample photos loaded. The query picks the
// samples (`photo`, `photo2`), the words (`caption`, `tagline`), the look
// (`layout`, `grade`) and the export size (`size`). `fy` / `fy2` set each
// sample's vertical focus (-1 top … 1 bottom), so a portrait photo's face stays
// in frame in a wide panel. window.__shotReady is set once the fonts are in
// and the scene has painted twice.

function pick(query, name, fallback) {
  const value = query.get(name);
  return value === null || value === '' ? fallback : value;
}

/** A -1..1 focus value from the query, 0 when absent or not a number. */
function focusValue(query, name) {
  const raw = Number(query.get(name));
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-1, Math.min(1, raw));
}

function sceneFor(shot, query) {
  const first = pick(query, 'photo', 'boulevard');
  const second = pick(query, 'photo2', 'pier');
  const fy = focusValue(query, 'fy');
  const fy2 = focusValue(query, 'fy2');
  return {
    mode: shot === 'cover' ? 'cover' : 'editor',
    photos: [first, second, first, second],
    focus: [fy, fy2, fy, fy2],
    caption: pick(query, 'caption', 'VICE CITY'),
    tagline: pick(query, 'tagline', 'NEON NIGHTS'),
    layout: pick(query, 'layout', 'quad'),
    grade: pick(query, 'grade', 'sunset'),
    size: pick(query, 'size', '1920x1080'),
  };
}

/** Loads the scene, then flags the page ready for a screenshot. */
export async function runShot(shot, query, load) {
  const scene = sceneFor(shot, query);
  await load(scene);
  try {
    await document.fonts.ready;
  } catch { /* fonts fall back to sans-serif */ }
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  window.__shotReady = true;
}
