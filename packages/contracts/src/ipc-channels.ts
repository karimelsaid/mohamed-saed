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
  
  // Settings & Administration
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  ADMIN_GET_CATEGORIES: 'admin:get-categories',
  ADMIN_CREATE_CATEGORY: 'admin:create-category',
  ADMIN_UPDATE_CATEGORY: 'admin:update-category',
  ADMIN_GET_WAREHOUSES: 'admin:get-warehouses',
  ADMIN_CREATE_WAREHOUSE: 'admin:create-warehouse',
  ADMIN_SET_DEFAULT_WAREHOUSE: 'admin:set-default-warehouse',
  ADMIN_GET_SIZES: 'admin:get-sizes',
  ADMIN_CREATE_SIZE: 'admin:create-size',
  ADMIN_GET_COLORS: 'admin:get-colors',
  ADMIN_CREATE_COLOR: 'admin:create-color',
  ADMIN_GET_POLICIES: 'admin:get-policies',
  ADMIN_UPDATE_POLICIES: 'admin:update-policies',

  // Database & Migrations
  DB_CHECK_INTEGRITY: 'db:check-integrity',
  DB_GET_SCHEMA_VERSION: 'db:get-schema-version',
  
  // Inventory (Suits, Shoes, Accessories)
  INVENTORY_GET_SUIT_MODELS: 'inventory:get-suit-models',
  INVENTORY_GET_SUIT_UNITS: 'inventory:get-suit-units',
  INVENTORY_CREATE_SUIT_MODEL: 'inventory:create-suit-model',
  INVENTORY_CREATE_SUIT_UNIT: 'inventory:create-suit-unit',
  INVENTORY_UPDATE_UNIT_STATUS: 'inventory:update-unit-status',
  INVENTORY_GET_UNIT_HISTORY: 'inventory:get-unit-history',
  INVENTORY_SEND_TO_CLEANING: 'inventory:send-to-cleaning',
  INVENTORY_RETURN_FROM_CLEANING: 'inventory:return-from-cleaning',
  INVENTORY_GET_QUANTITY_PRODUCTS: 'inventory:get-quantity-products',
  INVENTORY_CREATE_QUANTITY_PRODUCT: 'inventory:create-quantity-product',
  INVENTORY_GET_PRODUCT_VARIANTS: 'inventory:get-product-variants',
  INVENTORY_ADJUST_STOCK: 'inventory:adjust-stock',
  INVENTORY_TRANSFER_STOCK: 'inventory:transfer-stock',
  INVENTORY_GET_STOCK_LEDGER: 'inventory:get-stock-ledger',
  
  // Bookings & Rentals
  BOOKING_CHECK_AVAILABILITY: 'booking:check-availability',
  BOOKING_CREATE: 'booking:create',
  BOOKING_GET_LIST: 'booking:get-list',
  BOOKING_GET_DETAILS: 'booking:get-details',
  BOOKING_UPDATE_STATUS: 'booking:update-status',
  BOOKING_SCHEDULE_FITTING: 'booking:schedule-fitting',
  BOOKING_MARK_PREPARED: 'booking:mark-prepared',
  BOOKING_HANDOVER: 'booking:handover',
  BOOKING_RETURN: 'booking:return',
  BOOKING_CANCEL: 'booking:cancel',
  
  // POS & Sales
  SALES_CREATE_DIRECT_SALE: 'sales:create-direct-sale',
  SALES_GET_LIST: 'sales:get-list',
  SALES_GET_DETAILS: 'sales:get-details',
  SALES_LOOKUP_BARCODE: 'sales:lookup-barcode',
  SALES_GET_CATALOG: 'sales:get-catalog',
  SALES_PROCESS_RETURN: 'sales:process-return',
  
  // Customers
  CUSTOMERS_GET_LIST: 'customers:get-list',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_GET_DETAILS: 'customers:get-details',
  CUSTOMERS_GET_HISTORY: 'customers:get-history',
  
  // Finance & Cash
  FINANCE_GET_CASH_SESSION: 'finance:get-cash-session',
  FINANCE_OPEN_CASH_SESSION: 'finance:open-cash-session',
  FINANCE_CLOSE_CASH_SESSION: 'finance:close-cash-session',
  FINANCE_GET_SESSIONS_LIST: 'finance:get-sessions-list',
  FINANCE_RECORD_PAYMENT: 'finance:record-payment',
  FINANCE_RECORD_EXPENSE: 'finance:record-expense',
  FINANCE_GET_EXPENSES: 'finance:get-expenses',
  FINANCE_GET_EXPENSE_CATEGORIES: 'finance:get-expense-categories',
  FINANCE_CREATE_EXPENSE_CATEGORY: 'finance:create-expense-category',
  FINANCE_RECORD_CASH_ADJUSTMENT: 'finance:record-cash-adjustment',
  FINANCE_GET_ESCROW_DEPOSITS: 'finance:get-escrow-deposits',
  FINANCE_GET_SUMMARY: 'finance:get-summary',
  
  // Tasks & Notifications
  TASKS_GET_LIST: 'tasks:get-list',
  TASKS_CREATE: 'tasks:create',
  TASKS_COMPLETE: 'tasks:complete',
  TASKS_GET_ALERTS: 'tasks:get-alerts',
  TASKS_GENERATE_FROM_BOOKINGS: 'tasks:generate-from-bookings',
  NOTIFICATIONS_GET_LIST: 'notifications:get-list',
  NOTIFICATIONS_MARK_READ: 'notifications:mark-read',
  WHATSAPP_GENERATE_LINK: 'whatsapp:generate-link',
  WHATSAPP_GET_TEMPLATES: 'whatsapp:get-templates',
  WHATSAPP_GET_STATUS: 'whatsapp:get-status',
  WHATSAPP_OPEN_PAIRING: 'whatsapp:open-pairing',
  WHATSAPP_HIDE_PAIRING: 'whatsapp:hide-pairing',
  WHATSAPP_DISCONNECT: 'whatsapp:disconnect',
  WHATSAPP_SEND_DIRECT: 'whatsapp:send-direct',
  WHATSAPP_RUN_AUTO_ALERTS: 'whatsapp:run-auto-alerts',
  
  // Reports
  REPORTS_GET_PROFIT_LOSS: 'reports:get-profit-loss',
  REPORTS_GET_STOCK_SUMMARY: 'reports:get-stock-summary',
  REPORTS_GET_OCCUPANCY: 'reports:get-occupancy',
  REPORTS_GET_TOP_CUSTOMERS: 'reports:get-top-customers',
  REPORTS_GET_LOW_STOCK: 'reports:get-low-stock',
  
  // Printing
  PRINT_INVOICE: 'print:invoice',
  PRINT_RECEIPT: 'print:receipt',
  PRINT_RENTAL_CONTRACT: 'print:rental-contract',
  PRINT_GET_PRINTERS: 'print:get-printers',
  
  // Backup & Restore
  BACKUP_CREATE_LOCAL: 'backup:create-local',
  BACKUP_RESTORE_LOCAL: 'backup:restore-local',
  BACKUP_VERIFY: 'backup:verify',
  BACKUP_SYNC_GOOGLE_DRIVE: 'backup:sync-google-drive',
  BACKUP_GDRIVE_LIST: 'backup:gdrive-list-backups',
  BACKUP_GDRIVE_RESTORE: 'backup:gdrive-restore',

  // Auto Update Engine
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_APPLY: 'update:apply',
  UPDATE_GET_STATUS: 'update:get-status'
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

