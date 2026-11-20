// Fixed scenes for screenshots: ?shot=editor shows the editor with sample photos loaded;
// ?shot=cover shows the cover alone. `photo` picks the hero sample, `caption` the words,
// `tagline` the small line under it, `size` (like 1920x1080) the cover size.
// window.__shotReady is set once painted.
export async function runShot(shot, query, api) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const caption = query.get('caption') ?? 'Sunset Heist';
  const tagline = query.get('tagline') ?? 'A neon story';
  const photo = query.get('photo') ?? 'pier';
  const other = photo === 'pier' ? 'boulevard' : 'pier';
  const sizeParam = query.get('size');
  if (sizeParam) {
    const [w, h] = sizeParam.split('x').map(Number);
    if (Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0) api.setSize({ w, h });
  }
  const hero = await api.loadImage(`samples/${photo}.jpg`);
  const alt = await api.loadImage(`samples/${other}.jpg`);
  // Nudge the hero photo toward its top, so a face near the top of a square photo still shows
  // in the wide hero panel; the renderer's clamp keeps it safe at every size.
  api.setPanel(0, hero, 0, 0.6);
  // The top-right panel is short, so the alt photo's subject (a face near the top of the
  // square sample) is cut off without a nudge down; the renderer's clamp keeps it safe.
  api.setPanel(1, alt, 0, 0.25);
  api.setPanel(2, alt);
  api.setPanel(3, hero);
  api.setCaption(caption);
  api.setTagline(tagline);
  await api.fontsReady();
  api.redraw();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
