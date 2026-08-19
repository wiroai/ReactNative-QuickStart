import { defineConfig } from 'tsup';

export default defineConfig({
  clean: false,
  dts: false,
  entry: ['src/index.ts'],
  esbuildOptions(options) {
    options.resolveExtensions = [
      '.native.ts',
      '.native.tsx',
      '.native.js',
      '.native.jsx',
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
    ];
  },
  format: ['esm'],
  outExtension() {
    return { js: '.native.js' };
  },
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  treeshake: true,
});
