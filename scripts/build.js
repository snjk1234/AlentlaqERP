/* eslint @typescript-eslint/no-require-imports: "off" */
const { spawnSync } = require('child_process');

console.log('Starting Next.js desktop export (API source files remain in place)...');
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
  stdio: 'inherit',
  env: { ...process.env, BUILD_TARGET: 'electron' }
});

if (result.error) {
  console.error('Could not start the Next.js desktop build:', result.error);
} else if (result.signal) {
  console.error(`Next.js desktop build was terminated by ${result.signal}.`);
} else if (result.status !== 0) {
  console.error(`Next.js desktop build failed with exit code ${result.status}.`);
}
process.exitCode = result.status ?? 1;
