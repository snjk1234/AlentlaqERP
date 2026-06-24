const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const appApiDir = path.join(__dirname, '../src/app/api');
const tempApiDir = path.join(__dirname, '../src/api_backup');

let moved = false;

// 1. Move API directory out of src/app to prevent Next.js static export error
if (fs.existsSync(appApiDir)) {
  try {
    // If backup directory already exists (e.g. from a previous crashed run), delete it first
    if (fs.existsSync(tempApiDir)) {
      fs.rmSync(tempApiDir, { recursive: true, force: true });
    }
    fs.renameSync(appApiDir, tempApiDir);
    moved = true;
    console.log('Successfully backed up API routes for static export...');
  } catch (err) {
    console.error('Failed to move API directory:', err);
    process.exit(1);
  }
}

// Clear Next.js build cache to avoid stale type references for moved API routes
const nextCacheDir = path.join(__dirname, '../.next');
if (fs.existsSync(nextCacheDir)) {
  try {
    fs.rmSync(nextCacheDir, { recursive: true, force: true });
    console.log('Cleared Next.js build cache.');
  } catch (err) {
    console.warn('Failed to clear Next.js build cache, proceeding anyway:', err);
  }
}

try {
  // 2. Run next build
  console.log('Starting Next.js production build...');
  const result = spawnSync('npx', ['next', 'build'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, BUILD_TARGET: 'electron' }
  });

  if (result.status !== 0) {
    console.error(`Next.js build failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
} finally {
  // 3. Restore API directory under all circumstances
  if (fs.existsSync(tempApiDir)) {
    try {
      if (fs.existsSync(appApiDir)) {
        fs.rmSync(appApiDir, { recursive: true, force: true });
      }
      fs.renameSync(tempApiDir, appApiDir);
      console.log('Successfully restored API routes.');
    } catch (err) {
      console.error('Failed to restore API directory:', err);
    }
  }
}
