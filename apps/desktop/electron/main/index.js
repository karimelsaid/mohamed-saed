const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { logger } = require('../logging/logger');
const { ipcRouter } = require('../ipc/ipc-router');
const { adminService } = require('../services/admin-service');
const { settingsService } = require('../services/settings-service');
const { inventoryEngineService } = require('../services/inventory-engine-service');
const { bookingEngineService } = require('../services/booking-engine-service');
const { posSalesService } = require('../services/pos-sales-service');
const { financeEngineService } = require('../services/finance-engine-service');
const { tasksNotificationsService } = require('../services/tasks-notifications-service');
const { reportsEngineService } = require('../services/reports-engine-service');
const { printingService } = require('../services/printing-service');
const { backupEngineService } = require('../services/backup-engine-service');
const { googleDriveService } = require('../services/google-drive-service');
const { updateEngineService } = require('../services/update-engine-service');
const { whatsappDirectService } = require('../services/whatsapp-direct-service');
const { dbConnection } = require('../database/connection');

let mainWindow = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.warn('Another instance of Suit Store System is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
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
      printers: settingsService.getPrinterSettings(),
      security: settingsService.getSecuritySettings(),
      whatsapp: settingsService.getWhatsAppSettings()
    };
  });

  ipcRouter.register('settings:update', async (payload) => {
    if (payload?.store) settingsService.updateStoreProfile(payload.store);
    if (payload?.printers) settingsService.updatePrinterSettings(payload.printers);
    if (payload?.pin) settingsService.setPin(payload.pin);
    if (payload?.protectedPages) settingsService.setProtectedPages(payload.protectedPages);
    if (payload?.whatsapp) settingsService.updateWhatsAppSettings(payload.whatsapp);
    return { success: true };
  });

  ipcRouter.register('app:verify-pin', async (payload) => {
    return { valid: settingsService.verifyPin(payload?.pin) };
  });

  ipcRouter.register('admin:get-categories', async (payload) => {
    const onlyActive = payload?.includeInactive ? false : true;
    return adminService.getCategories(onlyActive);
  });

  ipcRouter.register('admin:create-category', async (payload) => {
    return adminService.createCategory(payload);
  });

  ipcRouter.register('admin:update-category', async (payload) => {
    return adminService.updateCategory(payload.id, payload);
  });

  ipcRouter.register('admin:delete-category', async (payload) => {
    const id = payload?.id !== undefined ? payload.id : payload;
    return adminService.deleteCategory(id);
  });

  ipcRouter.register('admin:get-warehouses', async () => {
    return adminService.getWarehouses();
  });

  ipcRouter.register('admin:create-warehouse', async (payload) => {
    return adminService.createWarehouse(payload);
  });

  ipcRouter.register('admin:update-warehouse', async (payload) => {
    return adminService.updateWarehouse(payload.id, payload);
  });

  ipcRouter.register('admin:delete-warehouse', async (payload) => {
    const id = payload?.id !== undefined ? payload.id : payload;
    return adminService.deleteWarehouse(id);
  });

  ipcRouter.register('admin:set-default-warehouse', async (payload) => {
    return adminService.setDefaultWarehouse(payload.id);
  });

  ipcRouter.register('admin:get-sizes', async (payload) => {
    const categoryType = typeof payload === 'string' ? payload : (payload?.categoryType || payload?.category_type || payload?.code || payload?.type);
    return adminService.getSizes(categoryType);
  });

  ipcRouter.register('admin:create-size', async (payload) => {
    return adminService.createSize(payload);
  });

  ipcRouter.register('admin:update-size', async (payload) => {
    return adminService.updateSize(payload.id, payload);
  });

  ipcRouter.register('admin:delete-size', async (payload) => {
    const id = payload?.id !== undefined ? payload.id : payload;
    return adminService.deleteSize(id);
  });

  ipcRouter.register('admin:get-colors', async () => {
    return adminService.getColors();
  });

  ipcRouter.register('admin:create-color', async (payload) => {
    return adminService.createColor(payload);
  });

  ipcRouter.register('admin:update-color', async (payload) => {
    return adminService.updateColor(payload.id, payload);
  });

  ipcRouter.register('admin:delete-color', async (payload) => {
    const id = payload?.id !== undefined ? payload.id : payload;
    return adminService.deleteColor(id);
  });

  ipcRouter.register('admin:get-policies', async () => {
    return adminService.getRentalPolicies();
  });

  ipcRouter.register('admin:update-policies', async (payload) => {
    return adminService.updateRentalPolicies(payload);
  });

  // Inventory Engine Handlers (Phase 6)
  ipcRouter.register('inventory:get-suit-models', async (payload) => {
    return inventoryEngineService.getSuitModels(payload?.onlyActive);
  });

  ipcRouter.register('inventory:create-suit-model', async (payload) => {
    return inventoryEngineService.createSuitModel(payload);
  });

  ipcRouter.register('inventory:update-suit-model', async (payload) => {
    return inventoryEngineService.updateSuitModel(payload.id, payload);
  });

  ipcRouter.register('inventory:delete-suit-model', async (payload) => {
    return inventoryEngineService.deleteSuitModel(payload.id);
  });

  ipcRouter.register('inventory:get-suit-units', async (payload) => {
    return inventoryEngineService.getSuitUnits(payload);
  });

  ipcRouter.register('inventory:create-suit-unit', async (payload) => {
    return inventoryEngineService.createSuitUnit(payload);
  });

  ipcRouter.register('inventory:create-suit-units-batch', async (payload) => {
    return inventoryEngineService.createSuitUnitsBatch(payload);
  });

  ipcRouter.register('inventory:update-suit-unit', async (payload) => {
    return inventoryEngineService.updateSuitUnit(payload.id, payload);
  });

  ipcRouter.register('inventory:delete-suit-unit', async (payload) => {
    const id = payload?.id !== undefined ? payload.id : (payload?.unitId !== undefined ? payload.unitId : payload);
    return inventoryEngineService.deleteSuitUnit(id);
  });

  ipcRouter.register('inventory:update-unit-status', async (payload) => {
    return inventoryEngineService.updateUnitStatus(payload.unitId, payload.newStatus, payload.reason, payload.refType, payload.refId);
  });

  ipcRouter.register('inventory:get-unit-history', async (payload) => {
    return inventoryEngineService.getUnitHistory(payload.unitId);
  });

  ipcRouter.register('inventory:send-to-cleaning', async (payload) => {
    return inventoryEngineService.sendUnitToCleaning(payload.unitId, payload.cleanerName, payload.expectedReturnDate, payload.cost, payload.notes);
  });

  ipcRouter.register('inventory:return-from-cleaning', async (payload) => {
    return inventoryEngineService.returnUnitFromCleaning(payload.cleaningRecordId, payload.actualCost, payload.notes);
  });

  ipcRouter.register('inventory:get-quantity-products', async (payload) => {
    return inventoryEngineService.getQuantityProducts(payload?.categoryType);
  });

  ipcRouter.register('inventory:create-quantity-product', async (payload) => {
    return inventoryEngineService.createQuantityProduct(payload);
  });

  ipcRouter.register('inventory:update-quantity-product', async (payload) => {
    return inventoryEngineService.updateQuantityProduct(payload.id, payload);
  });

  ipcRouter.register('inventory:delete-quantity-product', async (payload) => {
    return inventoryEngineService.deleteQuantityProduct(payload.id);
  });

  ipcRouter.register('inventory:get-product-variants', async (payload) => {
    return inventoryEngineService.getProductVariants(payload.productId);
  });

  ipcRouter.register('inventory:adjust-stock', async (payload) => {
    return inventoryEngineService.adjustStock(payload.variantId, payload.warehouseId, payload.deltaQty, payload.reason, payload.notes);
  });

  ipcRouter.register('inventory:transfer-stock', async (payload) => {
    return inventoryEngineService.transferStock(payload.variantId, payload.fromWarehouseId, payload.toWarehouseId, payload.quantity, payload.notes);
  });

  ipcRouter.register('inventory:get-stock-ledger', async (payload) => {
    return inventoryEngineService.getStockLedger(payload);
  });

  // Customer Management Handlers (Phase 7)
  ipcRouter.register('customers:get-list', async (payload) => {
    return bookingEngineService.getCustomers(payload?.search, payload?.limit, payload?.offset);
  });

  ipcRouter.register('customers:create', async (payload) => {
    return bookingEngineService.createCustomer(payload);
  });

  ipcRouter.register('customers:update', async (payload) => {
    return bookingEngineService.updateCustomer(payload.id, payload);
  });

  ipcRouter.register('customers:get-details', async (payload) => {
    return bookingEngineService.getCustomerDetails(payload.id);
  });

  // Booking Engine Handlers (Phase 7)
  ipcRouter.register('booking:check-availability', async (payload) => {
    return bookingEngineService.checkUnitAvailability(payload.unitId, payload.pickupDate, payload.returnDueDate);
  });

  ipcRouter.register('booking:create', async (payload) => {
    return bookingEngineService.createBooking(payload);
  });

  ipcRouter.register('booking:get-list', async (payload) => {
    return bookingEngineService.getBookings(payload);
  });

  ipcRouter.register('booking:get-details', async (payload) => {
    return bookingEngineService.getBookingDetails(payload.id);
  });

  ipcRouter.register('booking:schedule-fitting', async (payload) => {
    return bookingEngineService.scheduleFitting(payload.bookingId, payload.fittingDate, payload.tailoringNotes);
  });

  ipcRouter.register('booking:mark-prepared', async (payload) => {
    return bookingEngineService.markPrepared(payload.bookingId, payload.notes);
  });

  ipcRouter.register('booking:handover', async (payload) => {
    return bookingEngineService.handoverBooking(payload.bookingId, payload.depositPaidAmount, payload.remainderPaidAmount, payload.paymentMethod);
  });

  ipcRouter.register('booking:return', async (payload) => {
    return bookingEngineService.returnAndSettleBooking(payload.bookingId, payload.actualReturnDate, payload.damageFee, payload.inspectionNotes);
  });

  ipcRouter.register('booking:cancel', async (payload) => {
    return bookingEngineService.cancelBooking(payload.bookingId, payload.reason);
  });

  // POS & Direct Sales Handlers (Phase 8)
  ipcRouter.register('sales:get-catalog', async (payload) => {
    return posSalesService.getSellableCatalog(payload);
  });

  ipcRouter.register('sales:lookup-barcode', async (payload) => {
    return posSalesService.lookupBarcode(payload.barcode || payload.code);
  });

  ipcRouter.register('sales:create-direct-sale', async (payload) => {
    return posSalesService.createDirectSale(payload);
  });

  ipcRouter.register('sales:get-list', async (payload) => {
    return posSalesService.getSales(payload);
  });

  ipcRouter.register('sales:get-details', async (payload) => {
    return posSalesService.getSaleDetails(payload.id);
  });

  ipcRouter.register('sales:process-return', async (payload) => {
    return posSalesService.processSaleReturn(payload);
  });

  // Financial Engine & Cash Handlers (Phase 9)
  ipcRouter.register('finance:get-cash-session', async () => {
    return financeEngineService.getActiveCashSession();
  });

  ipcRouter.register('finance:open-cash-session', async (payload) => {
    return financeEngineService.openCashSession(payload);
  });

  ipcRouter.register('finance:close-cash-session', async (payload) => {
    return financeEngineService.closeCashSession(payload);
  });

  ipcRouter.register('finance:get-sessions-list', async (payload) => {
    return financeEngineService.getSessionsList(payload);
  });

  ipcRouter.register('finance:record-expense', async (payload) => {
    return financeEngineService.recordExpense(payload);
  });

  ipcRouter.register('finance:get-expenses', async (payload) => {
    return financeEngineService.getExpenses(payload);
  });

  ipcRouter.register('finance:get-expense-categories', async () => {
    return financeEngineService.getExpenseCategories();
  });

  ipcRouter.register('finance:create-expense-category', async (payload) => {
    return financeEngineService.createExpenseCategory(payload);
  });

  ipcRouter.register('finance:record-cash-adjustment', async (payload) => {
    return financeEngineService.recordCashAdjustment(payload);
  });

  ipcRouter.register('finance:get-escrow-deposits', async () => {
    return financeEngineService.getEscrowDepositsSummary();
  });

  ipcRouter.register('finance:get-summary', async (payload) => {
    return financeEngineService.getFinancialSummary(payload);
  });

  // Tasks & Notifications Handlers (Phase 10)
  ipcRouter.register('tasks:get-list', async (payload) => {
    return tasksNotificationsService.getTasks(payload);
  });

  ipcRouter.register('tasks:create', async (payload) => {
    return tasksNotificationsService.createTask(payload);
  });

  ipcRouter.register('tasks:complete', async (payload) => {
    return tasksNotificationsService.completeTask(payload.taskId);
  });

  ipcRouter.register('tasks:generate-from-bookings', async () => {
    return tasksNotificationsService.generateTasksFromBookings();
  });

  ipcRouter.register('tasks:get-alerts', async () => {
    return tasksNotificationsService.getAlerts();
  });

  ipcRouter.register('tasks:get-returns-due', async () => {
    return tasksNotificationsService.getReturnsDue();
  });

  ipcRouter.register('notifications:get-list', async (payload) => {
    return tasksNotificationsService.getNotifications(payload);
  });

  ipcRouter.register('notifications:mark-read', async (payload) => {
    return tasksNotificationsService.markNotificationRead(payload.notificationId);
  });

  ipcRouter.register('whatsapp:get-templates', async () => {
    return tasksNotificationsService.getWhatsAppTemplates();
  });

  ipcRouter.register('whatsapp:generate-link', async (payload) => {
    return tasksNotificationsService.generateWhatsAppLink(payload);
  });

  ipcRouter.register('whatsapp:get-status', async () => {
    return whatsappDirectService.getStatus();
  });

  ipcRouter.register('whatsapp:open-pairing', async () => {
    return whatsappDirectService.openPairingWindow();
  });

  ipcRouter.register('whatsapp:hide-pairing', async () => {
    return whatsappDirectService.hideWindow();
  });

  ipcRouter.register('whatsapp:disconnect', async () => {
    return whatsappDirectService.disconnect();
  });

  ipcRouter.register('whatsapp:send-direct', async (payload) => {
    return whatsappDirectService.sendMessage(payload);
  });

  ipcRouter.register('whatsapp:run-auto-alerts', async () => {
    return tasksNotificationsService.runAutoAlerts(whatsappDirectService, settingsService);
  });

  // Reports Engine Handlers (Phase 11)
  ipcRouter.register('reports:get-profit-loss', async (payload) => {
    return reportsEngineService.getProfitAndLoss(payload);
  });

  ipcRouter.register('reports:get-stock-summary', async () => {
    return reportsEngineService.getStockSummary();
  });

  ipcRouter.register('reports:get-occupancy', async () => {
    return reportsEngineService.getRentalOccupancy();
  });

  ipcRouter.register('reports:get-top-customers', async (payload) => {
    return reportsEngineService.getTopCustomers(payload);
  });

  ipcRouter.register('reports:get-low-stock', async () => {
    return reportsEngineService.getLowStockAlerts();
  });

  // Printing Handlers (Phase 12)
  ipcRouter.register('print:invoice', async (payload) => {
    const html = printingService.generateInvoiceA4(payload?.invoiceData || payload);
    if (payload?.autoPrint) {
      return printingService.printDocument({
        html,
        printerName: payload.printerName,
        silent: payload.silent,
        pageSize: 'A4'
      });
    }
    return { success: true, html, pageSize: 'A4' };
  });

  ipcRouter.register('print:receipt', async (payload) => {
    const html = printingService.generateThermalReceipt80mm(payload?.receiptData || payload);
    if (payload?.autoPrint) {
      return printingService.printDocument({
        html,
        printerName: payload.printerName,
        silent: payload.silent,
        pageSize: '80mm'
      });
    }
    return { success: true, html, pageSize: '80mm' };
  });

  ipcRouter.register('print:rental-contract', async (payload) => {
    const html = printingService.generateRentalContractA4(payload?.contractData || payload);
    if (payload?.autoPrint) {
      return printingService.printDocument({
        html,
        printerName: payload.printerName,
        silent: payload.silent,
        pageSize: 'A4'
      });
    }
    return { success: true, html, pageSize: 'A4' };
  });

  ipcRouter.register('print:get-printers', async () => {
    return printingService.getPrinters();
  });

  // Backup & Restore Handlers (Phase 13)
  ipcRouter.register('backup:create-local', async (payload) => {
    return backupEngineService.createLocalBackup(payload);
  });

  ipcRouter.register('backup:restore-local', async (payload) => {
    return backupEngineService.restoreFromBackup(payload);
  });

  ipcRouter.register('backup:verify', async (payload) => {
    return backupEngineService.verifyBackupIntegrity(payload?.filePath);
  });

  ipcRouter.register('backup:sync-google-drive', async (payload) => {
    return backupEngineService.syncGoogleDrive(payload);
  });

  ipcRouter.register('backup:gdrive-list-backups', async () => {
    return backupEngineService.listGoogleDriveBackups();
  });

  ipcRouter.register('backup:gdrive-restore', async (payload) => {
    return backupEngineService.restoreFromGoogleDrive(payload);
  });

  ipcRouter.register('backup:get-gdrive-history', async (payload) => {
    const limit = payload?.limit || 10;
    return backupEngineService.getGoogleDriveSyncHistory(limit);
  });

  ipcRouter.register('backup:open-gdrive-url', async (payload) => {
    const targetUrl = payload?.url || 'https://drive.google.com/drive/my-drive';
    if (shell && shell.openExternal) {
      await shell.openExternal(targetUrl);
      return { success: true };
    }
    return { success: false };
  });

  ipcRouter.register('backup:gdrive-get-status', async () => {
    return googleDriveService.getStatus();
  });

  ipcRouter.register('backup:gdrive-start-auth', async () => {
    const authUrl = googleDriveService.getAuthUrl();
    if (shell && shell.openExternal) {
      shell.openExternal(authUrl);
    }
    return googleDriveService.startOAuthFlow();
  });

  ipcRouter.register('backup:gdrive-disconnect', async () => {
    return googleDriveService.disconnect();
  });

  ipcRouter.register('backup:get-info', async () => {
    return backupEngineService.getBackupInfo();
  });

  ipcRouter.register('backup:open-folder', async () => {
    const dir = backupEngineService.getDefaultBackupDir();
    if (shell && shell.openPath) {
      const err = await shell.openPath(dir);
      if (err) {
        throw new Error(`فشل فتح المجلد: ${err}`);
      }
      return { success: true, path: dir };
    }
    return { success: false, path: dir };
  });

  ipcRouter.register('backup:select-file', async () => {
    const backupDir = backupEngineService.getDefaultBackupDir();
    if (dialog && mainWindow) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر ملف النسخة الاحتياطية (.db)',
        defaultPath: backupDir,
        filters: [
          { name: 'SQLite Backup Files', extensions: ['db', 'sqlite', 'sqlite3'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        return { success: true, filePath: result.filePaths[0] };
      }
    }
    return { success: false, canceled: true };
  });

  ipcRouter.register('system:reset-database', async () => {
    return backupEngineService.resetDatabase();
  });

  // Auto Update Engine Handlers
  ipcRouter.register('update:check', async (payload) => {
    return updateEngineService.checkForUpdates(payload);
  });

  ipcRouter.register('update:download', async (payload) => {
    return updateEngineService.downloadUpdate(payload);
  });

  ipcRouter.register('update:apply', async (payload) => {
    return updateEngineService.applyUpdateAndRestart(payload);
  });

  ipcRouter.register('update:get-status', async () => {
    return updateEngineService.getStatus();
  });

  ipcRouter.attachToElectronIpc(ipcMain);
}

