import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = dirname(scriptDirectory);
const workspaceDirectory = dirname(dirname(packageDirectory));
const require = createRequire(import.meta.url);
const tsupPackage = require.resolve('tsup/package.json', {
  paths: [workspaceDirectory],
});
const esbuildModule = require.resolve('esbuild', {
  paths: [dirname(tsupPackage)],
});
const exampleDirectory = join(workspaceDirectory, 'apps', 'example');
const expoPackage = require.resolve('expo/package.json', {
  paths: [exampleDirectory],
});
const babelCore = require(
  require.resolve('@babel/core', {
    paths: [dirname(expoPackage)],
  }),
);
const transformClasses = require(
  require.resolve('@babel/plugin-transform-classes', {
    paths: [dirname(expoPackage)],
  }),
).default;
const { build } = await import(pathToFileURL(esbuildModule).href);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'wirokit-hermes-'));
const bundlePath = join(temporaryDirectory, 'hmac-smoke.js');

const platformDirectory = {
  darwin: 'osx-bin',
  linux: 'linux64-bin',
  win32: 'win64-bin',
}[process.platform];

if (platformDirectory === undefined) {
  throw new Error(`Hermes verification is unsupported on ${process.platform}.`);
}

const compilerPath = join(
  workspaceDirectory,
  'apps',
  'example',
  'node_modules',
  'react-native',
  'sdks',
  'hermesc',
  platformDirectory,
  process.platform === 'win32' ? 'hermes.exe' : 'hermes',
);

try {
  await build({
    bundle: true,
    format: 'iife',
    outfile: bundlePath,
    platform: 'neutral',
    stdin: {
      contents: `
        import { createWiroSignature } from './signature.ts';

        const actual = createWiroSignature(
          'test-api-key',
          'test-secret',
          '1700000000000',
        );
        const expected =
          '2d99fa1b6934f66a712785d1b402997e1b13d9d7cd5e0085211dac133ae4a8ef';
        if (actual !== expected) {
          throw new Error('Wiro HMAC golden vector mismatch.');
        }
      `,
      loader: 'ts',
      resolveDir: join(packageDirectory, 'src', 'internal'),
      sourcefile: 'wiro-hmac-hermes-smoke.ts',
    },
    target: 'es2015',
  });

  const source = await readFile(bundlePath, 'utf8');
  const transformed = babelCore.transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [transformClasses],
    sourceType: 'script',
  });
  if (transformed?.code === undefined) {
    throw new Error('Could not transform HMAC bundle for Hermes.');
  }
  await writeFile(bundlePath, transformed.code, 'utf8');

  const result = spawnSync(compilerPath, ['-O', '-exec', bundlePath], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(
    'Hermes HMAC golden vector verified without native crypto.\n',
  );
} finally {
  await rm(temporaryDirectory, {
    force: true,
    recursive: true,
  });
}
