/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { test } = require('node:test');

test('extracted host ZIP repairs a stale ODBC junction, runs independently, and authenticates production reset', {
  skip: !process.env.HOST_RELEASE_ZIP || !process.env.ACCESS_TEST_SOURCE_DB,
  timeout: 180000
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alentlaq-host-smoke-'));
  let server;
  let output = '';
  try {
    const extracted = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:SMOKE_ZIP -DestinationPath $env:SMOKE_DIR'], {
      env: { ...process.env, SMOKE_ZIP: path.resolve(process.env.HOST_RELEASE_ZIP), SMOKE_DIR: directory },
      encoding: 'utf8', timeout: 90000
    });
    assert.equal(extracted.status, 0, extracted.stderr);
    const root = path.join(directory, fs.readdirSync(directory)[0]);
    const links = JSON.parse(fs.readFileSync(path.join(root, 'runtime-links.json'), 'utf8'));
    const odbcLink = links.find(link => link.path.startsWith(`.next-host${path.sep}`) &&
      path.basename(link.path).startsWith('odbc-'));
    assert.ok(odbcLink, 'The package must include the Next.js ODBC alias.');
    const odbcAlias = path.join(root, odbcLink.path);
    fs.mkdirSync(path.dirname(odbcAlias), { recursive: true });
    fs.symlinkSync(path.join(directory, 'missing-old-release', odbcLink.target), odbcAlias, 'junction');
    const database = path.join(directory, 'smoke.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, database);
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const token = require('node:crypto').randomBytes(32).toString('hex');
    fs.mkdirSync(path.join(directory, 'ServerConfig'));
    fs.writeFileSync(path.join(directory, 'ServerConfig', 'server.env'),
      `ACCESS_DB_PATH=${database}\nPOS_API_TOKEN=${token}\nPOS_PORT=${port}\n`);
    const env = { ...process.env };
    for (const key of ['ACCESS_DB_PATH', 'POS_API_TOKEN', 'POS_PORT', 'POS_HOST_CONFIG', 'BUILD_TARGET', 'NODE_PATH', 'NODE_OPTIONS']) delete env[key];
    server = spawn(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'start-host.js')], {
      cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', data => { output += data.toString(); });
    server.stderr.on('data', data => { output += data.toString(); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      assert.equal(server.exitCode, null, output);
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch (error) {
        if (error.name !== 'TimeoutError' && error.cause?.code !== 'ECONNREFUSED') throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, output);
    assert.equal(fs.realpathSync(odbcAlias), fs.realpathSync(path.join(root, odbcLink.target)));
    const duplicate = spawnSync(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'start-host.js')], {
      cwd: directory, env, encoding: 'utf8', timeout: 15000
    });
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /EADDRINUSE/);
    const missingConfig = spawnSync(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'start-host.js')], {
      cwd: directory, env: { ...env, POS_HOST_CONFIG: path.join(directory, 'missing.env') },
      encoding: 'utf8', timeout: 15000
    });
    assert.equal(missingConfig.status, 1);
    assert.match(missingConfig.stderr, /Configuration not found/);
    const html = await (await fetch(base)).text();
    const asset = html.match(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/);
    assert.ok(asset, 'The packaged page must reference its bundled assets.');
    assert.equal((await fetch(new URL(asset[1], base))).status, 200);
    const post = (route, body, bearer) => fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body)
    });
    const login = await post('/api/users/login', { username: 'admin', password: 'pos121' }, token);
    assert.equal(login.status, 200, output);
    const admin = await login.json();
    assert.ok(admin.sessionToken);
    const remote = require('../src/lib/remote-client').createRemoteClient(() => ({ serverUrl: base, apiToken: token }));
    const user = await remote.user.findFirst({ where: { username: 'admin' } });
    const product = await remote.product.create({ data: {
      code: 'SMOKE-QR', name: 'Test', type: 'Test', size: 'test', price: 100, stockQty: 5
    } });
    const qrCode = require('../src/lib/invoice-qr').invoiceQrText({
      invoiceNumber: 'INV-SMOKE-QR', issuedAt: '2026-11-17T12:00:00.000Z',
      totalAmount: '114.00', taxAmount: '14.00'
    });
    const invoice = await remote.$transaction(tx => tx.order.create({ data: {
      invoiceNumber: 'INV-SMOKE-QR', customerName: 'عميل نقدي', totalAmount: 100,
      taxAmount: 14, netAmount: 114, qrCode, invoiceType: 'فاتورة ضريبية',
      userId: user.id, status: 'COMPLETED', purchaseOrderNumber: 'PO-123',
      items: { create: [{ productId: product.id, quantity: 1, unitPrice: 100, taxAmount: 14, total: 114 }] }
    }, include: { items: true } }));
    assert.equal(invoice.qrCode, qrCode);
    assert.equal(invoice.items.length, 1);
    assert.equal(invoice.purchaseOrderNumber, 'PO-123');
    const preview = await post('/api/production-reset', { action: 'preview' }, admin.sessionToken);
    assert.equal(preview.status, 200, output);
    const data = (await preview.json()).data;
    assert.deepEqual(Object.keys(data.entities).sort(), ['bank', 'customer', 'product', 'supplier']);
    assert.equal(data.confirmWord, 'تفريغ');
    assert.equal(typeof data.counts.payment, 'number');
    assert.equal((await post('/api/production-reset', { action: 'preview' })).status, 401);
    const cashier = await (await post('/api/users/login', { username: 'cashier', password: '123456' }, token)).json();
    assert.equal((await post('/api/production-reset', { action: 'preview' }, cashier.sessionToken)).status, 403);
    const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
    assert.ok(output.includes(`AlEntlaq POS Server ${release.version}`));
    assert.equal(fs.existsSync(path.join(root, '.env.local')), false);
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      const stopped = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$children = Get-CimInstance Win32_Process -Filter "ParentProcessId = ${server.pid}"; foreach ($child in $children) { Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id ${server.pid} -Force -ErrorAction SilentlyContinue`],
      { encoding: 'utf8', timeout: 15000 });
      assert.equal(stopped.status, 0, stopped.stderr);
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