function createWindow() {
  logger.info('Initializing Main Application Window...');

  const appIconPath = process.platform === 'win32'
    ? path.join(__dirname, '..', '..', '..', 'build-resources', 'icon.ico')
    : path.join(__dirname, '..', '..', '..', 'build-resources', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 680,
    title: 'نظام إدارة محلات بيع وتأجير بدل ',
    icon: appIconPath,
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

  // Security: Intercept new window requests and open securely in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn(`Blocked in-app window creation for URL: ${url}`);
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:')) {
      shell.openExternal(url).catch(err => {
        logger.error('Failed to open external URL:', { url, error: err.message });
      });
    }
    return { action: 'deny' };
  });

  // Security: Prevent malicious or external navigation within main frame
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isAllowed = navigationUrl.startsWith('file://') || navigationUrl.startsWith('http://localhost:3000');
    if (!isAllowed) {
      event.preventDefault();
      logger.warn(`Blocked unauthorized navigation to: ${navigationUrl}`);
      shell.openExternal(navigationUrl).catch(err => {
        logger.error('Failed to open external navigation URL:', { url: navigationUrl, error: err.message });
      });
    }
  });

  // Load renderer
  const rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath).catch(err => {
    logger.error('Failed to load renderer HTML:', { error: err.message });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed. Cleaning up and exiting application...');
    try {
      whatsappDirectService.cleanup();
    } catch (_) {}
    app.quit();
  });
}

