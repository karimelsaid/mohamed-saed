const { logger } = require('../logging/logger');

const ALLOWED_CHANNELS = new Set([
  'app:get-info',
  'app:get-system-health',
  'app:lock-screen',
  'app:verify-pin',
  'settings:get',
  'settings:update',
  'admin:get-categories',
  'admin:create-category',
  'admin:update-category',
  'admin:delete-category',
  'admin:get-warehouses',
  'admin:create-warehouse',
  'admin:update-warehouse',
  'admin:delete-warehouse',
  'admin:set-default-warehouse',
  'admin:get-sizes',
  'admin:create-size',
  'admin:update-size',
  'admin:delete-size',
  'admin:get-colors',
  'admin:create-color',
  'admin:update-color',
  'admin:delete-color',
  'admin:get-policies',
  'admin:update-policies',
  'db:check-integrity',
  'db:get-schema-version',
  'inventory:get-suit-models',
  'inventory:create-suit-model',
  'inventory:update-suit-model',
  'inventory:delete-suit-model',
  'inventory:get-suit-units',
  'inventory:create-suit-unit',
  'inventory:create-suit-units-batch',
  'inventory:update-suit-unit',
  'inventory:delete-suit-unit',
  'inventory:update-unit-status',
  'inventory:get-unit-history',
  'inventory:send-to-cleaning',
  'inventory:return-from-cleaning',
  'inventory:get-quantity-products',
  'inventory:create-quantity-product',
  'inventory:update-quantity-product',
  'inventory:delete-quantity-product',
  'inventory:get-product-variants',
  'inventory:adjust-stock',
  'inventory:transfer-stock',
  'inventory:get-stock-ledger',
  'booking:check-availability',
  'booking:create',
  'booking:get-list',
  'booking:get-details',
  'booking:update-status',
  'booking:schedule-fitting',
  'booking:mark-prepared',
  'booking:handover',
  'booking:return',
  'booking:cancel',
  'sales:create-direct-sale',
  'sales:get-list',
  'sales:get-details',
  'sales:lookup-barcode',
  'sales:get-catalog',
  'sales:process-return',
  'customers:get-list',
  'customers:create',
  'customers:update',
  'customers:get-details',
  'customers:get-history',
  'finance:get-cash-session',
  'finance:open-cash-session',
  'finance:close-cash-session',
  'finance:get-sessions-list',
  'finance:record-payment',
  'finance:record-expense',
  'finance:get-expenses',
  'finance:get-expense-categories',
  'finance:create-expense-category',
  'finance:record-cash-adjustment',
  'finance:get-escrow-deposits',
  'finance:get-summary',
  'tasks:get-list',
  'tasks:create',
  'tasks:complete',
  'tasks:get-alerts',
  'tasks:generate-from-bookings',
  'tasks:get-returns-due',
  'notifications:get-list',
  'notifications:mark-read',
  'whatsapp:generate-link',
  'whatsapp:get-templates',
  'whatsapp:get-status',
  'whatsapp:open-pairing',
  'whatsapp:hide-pairing',
  'whatsapp:disconnect',
  'whatsapp:send-direct',
  'whatsapp:run-auto-alerts',
  'reports:get-profit-loss',
  'reports:get-stock-summary',
  'reports:get-occupancy',
  'reports:get-top-customers',
  'reports:get-low-stock',
  'print:invoice',
  'print:receipt',
  'print:rental-contract',
  'print:get-printers',
  'backup:create-local',
  'backup:restore-local',
  'backup:verify',
  'backup:sync-google-drive',
  'backup:gdrive-list-backups',
  'backup:gdrive-restore',
  'backup:get-gdrive-history',
  'backup:open-gdrive-url',
  'backup:gdrive-get-status',
  'backup:gdrive-start-auth',
  'backup:gdrive-disconnect',
  'backup:get-info',
  'backup:open-folder',
  'backup:select-file',
  'system:reset-database',
  'update:check',
  'update:download',
  'update:apply',
  'update:get-status'
]);

function sanitizePayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);
  
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // Strip prototype pollution keys
    }
    clean[key] = sanitizePayload(obj[key]);
  }
  return clean;
}

class IpcRouter {
  constructor() {
    this.handlers = new Map();
  }

  register(channel, handler) {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`Security Violation: Channel "${channel}" is not in the IPC Allowlist!`);
    }
    this.handlers.set(channel, handler);
    logger.debug(`Registered IPC Handler for channel: ${channel}`);
  }

  async dispatch(channel, payload, event) {
    const startTime = Date.now();
    logger.info(`IPC Request received on [${channel}]`);

    // 1. Allowlist verification
    if (!ALLOWED_CHANNELS.has(channel)) {
      logger.warn(`Rejected unauthorized IPC channel attempt: [${channel}]`);
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED_CHANNEL',
          message: `القناة المطلوبة [${channel}] غير مصرح بها أمنيًا.`
        },
        timestamp: new Date().toISOString()
      };
    }

    // 2. Check handler existence
    const handler = this.handlers.get(channel);
    if (!handler) {
      logger.warn(`No handler registered for channel [${channel}]`);
      return {
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: `الخدمة المرتبطة بالقناة [${channel}] لم تسجل بعد.`
        },
        timestamp: new Date().toISOString()
      };
    }

    // 3. Execute handler with safe error handling
    try {
      const cleanPayload = sanitizePayload(payload);
      const result = await handler(cleanPayload, event);
      const duration = Date.now() - startTime;
      logger.info(`IPC Request on [${channel}] completed successfully in ${duration}ms`);
      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(`IPC Handler error on [${channel}] after ${duration}ms:`, {
        error: err.message,
        stack: err.stack
      });

      return {
        success: false,
        error: {
          code: err.code || 'HANDLER_EXECUTION_ERROR',
          message: err.message || 'حدث خطأ أثناء معالجة الطلب في الخادم المكتبي.'
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  attachToElectronIpc(ipcMain) {
    ipcMain.handle('app:ipc-bridge', async (event, request) => {
      if (!request || typeof request !== 'object' || !request.channel) {
        return {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'صيغة الطلب غير صالحة. يجب توفير اسم القناة channel.'
          },
          timestamp: new Date().toISOString()
        };
      }

      return await this.dispatch(request.channel, request.payload, event);
    });
    logger.info('Attached central IPC bridge router to electron ipcMain.');
  }
}

const ipcRouter = new IpcRouter();

module.exports = { ipcRouter, IpcRouter, ALLOWED_CHANNELS };

