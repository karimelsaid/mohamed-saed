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
  'admin:get-warehouses',
  'admin:create-warehouse',
  'admin:set-default-warehouse',
  'admin:get-sizes',
  'admin:create-size',
  'admin:get-colors',
  'admin:create-color',
  'admin:get-policies',
  'admin:update-policies',
  'db:check-integrity',
  'db:get-schema-version',
  'inventory:get-suit-models',
  'inventory:get-suit-units',
  'inventory:create-suit-model',
  'inventory:create-suit-unit',
  'inventory:update-unit-status',
  'inventory:get-unit-history',
  'inventory:send-to-cleaning',
  'inventory:return-from-cleaning',
  'inventory:get-quantity-products',
  'inventory:create-quantity-product',
  'inventory:get-product-variants',
  'inventory:adjust-stock',
  'inventory:transfer-stock',
  'inventory:get-stock-ledger',
  'booking:check-availability',
  'booking:create',
  'booking:get-list',
  'booking:get-details',
  'booking:update-status',
  'booking:handover',
  'booking:return',
  'sales:create-direct-sale',
  'sales:get-list',
  'sales:process-return',
  'customers:get-list',
  'customers:create',
  'customers:update',
  'customers:get-history',
  'finance:get-cash-session',
  'finance:open-cash-session',
  'finance:close-cash-session',
  'finance:record-payment',
  'finance:record-expense',
  'finance:get-summary',
  'tasks:get-list',
  'tasks:create',
  'tasks:complete',
  'tasks:get-alerts',
  'reports:get-profit-loss',
  'reports:get-stock-summary',
  'reports:get-occupancy',
  'print:invoice',
  'print:receipt',
  'print:rental-contract',
  'print:get-printers',
  'backup:create-local',
  'backup:restore-local',
  'backup:verify',
  'backup:sync-google-drive'
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
  
  platform: process.platform,
  isElectron: true
});

