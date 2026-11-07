const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { logger } = require('../logging/logger');
const { ipcRouter } = require('../ipc/ipc-router');
const { adminService } = require('../services/admin-service');
const { settingsService } = require('../services/settings-service');

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

  // Settings & Administration Handlers
  ipcRouter.register('settings:get', async () => {
    return {
      store: settingsService.getStoreProfile(),
      printers: settingsService.getPrinterSettings()
    };
  });

  ipcRouter.register('settings:update', async (payload) => {
    if (payload?.store) settingsService.updateStoreProfile(payload.store);
    if (payload?.printers) settingsService.updatePrinterSettings(payload.printers);
    if (payload?.pin) settingsService.setPin(payload.pin);
    return { success: true };
  });

  ipcRouter.register('app:verify-pin', async (payload) => {
    return { valid: settingsService.verifyPin(payload?.pin) };
  });

  ipcRouter.register('admin:get-categories', async () => {
    return adminService.getCategories();
  });

  ipcRouter.register('admin:create-category', async (payload) => {
    return adminService.createCategory(payload);
  });

  ipcRouter.register('admin:update-category', async (payload) => {
    return adminService.updateCategory(payload.id, payload);
  });

  ipcRouter.register('admin:get-warehouses', async () => {
    return adminService.getWarehouses();
  });

  ipcRouter.register('admin:create-warehouse', async (payload) => {
    return adminService.createWarehouse(payload);
  });

  ipcRouter.register('admin:set-default-warehouse', async (payload) => {
    return adminService.setDefaultWarehouse(payload.id);
  });

  ipcRouter.register('admin:get-sizes', async (payload) => {
    return adminService.getSizes(payload?.categoryType);
  });

  ipcRouter.register('admin:create-size', async (payload) => {
    return adminService.createSize(payload);
  });

  ipcRouter.register('admin:get-colors', async () => {
    return adminService.getColors();
  });

  ipcRouter.register('admin:create-color', async (payload) => {
    return adminService.createColor(payload);
  });

  ipcRouter.register('admin:get-policies', async () => {
    return adminService.getRentalPolicies();
  });

  ipcRouter.register('admin:update-policies', async (payload) => {
    return adminService.updateRentalPolicies(payload);
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
