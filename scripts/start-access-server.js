/* eslint @typescript-eslint/no-require-imports: "off" */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const envFiles = ['.env.local', '.env']
  .map((file) => path.resolve(process.cwd(), file))
  .filter((file) => fs.existsSync(file));
if (envFiles.length) require('dotenv').config({ path: envFiles });
const { createAccessClient, initializeAccessDatabase } = require('../src/lib/access-client');
const { seedUsers } = require('../src/lib/bootstrap');

async function startServer() {
  if (!process.env.ACCESS_DB_PATH) {
    throw new Error('Set ACCESS_DB_PATH to the local .accdb file on this Windows host.');
  }
  if (!process.env.POS_API_TOKEN) {
    throw new Error('Set POS_API_TOKEN before exposing the POS API to the local network.');
  }
  const port = process.env.POS_PORT || '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('POS_PORT must be a valid TCP port.');
  }

  const database = createAccessClient();
  try {
    await initializeAccessDatabase();
    await seedUsers();
  } finally {
    await database.$disconnect();
  }

  const nextBin = require.resolve('next/dist/bin/next');
  const server = spawn(process.execPath, [nextBin, 'start', '--hostname', '0.0.0.0', '--port', port], {
    env: process.env,
    stdio: 'inherit'
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!server.killed) server.kill(signal);
    });
  }
  server.on('error', (error) => {
    console.error('Could not start the POS API server:', error);
    process.exitCode = 1;
  });
  server.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code || 0;
  });
}

startServer().catch((error) => {
  console.error('Access server startup failed:', error.message);
  process.exitCode = 1;
});
