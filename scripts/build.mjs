import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'dist'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/main.tsx'],
  outfile: 'dist/forum.js',
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});
await build({
  absWorkingDir: root,
  entryPoints: ['server/api.mjs'],
  outfile: 'dist/forum-api.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
});
const css = await readFile(path.join(root, 'src/forum.css'), 'utf8');
await writeFile(
  path.join(root, 'dist/index.html'),
  '<!doctype html><html lang="hy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ACT Forum</title><style>' +
    css +
    '</style></head><body><div id="root"></div><script src="/forum.js"></script></body></html>',
);
console.log('ACT Forum build complete');
