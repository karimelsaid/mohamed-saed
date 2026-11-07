const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { logger } = require('../logging/logger');
const { ipcRouter } = require('../ipc/ipc-router');

let mainWindow = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.warn('Another instance of Suit Store System is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function registerCoreHandlers() {
  // App info
  ipcRouter.register('app:get-info', async () => {
    return {
      appName: 'نظام إدارة محلات بدل ',
      version: app.getVersion() || '1.0.0',
      electronVersion: process.versions.electron || 'standalone',
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged
    };
  });

  // System health
  ipcRouter.register('app:get-system-health', async () => {
    return {
      status: 'HEALTHY',
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      time: new Date().toISOString()
    };
  });

  ipcRouter.attachToElectronIpc(ipcMain);
}

function createWindow() {
  logger.info('Initializing Main Application Window...');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 680,
    title: 'نظام إدارة محلات بيع وتأجير بدل ',
    show: false,
    backgroundColor: '#121824',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.info('Main Application Window shown successfully.');
  });

  // Load renderer
  const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath).catch(err => {
    logger.error('Failed to load renderer HTML:', { error: err.message });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed.');
  });
}

app.whenReady().then(() => {
  logger.info('Electron Application Ready. Registering handlers...');
  registerCoreHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logger.info('All windows closed. Quitting application.');
    app.quit();
  }
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception in Main Process:', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection in Main Process:', { reason: String(reason) });
});

module.exports = { createWindow, registerCoreHandlers };
