const { contextBridge, ipcRenderer } = require('electron');

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

// Expose safe, isolated API to Renderer
contextBridge.exposeInMainWorld('electronApi', {
  invoke: async (channel, payload) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      console.error(`[Preload Security] Blocked unallowed channel invocation: ${channel}`);
      return {
        success: false,
        error: {
          code: 'CLIENT_BLOCKED_CHANNEL',
          message: `القناة [${channel}] غير مسموح باستدعائها من واجهة المستخدم.`
        },
        timestamp: new Date().toISOString()
      };
    }

    try {
      return await ipcRenderer.invoke('app:ipc-bridge', { channel, payload });
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'IPC_DISPATCH_FAILURE',
          message: err.message
        },
        timestamp: new Date().toISOString()
      };
    }
  },

  on: (channel, listener) => {
    const validChannels = ['whatsapp:paired'];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => listener(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  
  platform: process.platform,
  isElectron: true
});

