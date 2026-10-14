// Builds a single-file executable for the platform this script runs on.
//
//   npm run build:binary
//
// Each OS needs its own build: the executable embeds that platform's native WebRTC addon
// (@node-datachannel/<platform>), which npm only installs for the current machine.
// CI does this for Linux, macOS (Apple Silicon + Intel) and Windows; see .github/workflows.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const OS = { linux: 'linux', darwin: 'macos', win32: 'windows' };
const PKG_OS = { linux: 'linux', darwin: 'macos', win32: 'win' };
const os = OS[process.platform];
const arch = process.arch;
if (!os || !['x64', 'arm64'].includes(arch)) {
  console.error(`Unsupported platform: ${process.platform}/${arch}`);
  process.exit(1);
}

const bundle = path.join(root, 'build', 'filedrop.cjs');
const exe = path.join(root, 'binaries', `filedrop-${os}-${arch}${process.platform === 'win32' ? '.exe' : ''}`);
fs.mkdirSync(path.dirname(exe), { recursive: true });

// 1. One CommonJS file with all JavaScript inlined. The native addon package stays external:
//    it is embedded by pkg as an asset and loaded with a plain require() at runtime.
//    node-datachannel's ESM build relies on import.meta, so point the bundler at its CommonJS build.
await build({
  entryPoints: [path.join(root, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  alias: { 'node-datachannel/polyfill': path.join(root, 'node_modules/node-datachannel/dist/cjs/polyfill/index.cjs') },
  external: ['@node-datachannel/*', 'bufferutil', 'utf-8-validate'],
  define: { __VERSION__: JSON.stringify(version) },
  outfile: bundle,
  logLevel: 'warning',
});

// 2. Wrap it together with the Node.js runtime into one executable.
const target = `node22-${PKG_OS[process.platform]}-${arch}`;
const pkgArgs = ['--no-install', 'pkg', bundle, '--config', path.join(root, 'pkg.config.json'), '--targets', target, '--output', exe];
const result = spawnSync('npx', pkgArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) process.exit(result.status ?? 1);

// 3. Apple Silicon refuses to run unsigned executables, so apply an ad-hoc signature on macOS.
//    (This is not a Developer ID signature or notarization; see the README for the Gatekeeper note.)
if (process.platform === 'darwin') {
  const sign = spawnSync('codesign', ['--force', '--sign', '-', exe], { stdio: 'inherit' });
  if (sign.status !== 0) process.exit(sign.status ?? 1);
}

// 4. Smoke test: the binary must start, load the native WebRTC module and report its version.
const smoke = spawnSync(exe, ['--version'], { encoding: 'utf8' });
if (smoke.status !== 0 || smoke.stdout.trim() !== version) {
  console.error(`Smoke test failed (exit ${smoke.status}):\n${smoke.stdout}${smoke.stderr}`);
  process.exit(1);
}
const mb = (fs.statSync(exe).size / 1024 / 1024).toFixed(0);
console.log(`Built ${path.relative(root, exe)} (${mb} MB, v${smoke.stdout.trim()})`);
