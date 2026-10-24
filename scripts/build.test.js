/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const buildSource = fs.readFileSync(path.join(__dirname, 'build.js'), 'utf8');
const configSource = ts.transpileModule(
  fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;

function loadConfig(target) {
  const context = { exports: {}, process: { env: { BUILD_TARGET: target } } };
  vm.runInNewContext(configSource, context);
  return context.exports.default;
}

test('desktop export excludes TS APIs and proxy without changing host routing or cache', () => {
  const host = loadConfig(undefined);
  const desktop = loadConfig('electron');
  assert.equal(host.output, undefined);
  assert.ok(host.pageExtensions.includes('ts'));
  assert.equal(host.distDir, undefined);
  assert.equal(desktop.output, 'export');
  assert.equal(desktop.distDir, undefined);
  assert.deepEqual(Array.from(desktop.pageExtensions), ['tsx']);
  assert.ok(host.serverExternalPackages.includes('odbc'));
});

for (const [name, result, exitCode] of [
  ['successful build', { status: 0 }, 0],
  ['failed build', { status: 2 }, 2],
  ['terminated build', { status: null, signal: 'SIGTERM' }, 1],
  ['spawn failure', { status: null, error: new Error('spawn failed') }, 1]
]) {
  test(`desktop ${name} leaves source files and host cache untouched`, () => {
    const calls = [];
    const errors = [];
    const childProcess = {
      spawnSync(...args) {
        calls.push(args);
        return result;
      }
    };
    const fakeRequire = (name) => {
      assert.equal(name, 'child_process', 'build must not load filesystem mutation helpers');
      return childProcess;
    };
    fakeRequire.resolve = (name) => {
      assert.equal(name, 'next/dist/bin/next');
      return 'next-cli';
    };
    const processStub = { execPath: 'node', env: { POS_PORT: '3000' } };
    vm.runInNewContext(buildSource, {
      require: fakeRequire,
      process: processStub,
      console: { log() {}, error(...args) { errors.push(args); } }
    });
    assert.equal(processStub.exitCode, exitCode);
    assert.equal(calls.length, 1);
    const [executable, args, options] = calls[0];
    assert.equal(executable, 'node');
    assert.deepEqual(Array.from(args), ['next-cli', 'build']);
    assert.equal(options.env.BUILD_TARGET, 'electron');
    assert.equal(options.env.POS_PORT, '3000');
    assert.equal(processStub.env.BUILD_TARGET, undefined);
    assert.equal(options.shell, undefined);
    assert.equal(errors.length, exitCode === 0 ? 0 : 1);
  });
}
