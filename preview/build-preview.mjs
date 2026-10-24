// Builds a single self-contained HTML preview of the app (textures, fonts link, JS and CSS inline).
// Usage: node preview/build-preview.mjs <esbuild module path> <three.module.js> <gsap esm dir> <node_modules dir> <leaflet repo dir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [esbuildPath, threePath, gsapDir, nodeModules, leafletDir] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const esbuild = require(esbuildPath);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'preview-dist');
fs.mkdirSync(out, { recursive: true });

const swapCanvas = {
  name: 'swap-intro-canvas',
  setup(build) {
    build.onResolve({ filter: /IntroCanvas\.jsx$/ }, () => ({ path: path.join(here, 'IntroCanvas.vanilla.jsx') }));
    build.onResolve({ filter: /^three$/ }, () => ({ path: threePath }));
    build.onResolve({ filter: /^gsap$/ }, () => ({ path: path.join(gsapDir, 'index.js') }));
    build.onResolve({ filter: /^leaflet$/ }, () => ({ path: path.join(leafletDir, 'src/Leaflet.js') }));
    build.onResolve({ filter: /^leaflet\/dist\/leaflet\.css$/ }, () => ({ path: path.join(leafletDir, 'dist/leaflet.css') }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  write: false,
  outdir: out,
  nodePaths: [nodeModules],
  loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': process.env.BT_DEV ? 'true' : 'false' },
  plugins: [swapCanvas],
  logLevel: 'warning',
});

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const fonts =
  'https://fonts.googleapis.com/css2?family=Exo+2:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap';

const body = `<title>Beyond Terra</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>html,body{background:#050507;margin:0}${css}</style>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
`;

fs.writeFileSync(path.join(out, 'beyond-terra.html'), body);
fs.writeFileSync(
  path.join(out, 'local.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${body}</body></html>`
);
console.log('preview built', (body.length / 1e6).toFixed(2), 'MB');
