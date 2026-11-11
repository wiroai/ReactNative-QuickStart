import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
const reactNativePackage = require.resolve('react-native/package.json', {
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

if (process.platform !== 'darwin') {
  // React Native publishes the Hermes VM as a macOS framework only.
  throw new Error(`Hermes verification is unsupported on ${process.platform}.`);
}

const runnerPath = await prepareHermesRunner(await readHermesVersion());
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'wiro-hermes-'));
const bundlePath = join(temporaryDirectory, 'hmac-smoke.js');

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
          throw new Error('Wiro HMAC contract vector mismatch.');
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

  const result = spawnSync(runnerPath, [bundlePath], {
    encoding: 'utf8',
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(
    'Hermes HMAC contract vector verified without native crypto.\n',
  );
} finally {
  await rm(temporaryDirectory, {
    force: true,
    recursive: true,
  });
}

// The Hermes release that React Native embeds in apps.
async function readHermesVersion() {
  const properties = await readFile(
    join(
      dirname(reactNativePackage),
      'sdks',
      'hermes-engine',
      'version.properties',
    ),
    'utf8',
  );
  const version = /^HERMES_VERSION_NAME=(\S+)$/mu.exec(properties)?.[1];
  if (version === undefined) {
    throw new Error('Could not read the Hermes version of React Native.');
  }
  return version;
}

// Builds scripts/hermes-runner.cpp against the hermesvm.framework from the
// Hermes release artifact that CocoaPods installs for React Native apps.
async function prepareHermesRunner(version) {
  const cacheDirectory = join(
    workspaceDirectory,
    'node_modules',
    '.cache',
    `wiro-hermes-${version}`,
  );
  const runner = join(cacheDirectory, 'hermes-runner');
  if (existsSync(runner)) {
    return runner;
  }

  const archiveName = `hermes-ios-${version}-hermes-ios-release.tar.gz`;
  const archiveUrl = `https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${version}/${archiveName}`;
  const archive = Buffer.from(await (await download(archiveUrl)).arrayBuffer());
  const checksum = (await (await download(`${archiveUrl}.sha256`)).text())
    .trim()
    .split(/\s+/u)[0];
  if (createHash('sha256').update(archive).digest('hex') !== checksum) {
    throw new Error(`Checksum mismatch for ${archiveName}.`);
  }

  await mkdir(cacheDirectory, { recursive: true });
  const archivePath = join(cacheDirectory, archiveName);
  await writeFile(archivePath, archive);
  try {
    run('tar', [
      '-xzf',
      archivePath,
      '-C',
      cacheDirectory,
      './destroot/include',
      './destroot/Library/Frameworks/macosx',
    ]);
  } finally {
    await rm(archivePath, { force: true });
  }

  const frameworks = join(
    cacheDirectory,
    'destroot',
    'Library',
    'Frameworks',
    'macosx',
  );
  run('clang++', [
    '-std=c++20',
    '-O1',
    `-I${join(cacheDirectory, 'destroot', 'include')}`,
    `-F${frameworks}`,
    '-framework',
    'hermesvm',
    `-Wl,-rpath,${frameworks}`,
    join(scriptDirectory, 'hermes-runner.cpp'),
    '-o',
    runner,
  ]);
  return runner;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  }
  return response;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}
