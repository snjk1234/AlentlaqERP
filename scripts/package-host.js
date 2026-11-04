/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (${result.status ?? result.signal}): ${executable}`);
}

function copyRuntime(source, destination, base, links, mapPath = value => value) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    // Next can emit Windows file symlinks to directories; stat/realpath on those fails.
    let target = path.resolve(path.dirname(source), fs.readlinkSync(source));
    if (path.relative(base, target).startsWith('..')) {
      const dependency = path.relative(root, target);
      if (dependency.startsWith('node_modules' + path.sep)) {
        target = path.join(base, dependency);
      }
    }
    const relative = path.relative(base, target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(target).isDirectory()) {
      throw new Error(`Unsupported runtime link: ${source}`);
    }
    links.push({ path: mapPath(path.relative(base, source)), target: mapPath(relative) });
  } else if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      const child = path.join(source, entry);
      const name = path.basename(mapPath(path.relative(base, child)));
      copyRuntime(child, path.join(destination, name), base, links, mapPath);
    }
  } else {
    fs.copyFileSync(source, destination);
  }
}

async function packageHost() {
  if (process.platform !== 'win32' || process.arch !== 'x64' || Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('Build the host package on Windows x64 using Node.js 24 x64.');
  }
  const version = require('../package.json').version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A numeric release version is required.');
  const name = `AlEntlaqPOS-Server-${version}-win-x64`;
  const release = path.join(root, 'release');
  const destination = path.join(release, name);
  const archive = `${destination}.zip`;
  if (fs.existsSync(destination) || fs.existsSync(archive)) {
    throw new Error(`Release already exists. Move it aside before building again: ${destination}`);
  }
  run(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    env: { ...process.env, BUILD_TARGET: 'host' }
  });
  const standalone = path.join(root, '.next-host', 'standalone');
  if (!fs.existsSync(path.join(standalone, 'server.js'))) throw new Error('Standalone server was not generated.');
  fs.mkdirSync(release, { recursive: true });
  // Copy only runtime entries: standalone output can also contain local .env files.
  fs.mkdirSync(destination);
  const links = [];
  const stores = new Map(fs.readdirSync(path.join(standalone, 'node_modules', '.pnpm')).sort()
    .filter(name => name !== 'node_modules').map((name, index) => [name, `p${index}`]));
  const mapPath = value => value.split(path.sep).map((part, index, parts) =>
    index > 0 && parts[index - 1] === '.pnpm' && stores.has(part) ? stores.get(part) : part
  ).join(path.sep);
  for (const entry of ['server.js', 'package.json', '.next-host']) {
    copyRuntime(path.join(standalone, entry), path.join(destination, entry), standalone, links, mapPath);
  }
  fs.mkdirSync(path.join(destination, 'node_modules'));
  for (const name of fs.readdirSync(path.join(standalone, 'node_modules'))) {
    const source = path.join(standalone, 'node_modules', name);
    const original = path.join(root, 'node_modules', name);
    // Tracing includes may duplicate a pnpm package at the root, losing its sibling dependencies.
    if (fs.existsSync(original) && fs.lstatSync(original).isSymbolicLink() && fs.lstatSync(source).isDirectory()) {
      const target = path.relative(root, fs.realpathSync(original));
      if (!target.startsWith('node_modules' + path.sep) || !fs.existsSync(path.join(standalone, target))) {
        throw new Error(`Missing traced package: ${name}`);
      }
      links.push({ path: path.join('node_modules', name), target: mapPath(target) });
    } else {
      copyRuntime(source, path.join(destination, 'node_modules', name), standalone, links, mapPath);
    }
  }
  fs.writeFileSync(path.join(destination, 'runtime-links.json'), JSON.stringify(links));
  fs.cpSync(path.join(root, '.next-host', 'static'), path.join(destination, '.next-host', 'static'), { recursive: true });
  fs.cpSync(path.join(root, 'public'), path.join(destination, 'public'), { recursive: true });
  fs.mkdirSync(path.join(destination, 'src', 'lib'), { recursive: true });
  for (const entry of ['access-client.js', 'bootstrap.js', 'payment-numbers.js']) {
    fs.copyFileSync(path.join(root, 'src', 'lib', entry), path.join(destination, 'src', 'lib', entry));
  }
  for (const entry of ['start.cmd', 'start-host.js', 'server.env.example', 'SERVER-GUIDE.md']) {
    fs.copyFileSync(path.join(__dirname, 'host', entry), path.join(destination, entry));
  }
  fs.mkdirSync(path.join(destination, 'runtime'));
  fs.copyFileSync(process.execPath, path.join(destination, 'runtime', 'node.exe'));
  const nodeLicense = path.join(path.dirname(process.execPath), 'LICENSE');
  if (fs.existsSync(nodeLicense)) {
    fs.copyFileSync(nodeLicense, path.join(destination, 'runtime', 'LICENSE'));
  } else {
    const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, {
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Could not retrieve the Node.js license (${response.status}).`);
    fs.writeFileSync(path.join(destination, 'runtime', 'LICENSE'), await response.text());
  }
  fs.writeFileSync(path.join(destination, 'release.json'), JSON.stringify({
    version, platform: 'win32', arch: 'x64', node: process.version, builtAt: new Date().toISOString()
  }, null, 2));
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Compress-Archive -LiteralPath $env:HOST_RELEASE_DIR -DestinationPath $env:HOST_RELEASE_ZIP -CompressionLevel Optimal'], {
    env: { ...process.env, HOST_RELEASE_DIR: destination, HOST_RELEASE_ZIP: archive }
  });
  console.log(`Server package ready: ${archive}`);
}

if (require.main === module) {
  packageHost().catch(error => {
    console.error('Server packaging failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { copyRuntime };
