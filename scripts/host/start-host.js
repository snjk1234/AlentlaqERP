/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');

async function start() {
  const root = __dirname;
  process.chdir(root);
  const configPath = process.env.POS_HOST_CONFIG
    ? path.resolve(process.env.POS_HOST_CONFIG)
    : path.resolve(root, '..', 'ServerConfig', 'server.env');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration not found: ${configPath}\nFollow SERVER-GUIDE.md before starting.`);
  }
  // ZIP does not preserve pnpm links; directory junctions need no administrator privileges.
  for (const link of require('./runtime-links.json')) {
    const location = path.resolve(root, link.path);
    const target = path.resolve(root, link.target);
    for (const value of [location, target]) {
      if (!value.startsWith(root + path.sep)) throw new Error('Invalid runtime link manifest.');
    }
    const existing = fs.lstatSync(location, { throwIfNoEntry: false });
    if (existing && !existing.isSymbolicLink()) {
      throw new Error(`Runtime link path is occupied: ${location}. Extract the ZIP into a new folder.`);
    }
    if (!fs.statSync(target, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Runtime dependency folder is missing: ${target}. Extract the complete ZIP into a new folder.`);
    }
    if (existing) {
      const currentTarget = path.resolve(path.dirname(location), fs.readlinkSync(location));
      if (path.relative(currentTarget, target) === '') continue;
      // Remove only the stale junction, not the directory it points to.
      fs.rmdirSync(location);
    }
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.symlinkSync(target, location, 'junction');
  }
  const parsed = require('dotenv').parse(fs.readFileSync(configPath));
  for (const key of ['ACCESS_DB_PATH', 'POS_API_TOKEN', 'POS_PORT']) {
    if (parsed[key] !== undefined) process.env[key] = parsed[key];
  }
  const dbPath = process.env.ACCESS_DB_PATH;
  if (!dbPath || !path.isAbsolute(dbPath) || !/\.(accdb|mdb)$/i.test(dbPath) || !fs.existsSync(dbPath)) {
    throw new Error('ACCESS_DB_PATH must point to an existing database using an absolute Windows path. No new database was created.');
  }
  if (!process.env.POS_API_TOKEN || process.env.POS_API_TOKEN === 'REPLACE_WITH_EXISTING_CLIENT_TOKEN') {
    throw new Error('Set POS_API_TOKEN to the existing client apiToken in server.env.');
  }
  const port = process.env.POS_PORT || '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('POS_PORT must be a number between 1 and 65535.');
  }
  // Refuse to initialize the database while an older server still owns the port.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(Number(port), '0.0.0.0', () => probe.close(resolve));
  });
  const { createAccessClient, initializeAccessDatabase } = require('./src/lib/access-client');
  const { seedUsers } = require('./src/lib/bootstrap');
  const database = createAccessClient();
  try {
    await initializeAccessDatabase();
    await seedUsers();
  } finally {
    await database.$disconnect();
  }

  console.log(`AlEntlaq POS Server ${require('./release.json').version}`);
  console.log(`Configuration: ${configPath}`);
  console.log(`Database: ${dbPath}`);
  console.log('Starting server. Keep this window open. Press Ctrl+C here to stop.');
  console.log(`Local address: http://localhost:${port}`);
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`Network address: http://${address.address}:${port}`);
    }
  }
  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '0.0.0.0', PORT: port },
    stdio: 'inherit'
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!server.killed) server.kill(signal);
    });
  }
  server.once('error', error => {
    console.error('Could not launch server:', error.message);
    process.exitCode = 1;
  });
  server.once('exit', (code, signal) => {
    process.exitCode = signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : (code ?? 1);
  });
}

start().catch(error => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});
