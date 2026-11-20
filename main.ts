// Neon Panels — the entry program (Node 22, standard library only). It hands the
// app in: copies app/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json with the vendored make.fun library. After copying
// it walks both trees again and checks every copied file is the same size as its
// source, so a short copy fails loudly instead of entering a half-written app.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Every regular file under `dir`, as paths relative to it. */
function listFiles(dir, base = dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(path, base, found);
    else if (entry.isFile()) found.push(relative(base, path));
  }
  return found;
}

/** Copy a tree, then check each copied file matches its source byte for byte in size. */
function copyChecked(from, to, label) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  for (const rel of listFiles(from)) {
    const source = statSync(join(from, rel));
    const copied = statSync(join(to, rel));
    if (source.size !== copied.size) {
      throw new Error(`${label}/${rel}: copied ${copied.size} bytes, source has ${source.size}`);
    }
  }
}

mkdirSync(out, { recursive: true });
copyChecked(join(here, 'app'), join(out, 'app'), 'app');
if (existsSync(join(here, 'screenshots'))) {
  copyChecked(join(here, 'screenshots'), join(out, 'screenshots'), 'screenshots');
} else {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
const dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
if (typeof dossier !== 'object' || dossier === null) {
  throw new Error('dossier.json did not parse after buildDossier wrote it');
}
