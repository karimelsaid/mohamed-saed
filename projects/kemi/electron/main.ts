import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupIpcHandlers, setMainWindow } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  console.log('__dirname:', __dirname);
  console.log('Project root:', path.join(__dirname, '..'));

  const preloadPath = path.join(__dirname, '../preload/preload.js');
  console.log('Preload path:', preloadPath);
  console.log('Preload exists:', fs.existsSync(preloadPath));

  // Resolve icon path (works in both dev and production packaging)
  const possibleIconPaths = [
    path.join(__dirname, '../kemi/browser/kemi.png'),
    path.join(__dirname, '../../public/kemi.png'),
    path.join(app.getAppPath(), 'dist/kemi/browser/kemi.png'),
    path.join(app.getAppPath(), 'public/kemi.png'),
    path.join(process.cwd(), 'public/kemi.png'),
  ];
  const iconPath = possibleIconPaths.find(p => fs.existsSync(p));
  const appIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: appIcon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    },
    title: 'Kemi - محرر الفيديو بالذكاء الاصطناعي'
  });

  // Set the dock icon on macOS
  if (process.platform === 'darwin' && appIcon && app.dock) {
    app.dock.setIcon(appIcon);
  }

  setMainWindow(mainWindow);

  // Load packaged file if running from bundle or if dev server is unreachable
  if (app.isPackaged) {
    const indexPath = path.join(__dirname, '../kemi/browser/index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      mainWindow.loadFile(path.join(app.getAppPath(), 'dist/kemi/browser/index.html'));
    }
  } else {
    mainWindow.loadURL('http://localhost:4200').catch(() => {
      const indexPath = path.join(__dirname, '../kemi/browser/index.html');
      if (fs.existsSync(indexPath)) {
        mainWindow?.loadFile(indexPath);
      }
    });
  }

  // Only open DevTools if explicitly requested via environment variable
  if (process.env.DEBUG_DEVTOOLS === 'true') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Set the application name
app.name = 'kemi';

app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
