/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { copyRuntime } = require('./package-host');

test('runtime copy records internal links without traversing pnpm dependency cycles', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'host-package-'));
  try {
    const source = path.join(directory, 'source');
    const destination = path.join(directory, 'output');
    fs.mkdirSync(path.join(source, 'store'), { recursive: true });
    fs.writeFileSync(path.join(source, 'store', 'package.json'), '{}');
    fs.symlinkSync(path.join(source, 'store'), path.join(source, 'alias'), 'junction');
    fs.symlinkSync(source, path.join(source, 'store', 'cycle'), 'junction');
    const links = [];
    copyRuntime(source, destination, source, links);
    assert.equal(fs.readFileSync(path.join(destination, 'store', 'package.json'), 'utf8'), '{}');
    assert.equal(links.length, 2);
    assert.equal(fs.existsSync(path.join(destination, 'alias')), false);
    assert.ok(links.some(link => link.path === 'alias' && link.target === 'store'));
    assert.ok(links.some(link => link.path === path.join('store', 'cycle') && link.target === ''));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('runtime copy refuses dependencies pointing outside the portable release', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'host-package-'));
  try {
    const source = path.join(directory, 'source');
    const external = path.join(directory, 'external');
    fs.mkdirSync(source);
    fs.mkdirSync(external);
    fs.symlinkSync(external, path.join(source, 'bad-link'), 'junction');
    assert.throws(() => copyRuntime(source, path.join(directory, 'output'), source, []), /Unsupported runtime link/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('runtime copy remaps package directories and link targets to shorter Windows paths', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'host-package-'));
  try {
    const source = path.join(directory, 'source');
    const destination = path.join(directory, 'output');
    fs.mkdirSync(path.join(source, 'long-package-name'), { recursive: true });
    fs.writeFileSync(path.join(source, 'long-package-name', 'file.js'), 'module.exports = true;');
    fs.symlinkSync(path.join(source, 'long-package-name'), path.join(source, 'alias'), 'junction');
    const links = [];
    copyRuntime(source, destination, source, links, value => value.replace('long-package-name', 'p1'));
    assert.equal(fs.existsSync(path.join(destination, 'p1', 'file.js')), true);
    assert.deepEqual(links, [{ path: 'alias', target: 'p1' }]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
