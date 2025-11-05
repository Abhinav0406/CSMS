// Minimal Electron main process that loads the Next.js app
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Single instance lock so two apps don't fight for the same dev server
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Ensure menu bar is hidden even if Alt is pressed
  try { mainWindow.setMenuBarVisibility(false); } catch {}

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Basic diagnostics to help catch white screen issues in packaged builds
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error('did-fail-load', { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('render-process-gone', details);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log('[renderer]', { level, message, line, sourceId });
  });
  // Hide scrollbars but keep scrolling
  mainWindow.webContents.on('did-finish-load', () => {
    const css = `
      html, body { scrollbar-width: none; }
      body { -ms-overflow-style: none; }
      ::-webkit-scrollbar { width: 0px; height: 0px; background: transparent; }
    `;
    try { mainWindow?.webContents.insertCSS(css); } catch {}
  });

  (async () => {
    let url = process.env.CSMS_ELECTRON_URL || 'http://localhost:3000';
    if (app.isPackaged && !process.env.CSMS_ELECTRON_URL) {
      // Prefer hosted production URL when running from an installed app
      url = 'https://csms-0.vercel.app';
      // If the hosted URL fails (offline), fall back to starting the embedded server
      try {
        await new Promise((resolve, reject) => {
          const https = require('https');
          const req = https.get(url, (res) => { res.destroy(); resolve(true); });
          req.on('error', reject);
        });
      } catch {
        try {
          const { startNextStandalone } = require('./start-next');
          const port = await startNextStandalone();
          url = `http://127.0.0.1:${port}`;
        } catch (e) {
          console.error('Failed to start embedded Next server', e);
        }
      }
    }
    // Always start at /login
    const target = url.replace(/\/?$/, '') + '/login';
    await mainWindow.loadURL(target).catch((e) => console.error('loadURL failed', e));
    // If still blank after 5s, open devtools to surface errors
    setTimeout(() => {
      if (!mainWindow) return;
      mainWindow.webContents.executeJavaScript('document.body && document.body.innerHTML').then((html) => {
        if (typeof html === 'string' && html.trim().length === 0) {
          try { mainWindow.webContents.openDevTools({ mode: 'detach' }); } catch {}
        }
      }).catch(() => {});
    }, 5000);
  })();

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