app.whenReady().then(() => {
  logger.info('Electron Application Ready. Initializing Database Schema...');
  try {
    dbConnection.connect();
    logger.info('Database connection established and all tables verified.');
  } catch (dbErr) {
    logger.error('CRITICAL: Database startup initialization failed:', { error: dbErr.message, stack: dbErr.stack });
  }

  logger.info('Registering IPC handlers and creating window...');
  registerCoreHandlers();
  createWindow();

  // Pre-initialize background WhatsApp Web session
  try {
    whatsappDirectService.onReadyCallback = () => {
      logger.info('Notifying renderer that WhatsApp pairing is complete!');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('whatsapp:paired', { isReady: true });
      }
    };
    whatsappDirectService.getOrCreateWindow();
  } catch (waErr) {
    logger.warn(`Could not pre-initialize background WhatsApp session: ${waErr.message}`);
  }

  // Periodic automated WhatsApp alerts engine (every 30 minutes)
  const autoAlertsTimer = setInterval(() => {
    try {
      tasksNotificationsService.runAutoAlerts(whatsappDirectService, settingsService).catch(err => {
        logger.warn('Periodic auto WhatsApp alerts check failed:', err.message);
      });
    } catch (_) {}
  }, 30 * 60 * 1000);

  // Initial check 45 seconds after launch to allow WhatsApp Web to restore session
  setTimeout(() => {
    try {
      tasksNotificationsService.runAutoAlerts(whatsappDirectService, settingsService).catch(() => {});
    } catch (_) {}
  }, 45 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  try {
    whatsappDirectService.cleanup();
  } catch (_) {}
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
