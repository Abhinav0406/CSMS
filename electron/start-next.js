// Start the Next.js server (standalone build) inside the packaged app
const path = require('path');
const fs = require('fs');
const http = require('http');

function fileExists(p) { try { return fs.existsSync(p); } catch { return false; } }

function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function startNextStandalone() {
  // Prefer a random available port; fall back to 3000
  let port = 0;
  try {
    // get-port must be a runtime dependency
    const getPort = require('get-port');
    port = await getPort({ port: [3000, 3001, 3002, 0] });
  } catch {
    port = 3000;
  }

  // When packaged, resources live under process.resourcesPath
  const resourcesRoot = process.resourcesPath || process.cwd();

  // server.js is usually at <resources>/.next/standalone/server.js when using files[]
  let standaloneServer = path.join(resourcesRoot, '.next', 'standalone', 'server.js');
  if (!fileExists(standaloneServer)) {
    // Fallback to when bundled under app/
    standaloneServer = path.join(resourcesRoot, 'app', '.next', 'standalone', 'server.js');
  }

  const publicDir = path.join(resourcesRoot, 'public');
  const staticDir = path.join(resourcesRoot, '.next', 'static');

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    // Tell standalone server where to find its assets
    __NEXT_STATIC_DIR: staticDir,
    __NEXT_PUBLIC_DIR: publicDir,
  };

  // Require the server.js directly to start the HTTP server in-process
  // Next's standalone server bootstraps on import
  // eslint-disable-next-line import/no-dynamic-require, global-require
  require(standaloneServer);

  // Wait until server responds before returning
  const url = `http://127.0.0.1:${port}`;
  try { await waitForHttp(url, 20000); } catch {}
  return port;
}

module.exports = { startNextStandalone };


