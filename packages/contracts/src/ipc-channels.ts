/**
 * قنوات التواصل IPC المسموح بها في النظام (IPC Channels Allowlist)
 * مع حماية صارمة لمنع استدعاء أي قناة غير مسجلة هنا.
 */
export const IPC_CHANNELS = {
  // App & System
  APP_GET_INFO: 'app:get-info',
  APP_GET_SYSTEM_HEALTH: 'app:get-system-health',
  APP_LOCK_SCREEN: 'app:lock-screen',
  APP_VERIFY_PIN: 'app:verify-pin',
  
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // Database & Migrations
  DB_CHECK_INTEGRITY: 'db:check-integrity',
  DB_GET_SCHEMA_VERSION: 'db:get-schema-version',
  
  // Inventory (Suits, Shoes, Accessories)
  INVENTORY_GET_SUIT_MODELS: 'inventory:get-suit-models',
  INVENTORY_GET_SUIT_UNITS: 'inventory:get-suit-units',
  INVENTORY_CREATE_SUIT_MODEL: 'inventory:create-suit-model',
  INVENTORY_CREATE_SUIT_UNIT: 'inventory:create-suit-unit',
  INVENTORY_UPDATE_UNIT_STATUS: 'inventory:update-unit-status',
  INVENTORY_GET_QUANTITY_PRODUCTS: 'inventory:get-quantity-products',
  INVENTORY_ADJUST_STOCK: 'inventory:adjust-stock',
  
  // Bookings & Rentals
  BOOKING_CHECK_AVAILABILITY: 'booking:check-availability',
  BOOKING_CREATE: 'booking:create',
  BOOKING_GET_LIST: 'booking:get-list',
  BOOKING_GET_DETAILS: 'booking:get-details',
  BOOKING_UPDATE_STATUS: 'booking:update-status',
  BOOKING_HANDOVER: 'booking:handover',
  BOOKING_RETURN: 'booking:return',
  
  // POS & Sales
  SALES_CREATE_DIRECT_SALE: 'sales:create-direct-sale',
  SALES_GET_LIST: 'sales:get-list',
  SALES_PROCESS_RETURN: 'sales:process-return',
  
  // Customers
  CUSTOMERS_GET_LIST: 'customers:get-list',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_GET_HISTORY: 'customers:get-history',
  
  // Finance & Cash
  FINANCE_GET_CASH_SESSION: 'finance:get-cash-session',
  FINANCE_OPEN_CASH_SESSION: 'finance:open-cash-session',
  FINANCE_CLOSE_CASH_SESSION: 'finance:close-cash-session',
  FINANCE_RECORD_PAYMENT: 'finance:record-payment',
  FINANCE_RECORD_EXPENSE: 'finance:record-expense',
  FINANCE_GET_SUMMARY: 'finance:get-summary',
  
  // Tasks & Notifications
  TASKS_GET_LIST: 'tasks:get-list',
  TASKS_CREATE: 'tasks:create',
  TASKS_COMPLETE: 'tasks:complete',
  TASKS_GET_ALERTS: 'tasks:get-alerts',
  
  // Reports
  REPORTS_GET_PROFIT_LOSS: 'reports:get-profit-loss',
  REPORTS_GET_STOCK_SUMMARY: 'reports:get-stock-summary',
  REPORTS_GET_OCCUPANCY: 'reports:get-occupancy',
  
  // Printing
  PRINT_INVOICE: 'print:invoice',
  PRINT_RECEIPT: 'print:receipt',
  PRINT_RENTAL_CONTRACT: 'print:rental-contract',
  PRINT_GET_PRINTERS: 'print:get-printers',
  
  // Backup & Restore
  BACKUP_CREATE_LOCAL: 'backup:create-local',
  BACKUP_RESTORE_LOCAL: 'backup:restore-local',
  BACKUP_VERIFY: 'backup:verify',
  BACKUP_SYNC_GOOGLE_DRIVE: 'backup:sync-google-drive'
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

export const ALLOWED_IPC_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(IPC_CHANNELS)
);

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export function createSuccessResponse<T>(data: T): IpcResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
}

export function createErrorResponse(code: string, message: string, details?: unknown): IpcResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details
    },
    timestamp: new Date().toISOString()
  };
}
