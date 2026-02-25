import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

/** Recursively find files matching extensions in a directory */
function findFiles(dir, extensions) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext)) && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Find all TypeScript/TSX source files
const tsFiles = ['lib', 'api', 'config']
  .flatMap(dir => findFiles(dir, ['.ts', '.tsx']));

// Find JSX files (components not yet converted to TSX)
const jsxFiles = findFiles('lib/chat/components', ['.jsx']);

const allFiles = [...tsFiles, ...jsxFiles];

if (allFiles.length === 0) {
  console.log('No source files found to build.');
  process.exit(0);
}

console.log(`Building ${allFiles.length} files...`);

await esbuild.build({
  entryPoints: allFiles,
  outdir: '.',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  jsx: 'automatic',
  outbase: '.',
  bundle: false,
  sourcemap: false,
  outExtension: { '.js': '.js' },
  minify: false,
});

console.log('Build complete.');
