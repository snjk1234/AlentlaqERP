/* eslint @typescript-eslint/no-require-imports: "off" */
// Starts the Next.js dev server on a dedicated port, waits until it is ready,
// then launches Electron pointed at it. This avoids colliding with the
// production host server that occupies port 3000 on the host machine —
// a collision that used to make `pnpm electron-dev` display the old build.
const { spawn } = require('child_process');
const net = require('net');

const port = process.env.POS_DEV_PORT || '3005';
// Use localhost (not 127.0.0.1) so the origin matches the dev server and HMR works.
const devUrl = `http://localhost:${port}`;

function assertPortFree() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use. Stop the process using it or set POS_DEV_PORT to a free port, ` +
          'otherwise Next.js would silently pick another port and Electron would load the wrong server.'
        ));
      } else {
        reject(error);
      }
    });
    probe.once('listening', () => probe.close(resolve));
    probe.listen(Number(port), '127.0.0.1');
  });
}

async function waitForServer(timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(devUrl, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) return;
    } catch {
      // Server not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The dev server did not become ready at ${devUrl} within ${timeoutMs / 1000}s.`);
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function main() {
  await assertPortFree();

  const nextBin = require.resolve('next/dist/bin/next');
  const nextDev = spawn(process.execPath, [nextBin, 'dev', '--port', port], {
    env: process.env,
    stdio: 'inherit'
  });

  let electronChild = null;
  let shuttingDown = false;
  const shutdown = (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    killTree(electronChild);
    killTree(nextDev);
    process.exitCode = code;
  };

  nextDev.on('exit', (code) => {
    if (!shuttingDown) {
      console.error('The Next.js dev server stopped unexpectedly.');
      shutdown(code || 1);
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => shutdown(0));
  }

  console.log(`Waiting for the dev server at ${devUrl} ...`);
  await waitForServer();
  console.log(`Dev server is ready. Launching Electron against ${devUrl}`);

  const electronPath = require('electron');
  electronChild = spawn(electronPath, ['.'], {
    env: {
      ...process.env,
      ELECTRON_START_URL: devUrl,
      // Route IPC data calls to the dev server too, so new API routes are
      // available in development instead of the old production host build.
      POS_SERVER_URL: process.env.POS_SERVER_URL || devUrl
    },
    stdio: 'inherit'
  });
  electronChild.on('exit', (code) => shutdown(code || 0));
}

main().catch((error) => {
  console.error('electron-dev failed:', error.message);
  process.exitCode = 1;
});
