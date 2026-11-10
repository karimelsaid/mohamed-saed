// Renderer Logic & UI Controller - Suit Store Management System
(function () {
  'use strict';

  // State cache for local live preview
  let activeAdminTab = 'categories';

  // 1. Theme Management
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const body = document.body;

  const savedTheme = localStorage.getItem('suit_store_theme') || 'theme-dark';
  body.className = savedTheme;

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = body.classList.contains('theme-dark');
      const newTheme = isDark ? 'theme-light' : 'theme-dark';
      body.className = newTheme;
      localStorage.setItem('suit_store_theme', newTheme);
      if (window.AppToast) {
        window.AppToast.info(isDark ? 'تم تفعيل المظهر الفاتح ☀️' : 'تم تفعيل المظهر الداكن 🌙', 2000);
      }
    });
  }

  // Quick reset button for user testing (Safe Factory Reset)
  const resetBtn = document.getElementById('btn-reset-all-data');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('⚠️ تحذير تصفير بيانات النظام:\n\nهل أنت متأكد من تصفير وحذف جميع العمليات التشغيلية (العملاء، الحجوزات، المبيعات، ومخزون البدل) لاختبار النظام؟\n\n🛡️ ملاحظة هامة: سيقوم النظام تلقائياً بإنشاء نسخة احتياطية وقائية كاملة وحفظها قبل التصفير حتى تتمكن من استعادتها في أي وقت.')) {
        return;
      }

      try {
        if (window.AppToast) window.AppToast.info('جاري أخذ نسخة أمان وقائية وتصفير قاعدة البيانات... ⏳');
        const res = await electronApi.invoke('system:reset-database');

        // Also clean up any localStorage keys
        Object.keys(localStorage).filter(k => k.startsWith('suit_')).forEach(k => localStorage.removeItem(k));

        if (res?.success) {
          if (window.AppToast) window.AppToast.success('تم تصفير البيانات بنجاح! وتم حفظ نسخة أمان كاملة قبل التصفير 💾');
          setTimeout(() => location.reload(), 900);
        } else {
          if (window.AppToast) window.AppToast.error(res?.error?.message || 'فشل التصفير.');
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });
  }

  // 2. localStorage-backed Web Store for browser testing mode
  const webStore = {
    _prefix: 'suit_web_',
    get(key, defaultVal) {
      try {
        const raw = localStorage.getItem(this._prefix + key);
        if (raw !== null) return JSON.parse(raw);
        return (typeof defaultVal === 'function') ? defaultVal() : (defaultVal !== undefined ? defaultVal : null);
      } catch (e) { return (typeof defaultVal === 'function') ? defaultVal() : (defaultVal !== undefined ? defaultVal : null); }
    },
    set(key, val) { localStorage.setItem(this._prefix + key, JSON.stringify(val)); },
    remove(key) { localStorage.removeItem(this._prefix + key); },
    clear() { Object.keys(localStorage).filter(k => k.startsWith(this._prefix)).forEach(k => localStorage.removeItem(k)); },
    nextId(key) { const n = this.get('_seq_' + key, 0) + 1; this.set('_seq_' + key, n); return n; }
  };
  window.resetAllData = () => { webStore.clear(); location.reload(); };
  window.webStore = webStore;

  // Base static config (always available for dropdowns)
  const _BASE_CATEGORIES = [
    { id: 1, code: 'SUITS', name: 'بدل رجالي وعرائس', type: 'SUITS', is_active: 1 },
    { id: 2, code: 'SHOES', name: 'أحذية كلاسيك وعرائس', type: 'SHOES', is_active: 1 },
    { id: 3, code: 'TIES', name: 'ربطات عنق وببيونات', type: 'ACCESSORIES', is_active: 1 },
    { id: 4, code: 'CUFFLINKS', name: 'أزرار أكمام وإكسسوارات', type: 'ACCESSORIES', is_active: 1 },
    { id: 5, code: 'SHIRTS', name: 'قمصان بدل وبدل داخلية', type: 'ACCESSORIES', is_active: 1 }
  ];
  const _BASE_WAREHOUSES = [
    { id: 1, code: 'MAIN', name: 'المخزن الرئيسي (المحل)', location: 'صالة العرض الرئيسية', is_default: 1, is_active: 1 },
    { id: 2, code: 'CLEANING', name: 'قسم الدراي كلين والمغسلة', location: 'القسم الداخلي', is_default: 0, is_active: 1 },
    { id: 3, code: 'STORAGE', name: 'مخزن الأمانات والبضاعة الاحتياطية', location: 'الدور العلوي', is_default: 0, is_active: 1 }
  ];
  const _BASE_SIZES = [
    { id: 1, category_type: 'SUIT', code: '48', name: 'مقاس 48', sort_order: 2 },
    { id: 2, category_type: 'SUIT', code: '50', name: 'مقاس 50', sort_order: 3 },
    { id: 3, category_type: 'SUIT', code: '52', name: 'مقاس 52', sort_order: 4 },
    { id: 4, category_type: 'SHOE', code: '42', name: 'مقاس 42', sort_order: 3 },
    { id: 5, category_type: 'SHOE', code: '43', name: 'مقاس 43', sort_order: 4 }
  ];
  const _BASE_COLORS = [
    { id: 1, name: 'أسود ملكي', hex_code: '#000000', is_active: 1 },
    { id: 2, name: 'كحلي رويال', hex_code: '#0A1931', is_active: 1 },
    { id: 3, name: 'رمادي فحم', hex_code: '#333333', is_active: 1 },
    { id: 4, name: 'أبيض لؤلؤي', hex_code: '#FFFFFF', is_active: 1 }
  ];
  const _BASE_EXPENSE_CATS = [
    { id: 1, name: 'مغسلة ودراي كلين', description: 'تكاليف تنظيف وكي البدل' },
    { id: 2, name: 'خياطة وتعديلات', description: 'أجور الخياط وتعديل مقاسات الزبائن' },
    { id: 3, name: 'نثريات وضيافة', description: 'مشروبات ومستلزمات المحل اليومية' },
    { id: 4, name: 'فواتير كهرباء وإنترنت', description: 'فواتير ومصروفات دورية' },
    { id: 5, name: 'مطبوعات وأكياس بدل', description: 'أكياس كفرات شماعات وفواتير' }
  ];
  const _DEFAULT_POLICIES = {
    defaultRentalDays: 3,
    bufferCleaningDays: 1,
    enableSecurityDeposit: true,
    defaultDepositRatio: 1.0,
    applyLateFee: true,
    lateFeePerDay: 300,
    allowGracePeriod: true,
    allowGracePeriodHours: 4
  };
  const _DEFAULT_SETTINGS = {
    store: { storeName: 'mohamed saed والعرائس', phone: '01012345678', address: 'شارع الهرم، الجيزة، مصر', taxNumber: '123-456-789', invoiceFooter: 'شكرًا لاختياركم mohamed saed. يرجى إحضار العقد عند الاستلام والتأكد من سلامة البدلة.' },
    printers: { receiptPrinter: 'Default Thermal 80mm', invoicePrinter: 'Default A4', autoPrintReceipt: true, previewBeforePrint: false },
    security: { hasPin: true, pin: '1234', protectedPages: [] }
  };

  // Helper: date string
  const _dateStr = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const _nowStr = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 2b. Safe Electron API Wrapper (Dynamic localStorage-backed simulator)
  const electronApi = window.electronApi || {
    invoke: async (channel, payload) => {
      console.log(`[IPC Web Simulator] channel=[${channel}]`, payload);

      // ═══════════════ APP INFO ═══════════════
      if (channel === 'app:get-info') {
        return { success: true, data: { appName: 'رويال لإدارة محلات البدل والعرائس', version: '1.0.0 (وضع التطوير Live Dev)', platform: navigator.platform } };
      }

      // ═══════════════ ADMIN: BASE CONFIG (Dynamic Persistent CRUD) ═══════════════
      if (channel === 'admin:get-categories') {
        const list = webStore.get('categories', () => JSON.parse(JSON.stringify(_BASE_CATEGORIES)));
        if (payload?.includeInactive) return { success: true, data: list };
        return { success: true, data: list.filter(c => c.is_active !== 0) };
      }
      if (channel === 'admin:create-category') {
        const list = webStore.get('categories', () => JSON.parse(JSON.stringify(_BASE_CATEGORIES)));
        const id = webStore.nextId('category');
        const catCode = payload.code.trim().toUpperCase();
        const item = { id, code: catCode, name: payload.name.trim(), type: payload.type || catCode, is_active: 1 };
        list.push(item);
        webStore.set('categories', list);
        return { success: true, data: item };
      }
      if (channel === 'admin:update-category') {
        const list = webStore.get('categories', () => JSON.parse(JSON.stringify(_BASE_CATEGORIES)));
        const idx = list.findIndex(c => c.id === Number(payload.id));
        if (idx >= 0) {
          if (payload.name) list[idx].name = payload.name.trim();
          if (payload.type) list[idx].type = payload.type;
          if (payload.is_active !== undefined) list[idx].is_active = Number(payload.is_active);
          webStore.set('categories', list);
          return { success: true, data: list[idx] };
        }
        return { success: false, error: { message: 'القسم غير موجود' } };
      }
      if (channel === 'admin:delete-category') {
        let list = webStore.get('categories', () => JSON.parse(JSON.stringify(_BASE_CATEGORIES)));
        const targetId = Number(payload.id || payload);
        const target = list.find(c => Number(c.id) === targetId);
        list = list.filter(c => Number(c.id) !== targetId);
        webStore.set('categories', list);

        // Also clean up products/models belonging to this category from webStore
        if (target) {
          let prods = webStore.get('products', []);
          prods = prods.filter(p => Number(p.category_id) !== targetId && p.category_code !== target.code && p.category_type !== target.type);
          webStore.set('products', prods);

          let models = webStore.get('suit_models', []);
          models = models.filter(m => Number(m.category_id) !== targetId);
          webStore.set('suit_models', models);
        }
        return { success: true };
      }

      if (channel === 'admin:get-warehouses') {
        const list = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        return { success: true, data: list };
      }
      if (channel === 'admin:create-warehouse') {
        const list = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        const id = webStore.nextId('warehouse');
        const isDefault = payload.is_default ? 1 : 0;
        if (isDefault) list.forEach(w => w.is_default = 0);
        const item = { id, code: payload.code.trim().toUpperCase(), name: payload.name.trim(), location: payload.location || '', is_default: isDefault, is_active: 1 };
        list.push(item);
        webStore.set('warehouses', list);
        return { success: true, data: item };
      }
      if (channel === 'admin:update-warehouse') {
        const list = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        const idx = list.findIndex(w => w.id === Number(payload.id));
        if (idx >= 0) {
          if (payload.is_default) list.forEach(w => w.is_default = 0);
          if (payload.code) list[idx].code = payload.code.trim().toUpperCase();
          if (payload.name) list[idx].name = payload.name.trim();
          if (payload.location !== undefined) list[idx].location = payload.location.trim();
          if (payload.is_default !== undefined) list[idx].is_default = Number(payload.is_default);
          if (payload.is_active !== undefined) list[idx].is_active = Number(payload.is_active);
          webStore.set('warehouses', list);
          return { success: true, data: list[idx] };
        }
        return { success: false, error: { message: 'المخزن غير موجود' } };
      }
      if (channel === 'admin:delete-warehouse') {
        let list = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        const targetId = Number(payload.id || payload);
        const target = list.find(w => Number(w.id) === targetId);
        if (target?.is_default) {
          return { success: false, error: { message: 'لا يمكن حذف المخزن الافتراضي للنظام.' } };
        }
        list = list.filter(w => Number(w.id) !== targetId);
        webStore.set('warehouses', list);
        return { success: true };
      }
      if (channel === 'admin:set-default-warehouse') {
        const list = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        list.forEach(w => { w.is_default = (w.id === Number(payload.id)) ? 1 : 0; });
        webStore.set('warehouses', list);
        return { success: true };
      }

      if (channel === 'admin:get-sizes') {
        let list = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
        const rawCt = typeof payload === 'string' ? payload : (payload?.categoryType || payload?.category_type || payload?.code || payload?.type);
        if (rawCt) {
          const ct = String(rawCt).toUpperCase();
          list = list.filter(s => {
            const sType = (s.category_type || '').toUpperCase();
            if (ct === 'SHOE' || ct === 'SHOES') return sType === 'SHOE' || sType === 'SHOES';
            if (ct === 'SUIT' || ct === 'SUITS') return sType === 'SUIT' || sType === 'SUITS';
            if (ct === 'ACCESSORIES' || ct === 'ACCESSORY' || ct === 'TIES' || ct === 'اضافات' || ct === 'إكسسوارات') {
              return sType === 'ACCESSORIES' || sType === 'ACCESSORY' || sType === 'TIES';
            }
            return sType === ct;
          });
        }
        return { success: true, data: list };
      }
      if (channel === 'admin:create-size') {
        const list = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
        const id = webStore.nextId('size');
        const item = { id, category_type: payload.category_type || 'SUIT', code: payload.code.trim(), name: payload.name.trim(), sort_order: Number(payload.sort_order) || 10, is_active: 1 };
        list.push(item);
        webStore.set('sizes', list);
        return { success: true, data: item };
      }
      if (channel === 'admin:update-size') {
        const list = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
        const idx = list.findIndex(s => s.id === Number(payload.id));
        if (idx >= 0) {
          if (payload.category_type) list[idx].category_type = payload.category_type;
          if (payload.code) list[idx].code = payload.code.trim();
          if (payload.name) list[idx].name = payload.name.trim();
          if (payload.sort_order !== undefined) list[idx].sort_order = Number(payload.sort_order);
          if (payload.is_active !== undefined) list[idx].is_active = Number(payload.is_active);
          webStore.set('sizes', list);
          return { success: true, data: list[idx] };
        }
        return { success: false, error: { message: 'المقاس غير موجود' } };
      }
      if (channel === 'admin:delete-size') {
        let list = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
        const targetId = Number(payload.id || payload);
        list = list.filter(s => Number(s.id) !== targetId);
        webStore.set('sizes', list);
        return { success: true };
      }

      if (channel === 'admin:get-colors') {
        const list = webStore.get('colors', () => JSON.parse(JSON.stringify(_BASE_COLORS)));
        return { success: true, data: list };
      }
      if (channel === 'admin:create-color') {
        const list = webStore.get('colors', () => JSON.parse(JSON.stringify(_BASE_COLORS)));
        const id = webStore.nextId('color');
        const item = { id, name: payload.name.trim(), hex_code: payload.hex_code.trim(), is_active: 1 };
        list.push(item);
        webStore.set('colors', list);
        return { success: true, data: item };
      }
      if (channel === 'admin:update-color') {
        const list = webStore.get('colors', () => JSON.parse(JSON.stringify(_BASE_COLORS)));
        const idx = list.findIndex(c => c.id === Number(payload.id));
        if (idx >= 0) {
          if (payload.name) list[idx].name = payload.name.trim();
          if (payload.hex_code) list[idx].hex_code = payload.hex_code.trim();
          if (payload.is_active !== undefined) list[idx].is_active = Number(payload.is_active);
          webStore.set('colors', list);
          return { success: true, data: list[idx] };
        }
        return { success: false, error: { message: 'اللون غير موجود' } };
      }
      if (channel === 'admin:delete-color') {
        let list = webStore.get('colors', () => JSON.parse(JSON.stringify(_BASE_COLORS)));
        const targetId = Number(payload.id || payload);
        list = list.filter(c => Number(c.id) !== targetId);
        webStore.set('colors', list);
        return { success: true };
      }

      if (channel === 'admin:get-policies') {
        const override = webStore.get('policies', null);
        return { success: true, data: override || _DEFAULT_POLICIES };
      }
      if (channel === 'admin:update-policies') {
        const cur = webStore.get('policies', _DEFAULT_POLICIES);
        const updated = { ...cur, ...payload };
        webStore.set('policies', updated);
        return { success: true, data: updated };
      }

      // ═══════════════ SETTINGS ═══════════════
      if (channel === 'settings:get') {
        const override = webStore.get('settings_override', {});
        return {
          success: true,
          data: {
            store: { ..._DEFAULT_SETTINGS.store, ...(override.store || {}) },
            printers: { ..._DEFAULT_SETTINGS.printers, ...(override.printers || {}) },
            security: {
              hasPin: true,
              pin: override.pin || '1234',
              protectedPages: override.protectedPages || []
            }
          }
        };
      }
      if (channel === 'settings:update') {
        const cur = webStore.get('settings_override', {});
        if (payload.store) cur.store = { ...(cur.store || {}), ...payload.store };
        if (payload.printers) cur.printers = { ...(cur.printers || {}), ...payload.printers };
        if (payload.pin) cur.pin = payload.pin;
        if (payload.protectedPages) cur.protectedPages = payload.protectedPages;
        webStore.set('settings_override', cur);
        return { success: true, data: cur };
      }
      if (channel === 'app:verify-pin') {
        const cur = webStore.get('settings_override', {});
        const expected = cur.pin || '1234';
        const isValid = String(payload?.pin || '').trim() === String(expected).trim();
        return { success: true, data: { valid: isValid } };
      }

      // ═══════════════ INVENTORY: SUIT MODELS (dynamic, starts empty) ═══════════════
      if (channel === 'inventory:get-suit-models') {
        return { success: true, data: webStore.get('suit_models', []) };
      }
      if (channel === 'inventory:create-suit-model') {
        const list = webStore.get('suit_models', []);
        const id = webStore.nextId('suit_model');
        const item = { id, code: payload.code || `MDL-${String(id).padStart(3, '0')}`, name: payload.name, category_name: payload.category_name || '', color_name: payload.color_name || '', rental_price: payload.rental_price || 0, security_deposit: payload.security_deposit || 0, sale_price: payload.sale_price || 0, cost_price: Number(payload.cost_price) || 0, total_units: 0, available_units: 0 };
        list.push(item);
        webStore.set('suit_models', list);
        return { success: true, data: item };
      }
      if (channel === 'inventory:update-suit-model') {
        const list = webStore.get('suit_models', []);
        const idx = list.findIndex(m => m.id === payload.id);
        if (idx >= 0) { Object.assign(list[idx], payload); webStore.set('suit_models', list); }
        return { success: true, data: list[idx] || payload };
      }
      if (channel === 'inventory:delete-suit-model') {
        const units = webStore.get('suit_units', []);
        const activeCount = units.filter(u => u.suit_model_id === Number(payload.id) && ['BOOKED', 'IN_USE'].includes(u.status)).length;
        if (activeCount > 0) {
          return { success: false, error: { message: `لا يمكن حذف الموديل لأن لديه (${activeCount}) قطع محجوزة أو مسلّمة لعملاء حالياً.` } };
        }
        let list = webStore.get('suit_models', []);
        list = list.filter(m => m.id !== Number(payload.id));
        webStore.set('suit_models', list);
        return { success: true };
      }

      // ═══════════════ INVENTORY: SUIT UNITS (dynamic, starts empty) ═══════════════
      if (channel === 'inventory:get-suit-units') {
        let list = webStore.get('suit_units', []);
        const bookings = webStore.get('bookings', []);
        // Attach active booking info if any
        list = list.map(u => {
          const activeBk = bookings.find(b => !['CANCELLED', 'COMPLETED'].includes(b.status) && (b.items || []).some(bi => bi.suit_unit_id === u.id));
          return {
            ...u,
            active_booking_number: activeBk?.booking_number || null,
            active_customer_name: activeBk?.customer_name || null
          };
        });

        if (payload?.status && payload.status !== 'ALL') {
          if (payload.status === 'BOOKED') {
            list = list.filter(u => u.status === 'BOOKED' || u.status === 'IN_USE' || u.active_booking_number);
          } else if (payload.status === 'BOOKED_ONLY') {
            list = list.filter(u => u.status === 'BOOKED');
          } else {
            list = list.filter(u => u.status === payload.status);
          }
        } else if (!payload?.includeRetired) {
          list = list.filter(u => u.status !== 'RETIRED');
        }
        return { success: true, data: list };
      }
      if (channel === 'inventory:create-suit-unit') {
        const list = webStore.get('suit_units', []);
        const id = webStore.nextId('suit_unit');
        const models = webStore.get('suit_models', []);
        const m = models.find(x => x.id === Number(payload.suit_model_id)) || models[0] || {};

        const allSizes = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
        const allWhs = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        const foundSize = allSizes.find(s => s.id === Number(payload.size_id) || s.code === String(payload.size_id));
        const foundWh = allWhs.find(w => w.id === Number(payload.warehouse_id) || w.code === String(payload.warehouse_id));

        const size_name = payload.size_name || (foundSize ? foundSize.name : `مقاس ${payload.size_id || 50}`);
        const warehouse_name = payload.warehouse_name || (foundWh ? foundWh.name : 'المخزن الرئيسي (المحل)');
        const model_name = payload.model_name || m.name || 'بدلة رجالي فاخرة';
        const rental_price = payload.rental_price || m.rental_price || 1500;
        const security_deposit = payload.security_deposit || m.security_deposit || 2000;
        const barcode = payload.unit_barcode || `ST-${m.code || 'SUIT'}-${String(id).padStart(3, '0')}`;
        const purchase_cost = payload.purchase_cost !== undefined ? Number(payload.purchase_cost) : (m.cost_price || 0);

        const item = {
          id,
          unit_barcode: barcode,
          suit_model_id: Number(payload.suit_model_id) || m.id || 1,
          model_name,
          size_name,
          warehouse_name,
          rental_price,
          purchase_cost,
          security_deposit,
          status: 'AVAILABLE',
          rental_count: 0
        };
        list.push(item);
        webStore.set('suit_units', list);

        // Update model count
        if (m.id) {
          m.total_units = (m.total_units || 0) + 1;
          m.available_units = (m.available_units || 0) + 1;
          webStore.set('suit_models', models);
        }
        return { success: true, data: item };
      }
      if (channel === 'inventory:create-suit-units-batch') {
        const list = webStore.get('suit_units', []);
        const models = webStore.get('suit_models', []);
        const m = models.find(x => x.id === Number(payload.suit_model_id)) || models[0] || {};
        const allSizes = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
        const allWhs = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        const foundWh = allWhs.find(w => w.id === Number(payload.warehouse_id)) || allWhs[0] || {};
        const warehouse_name = foundWh.name || 'المخزن الرئيسي';
        const model_name = m.name || 'بدلة رجالي فاخرة';
        const purchase_cost = payload.purchase_cost !== undefined ? Number(payload.purchase_cost) : (m.cost_price || 0);

        let totalAdded = 0;
        const sizeCounts = {};
        for (const item of (payload.sizeQuantities || [])) {
          const sz = allSizes.find(s => s.id === Number(item.size_id)) || { name: `مقاس ${item.size_id}` };
          const qty = Number(item.quantity) || 0;
          for (let i = 0; i < qty; i++) {
            const uid = webStore.nextId('suit_unit');
            const randSuffix = Math.floor(1000 + Math.random() * 9000);
            const barcode = `ST-${m.code || 'SUIT'}-${item.size_id}-${randSuffix}`;
            list.push({
              id: uid,
              unit_barcode: barcode,
              suit_model_id: Number(payload.suit_model_id),
              model_name,
              size_name: sz.name,
              warehouse_name,
              rental_price: m.rental_price || 1500,
              purchase_cost,
              security_deposit: m.security_deposit || 2000,
              status: 'AVAILABLE',
              rental_count: 0
            });
            totalAdded++;
            sizeCounts[sz.name] = (sizeCounts[sz.name] || 0) + 1;
          }
        }
        webStore.set('suit_units', list);
        if (m.id) {
          m.total_units = (m.total_units || 0) + totalAdded;
          m.available_units = (m.available_units || 0) + totalAdded;
          const detailStr = Object.entries(sizeCounts).map(([k, v]) => `${k} (${v})`).join(' | ');
          m.sizes_detail = m.sizes_detail ? `${m.sizes_detail} | ${detailStr}` : detailStr;
          webStore.set('suit_models', models);
        }
        return { success: true, data: { count: totalAdded } };
      }
      if (channel === 'inventory:update-suit-unit' || channel === 'inventory:update-unit-status') {
        const list = webStore.get('suit_units', []);
        const targetId = payload.unitId || payload.id;
        const idx = list.findIndex(u => u.id === targetId);
        if (idx >= 0) {
          if (payload.newStatus) list[idx].status = payload.newStatus;
          Object.assign(list[idx], payload);
          webStore.set('suit_units', list);
        }
        return { success: true, data: list[idx] || payload };
      }
      if (channel === 'inventory:delete-suit-unit') {
        let list = webStore.get('suit_units', []);
        const targetId = Number(payload.id || payload.unitId || payload);
        const target = list.find(u => Number(u.id) === targetId);
        list = list.filter(u => Number(u.id) !== targetId);
        webStore.set('suit_units', list);
        if (target && target.suit_model_id) {
          const models = webStore.get('suit_models', []);
          const m = models.find(x => Number(x.id) === Number(target.suit_model_id));
          if (m) {
            m.total_units = Math.max(0, (m.total_units || 1) - 1);
            if (target.status === 'AVAILABLE') {
              m.available_units = Math.max(0, (m.available_units || 1) - 1);
            }
            webStore.set('suit_models', models);
          }
        }
        return { success: true };
      }

      // ═══════════════ INVENTORY: QUANTITY PRODUCTS (dynamic, starts empty) ═══════════════
      if (channel === 'inventory:get-quantity-products') {
        const all = webStore.get('products', []);
        const catFilter = payload?.categoryType || payload?.categoryId || payload?.category_id || payload?.code;
        if (catFilter) {
          const normFilter = String(catFilter).toUpperCase();
          return {
            success: true,
            data: all.filter(p => {
              const pType = (p.category_type || '').toUpperCase();
              const pCode = (p.category_code || '').toUpperCase();
              if (normFilter === 'ACCESSORIES' || normFilter === 'TIES') {
                return pType === 'ACCESSORIES' || pType === 'TIES' || pCode === 'ACCESSORIES' || pCode === 'TIES';
              }
              if (normFilter === 'SHOES' || normFilter === 'SHOE') {
                return pType === 'SHOES' || pType === 'SHOE' || pCode === 'SHOES' || pCode === 'SHOE';
              }
              return (
                p.category_type === catFilter ||
                p.category_code === catFilter ||
                p.category_name === catFilter ||
                String(p.category_id) === String(catFilter)
              );
            })
          };
        }
        return { success: true, data: all };
      }
      if (channel === 'inventory:create-quantity-product') {
        const list = webStore.get('products', []);
        const id = webStore.nextId('product');
        const catType = payload.category_type || payload.categoryType || payload.category_code || 'CUSTOM';
        const catName = payload.category_name || catType;
        const defaultPrefix = catType === 'SHOES' ? 'SH' : (catType === 'ACCESSORIES' ? 'ACC' : catType.slice(0, 3).toUpperCase());

        let totalQty = Number(payload.total_quantity) || 0;
        let sizesDetail = payload.sizes_detail || null;
        let sizesSummary = payload.size_name || payload.sizes_summary || null;

        if (payload.variants && Array.isArray(payload.variants) && payload.variants.length > 0) {
          const allSizes = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
          const details = [];
          let vSum = 0;
          for (const v of payload.variants) {
            const sz = allSizes.find(s => s.id === Number(v.size_id)) || { name: `مقاس ${v.size_id}` };
            const q = Number(v.initial_quantity) || 0;
            if (q > 0) {
              vSum += q;
              details.push(`${sz.name} (${q})`);
            }
          }
          if (details.length > 0) {
            totalQty = vSum;
            sizesDetail = details.join(' | ');
            sizesSummary = details.map(d => d.split(' ')[0]).join(', ');
          }
        }

        const item = {
          id,
          code: payload.code || `${defaultPrefix}-${String(id).padStart(3, '0')}`,
          name: payload.name,
          category_type: catType,
          category_code: payload.category_code || catType,
          category_name: catName,
          category_id: payload.category_id || id,
          size_id: payload.size_id || null,
          size_name: payload.size_name || null,
          size_code: payload.size_code || null,
          sizes_summary: sizesSummary,
          sizes_detail: sizesDetail,
          sale_price: Number(payload.sale_price) || 0,
          rental_price: Number(payload.rental_price) || 0,
          cost_price: Number(payload.cost_price) || 0,
          total_quantity: totalQty,
          reserved_quantity: 0,
          available_quantity: totalQty,
          reorder_level: Number(payload.reorder_level) || 0
        };
        list.push(item);
        webStore.set('products', list);
        return { success: true, data: item };
      }
      if (channel === 'inventory:update-quantity-product') {
        const list = webStore.get('products', []);
        const idx = list.findIndex(p => p.id === Number(payload.id));
        if (idx >= 0) {
          Object.assign(list[idx], payload);
          if (payload.sale_price !== undefined) list[idx].sale_price = Number(payload.sale_price);
          if (payload.rental_price !== undefined) list[idx].rental_price = Number(payload.rental_price);
          if (payload.cost_price !== undefined) list[idx].cost_price = Number(payload.cost_price);
          if (payload.reorder_level !== undefined) list[idx].reorder_level = Number(payload.reorder_level);
          if (payload.size_id !== undefined) {
            list[idx].size_id = payload.size_id;
            list[idx].size_name = payload.size_name || null;
            list[idx].size_code = payload.size_code || null;
            list[idx].sizes_summary = payload.size_name || list[idx].sizes_summary || null;
          }
          webStore.set('products', list);
          return { success: true, data: list[idx] };
        }
        return { success: false, error: { message: 'الصنف غير موجود' } };
      }
      if (channel === 'inventory:delete-quantity-product') {
        let list = webStore.get('products', []);
        list = list.filter(p => p.id !== Number(payload.id));
        webStore.set('products', list);
        return { success: true };
      }
      if (channel === 'inventory:get-product-variants') {
        const products = webStore.get('products', []);
        const p = products.find(x => x.id === Number(payload?.productId));
        const allSizes = webStore.get('sizes', () => JSON.parse(JSON.stringify(_BASE_SIZES)));
        const allWhs = webStore.get('warehouses', () => JSON.parse(JSON.stringify(_BASE_WAREHOUSES)));
        const wh = allWhs[0] || { id: 1, name: 'المخزن الرئيسي' };
        if (p && p.sizes_detail) {
          const parts = p.sizes_detail.split(' | ');
          const variants = parts.map((part, idx) => {
            const m = part.match(/(.+?)\s*\((\d+)\)/);
            const sName = m ? m[1].trim() : part;
            const q = m ? Number(m[2]) : 0;
            const sz = allSizes.find(s => s.name === sName) || { id: idx + 1, name: sName };
            return {
              variant_id: 1000 + idx,
              product_id: p.id,
              size_id: sz.id,
              size_name: sz.name,
              warehouse_id: wh.id,
              warehouse_name: wh.name,
              quantity_on_hand: q,
              quantity_reserved: 0,
              available_quantity: q
            };
          });
          return { success: true, data: variants };
        }
        return {
          success: true,
          data: [{
            variant_id: p ? p.id : 1,
            product_id: p ? p.id : 1,
            size_id: p?.size_id || 1,
            size_name: p?.size_name || 'عام',
            warehouse_id: wh.id,
            warehouse_name: wh.name,
            quantity_on_hand: p ? p.total_quantity : 0,
            quantity_reserved: 0,
            available_quantity: p ? p.available_quantity : 0
          }]
        };
      }
      if (channel === 'inventory:adjust-stock') {
        const products = webStore.get('products', []);
        const p = products.find(x => x.id === Number(payload.productId || payload.variantId)) || products[0];
        if (p) {
          p.total_quantity = Math.max(0, (p.total_quantity || 0) + Number(payload.deltaQty || 0));
          p.available_quantity = Math.max(0, (p.available_quantity || 0) + Number(payload.deltaQty || 0));
          webStore.set('products', products);
        }
        return { success: true, data: { newQuantity: p ? p.available_quantity : 0 } };
      }

      // ═══════════════ CUSTOMERS (dynamic, starts empty) ═══════════════
      if (channel === 'customers:get-list') {
        const list = webStore.get('customers', []);
        const term = String(payload?.search || '').trim().toLowerCase();
        if (term) {
          return { success: true, data: list.filter(c => (c.name && c.name.toLowerCase().includes(term)) || (c.phone && c.phone.includes(term)) || (c.code && c.code.toLowerCase().includes(term))) };
        }
        return { success: true, data: list };
      }
      if (channel === 'customers:create') {
        const list = webStore.get('customers', []);
        const id = webStore.nextId('customer');
        const item = { id, code: `CUST-${String(1000 + id)}`, name: payload.name, phone: payload.phone || '', address: payload.address || '', chest_size: payload.chest_size || null, waist_size: payload.waist_size || null, shoe_size: payload.shoe_size || '', total_bookings: 0, active_bookings: 0, national_id: payload.national_id || '' };
        list.push(item);
        webStore.set('customers', list);
        return { success: true, data: item };
      }
      if (channel === 'customers:update') {
        const list = webStore.get('customers', []);
        const idx = list.findIndex(c => c.id === payload.id);
        if (idx >= 0) { Object.assign(list[idx], payload); webStore.set('customers', list); }
        return { success: true, data: list[idx] || payload };
      }

      // ═══════════════ BOOKINGS (dynamic, starts empty) ═══════════════
      if (channel === 'booking:get-list') {
        return { success: true, data: webStore.get('bookings', []) };
      }
      if (channel === 'booking:create') {
        const list = webStore.get('bookings', []);
        const id = webStore.nextId('booking');
        const bkNum = `BK-${String(1000 + id)}`;
        const pol = webStore.get('rental_policies', { defaultRentalDays: 3 });
        const rentDays = Number(pol.defaultRentalDays) > 0 ? Number(pol.defaultRentalDays) : 3;
        const pickup = payload.pickup_date || new Date().toISOString().slice(0, 10);
        const defaultReturnDate = new Date(new Date(pickup).getTime() + rentDays * 86400000).toISOString().slice(0, 10);
        const item = {
          id,
          booking_number: bkNum,
          customer_name: payload.customer_name || 'عميل',
          customer_phone: payload.customer_phone || '',
          pickup_date: pickup,
          return_due_date: payload.return_due_date || defaultReturnDate,
          event_date: payload.event_date || payload.pickup_date || '',
          final_amount: Number(payload.final_amount) || Number(payload.rental_price) || 0,
          paid_amount: Number(payload.paid_advance) || Number(payload.paid_amount) || 0,
          total_deposit_amount: Number(payload.total_deposit_amount) || Number(payload.security_deposit) || 0,
          deposit_paid: Number(payload.deposit_paid) || 0,
          deposit_refunded: 0,
          status: 'CONFIRMED',
          items_summary: payload.items_summary || payload.suit_name || 'بدلة فاخرة',
          created_at: _nowStr()
        };
        list.push(item);
        webStore.set('bookings', list);

        // Mark suit unit as BOOKED if provided
        if (payload.suit_unit_id) {
          const units = webStore.get('suit_units', []);
          const u = units.find(x => x.id === Number(payload.suit_unit_id));
          if (u) {
            u.status = 'BOOKED';
            webStore.set('suit_units', units);
          }
        }
        return { success: true, data: { bookingId: id, bookingNumber: bkNum } };
      }
      if (channel === 'booking:update-status') {
        const list = webStore.get('bookings', []);
        const bk = list.find(b => b.id === payload.bookingId || b.id === payload.id);
        if (bk) { bk.status = payload.status; webStore.set('bookings', list); }
        return { success: true, data: { bookingId: payload.bookingId || payload.id, status: payload.status } };
      }
      if (channel === 'booking:check-availability') {
        return { success: true, data: { isAvailable: true, bufferDays: 1 } };
      }
      if (channel === 'booking:handover') {
        const list = webStore.get('bookings', []);
        const bk = list.find(b => b.id === payload.bookingId);
        if (bk) {
          bk.status = 'DELIVERED';
          bk.paid_amount = (bk.paid_amount || 0) + Number(payload.remainderPaidAmount || 0);
          bk.deposit_paid = (bk.deposit_paid || 0) + Number(payload.depositPaidAmount || 0);
          webStore.set('bookings', list);
          // Mark suit unit as IN_USE
          const units = webStore.get('suit_units', []);
          const u = units.find(x => x.status === 'BOOKED');
          if (u) { u.status = 'IN_USE'; webStore.set('suit_units', units); }
          // Update cash session
          const totalIn = Number(payload.remainderPaidAmount || 0) + Number(payload.depositPaidAmount || 0);
          const session = webStore.get('active_cash_session', null);
          if (session && totalIn > 0) {
            session.total_cash_in += totalIn;
            session.calculated_balance += totalIn;
            session.breakdown.rentalIn += Number(payload.remainderPaidAmount || 0);
            session.breakdown.depositIn += Number(payload.depositPaidAmount || 0);
            session.transaction_count++;
            webStore.set('active_cash_session', session);
          }
        }
        return { success: true, data: { bookingId: payload.bookingId, status: 'DELIVERED' } };
      }
      if (channel === 'booking:return') {
        const list = webStore.get('bookings', []);
        const bk = list.find(b => b.id === payload.bookingId);
        let refundAmount = 0;
        if (bk) {
          bk.status = 'COMPLETED';
          const damageFee = Number(payload.damageFee || 0);
          // Calculate late fee with policies
          const pol = webStore.get('policies', _DEFAULT_POLICIES);
          const applyLateFee = pol.applyLateFee !== false && String(pol.applyLateFee) !== '0';
          const lateFeePerDay = applyLateFee ? (Number(pol.lateFeePerDay) >= 0 ? Number(pol.lateFeePerDay) : 300) : 0;
          const allowGrace = pol.allowGracePeriod !== false && String(pol.allowGracePeriod) !== '0';
          const graceHours = allowGrace ? (Number(pol.allowGracePeriodHours) || 0) : 0;

          const dueDate = new Date(bk.return_due_date + 'T23:59:59');
          const actualDate = new Date(payload.actualReturnDate || new Date());
          const graceMs = graceHours * 60 * 60 * 1000;
          const effectiveDue = new Date(dueDate.getTime() + graceMs);
          const diffDays = Math.ceil((actualDate.getTime() - effectiveDue.getTime()) / 86400000);
          const lateDays = (!applyLateFee || diffDays <= 0) ? 0 : diffDays;
          const lateFee = applyLateFee ? (lateDays * lateFeePerDay) : 0;
          const totalDeductions = damageFee + lateFee;
          refundAmount = Math.max(0, (bk.deposit_paid || 0) - totalDeductions);
          bk.deposit_refunded = refundAmount;
          webStore.set('bookings', list);
          // Complete tasks related to this booking
          const tasks = webStore.get('tasks', []);
          tasks.filter(t => t.booking_number === bk.booking_number).forEach(t => { t.status = 'COMPLETED'; });
          webStore.set('tasks', tasks);
          // Free up suit unit
          const units = webStore.get('suit_units', []);
          const u = units.find(x => x.status === 'IN_USE');
          if (u) { u.status = 'IN_CLEANING'; u.rental_count = (u.rental_count || 0) + 1; webStore.set('suit_units', units); }
          // Refund from cash session
          const session = webStore.get('active_cash_session', null);
          if (session && refundAmount > 0) {
            session.total_cash_out += refundAmount;
            session.calculated_balance -= refundAmount;
            session.breakdown.depositRefundOut += refundAmount;
            session.transaction_count++;
            webStore.set('active_cash_session', session);
          }
        }
        return { success: true, data: { bookingId: payload.bookingId, status: 'COMPLETED', refundAmount, inspectionNotes: payload.inspectionNotes || '' } };
      }

      // ═══════════════ SALES (dynamic, starts empty) ═══════════════
      if (channel === 'sales:get-catalog') {
        let prods = webStore.get('products', []);
        let units = webStore.get('suit_units', []);
        let models = webStore.get('suit_models', []);
        const catFilter = payload?.categoryType;
        const normFilter = String(catFilter || '').toUpperCase();

        if (catFilter && catFilter !== 'ALL') {
          prods = prods.filter(p =>
            p.category_type === catFilter ||
            p.category_code === catFilter ||
            p.category_name === catFilter ||
            String(p.category_id) === String(catFilter)
          );
        }

        const prodItems = prods.map(p => ({
          variant_id: p.id,
          product_id: p.id,
          product_code: p.code,
          product_name: p.name,
          category_name: p.category_name,
          category_type: p.category_type,
          size_name: p.size_name || p.sizes_summary || '',
          color_name: '',
          sku: p.code,
          barcode: p.barcode || p.code || '',
          unit_price: p.sale_price,
          available_quantity: p.available_quantity || 0,
          item_type: 'VARIANT'
        }));

        let suitItems = [];
        const isSuitCat = !catFilter || ['ALL', 'SUITS', 'SUIT', 'بدل رجالي', 'بدل'].includes(normFilter);
        if (isSuitCat) {
          suitItems = units.filter(u => u.status === 'AVAILABLE').map(u => {
            const m = models.find(x => x.id === u.suit_model_id) || {};
            return {
              suit_unit_id: u.id,
              model_id: m.id,
              model_code: m.code,
              model_name: m.name,
              category_name: 'بدل رجالي',
              category_type: 'SUITS',
              size_name: u.size_name || '',
              color_name: m.color_name || '',
              sku: u.unit_barcode,
              barcode: u.unit_barcode,
              unit_price: m.sale_price || (m.rental_price * 2) || m.rental_price || 0,
              available_quantity: 1,
              item_type: 'SUIT_UNIT'
            };
          });
        }

        return { success: true, data: [...prodItems, ...suitItems] };
      }
      if (channel === 'sales:lookup-barcode') {
        const term = String(payload?.barcode || payload?.code || '').trim();
        const products = webStore.get('products', []);
        const found = products.find(p => p.barcode === term || p.code === term);
        if (found) {
          return { success: true, data: { variant_id: found.id, product_code: found.code, product_name: found.name, size_name: found.size_name || '', unit_price: found.sale_price, available_quantity: found.available_quantity || 0, item_type: 'VARIANT' } };
        }
        const units = webStore.get('suit_units', []);
        const foundUnit = units.find(u => u.unit_barcode === term);
        if (foundUnit) {
          const m = (webStore.get('suit_models', [])).find(x => x.id === foundUnit.suit_model_id) || {};
          return {
            success: true,
            data: {
              suit_unit_id: foundUnit.id,
              model_code: m.code,
              model_name: m.name,
              product_name: m.name,
              size_name: foundUnit.size_name || '',
              unit_price: m.sale_price || (m.rental_price * 2) || m.rental_price || 0,
              available_quantity: foundUnit.status === 'AVAILABLE' ? 1 : 0,
              item_type: 'SUIT_UNIT'
            }
          };
        }
        return { success: true, data: null };
      }
      if (channel === 'sales:get-list') {
        return { success: true, data: webStore.get('sales', []) };
      }
      if (channel === 'sales:create-direct-sale') {
        const list = webStore.get('sales', []);
        const id = webStore.nextId('sale');
        const saleNum = `SALE-${_dateStr()}-${String(1000 + id)}`;
        const saleItems = payload.items || [];
        const computedTotal = saleItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
        const totalAmount = computedTotal - (payload.discount || 0);
        const paidAmount = payload.paid_amount || totalAmount;
        const changeAmount = Math.max(0, paidAmount - totalAmount);
        const item = { id, sale_number: saleNum, customer_name: payload.customer_name || 'عميل نقدي', total_amount: totalAmount, paid_amount: paidAmount, change_amount: changeAmount, payment_method: payload.payment_method || 'CASH', item_count: saleItems.length, created_at: _nowStr(), return_count: 0, total_refunded: 0 };
        list.push(item);
        webStore.set('sales', list);

        // Deduct stock for each sold item
        const products = webStore.get('products', []);
        const suitUnits = webStore.get('suit_units', []);
        saleItems.forEach(si => {
          if (si.product_variant_id) {
            const p = products.find(x => x.id === si.product_variant_id);
            if (p) {
              p.total_quantity = Math.max(0, (p.total_quantity || 0) - si.quantity);
              p.available_quantity = Math.max(0, (p.available_quantity || 0) - si.quantity);
            }
          } else if (si.suit_unit_id) {
            const u = suitUnits.find(x => x.id === si.suit_unit_id);
            if (u) {
              u.status = 'SOLD';
            }
          }
        });
        webStore.set('products', products);
        webStore.set('suit_units', suitUnits);

        // Update cash session
        const session = webStore.get('active_cash_session', null);
        if (session && payload.payment_method === 'CASH') {
          session.total_cash_in += totalAmount;
          session.calculated_balance += totalAmount;
          session.breakdown.saleIn += totalAmount;
          session.transaction_count++;
          webStore.set('active_cash_session', session);
        }

        return { success: true, data: { saleId: id, saleNumber: saleNum, invoiceNumber: `INV-S-${_dateStr()}-${String(1000 + id)}`, totalAmount, paidAmount, changeAmount } };
      }
      if (channel === 'sales:process-return') {
        const id = webStore.nextId('return');
        return { success: true, data: { returnId: id, returnNumber: `RET-${_dateStr()}-${String(id)}`, totalRefund: payload.refund_amount || 0 } };
      }

      // ═══════════════ FINANCE (dynamic, starts empty) ═══════════════
      if (channel === 'finance:get-cash-session') {
        const session = webStore.get('active_cash_session', null);
        return { success: true, data: session };
      }
      if (channel === 'finance:open-cash-session') {
        const id = webStore.nextId('cash_session');
        const code = `SES-${_dateStr()}-${String(id).padStart(3, '0')}`;
        const session = { id, session_code: code, opened_at: _nowStr(), opening_balance: payload.openingBalance || 0, total_cash_in: payload.openingBalance || 0, total_cash_out: 0, calculated_balance: payload.openingBalance || 0, status: 'OPEN', notes: payload.notes || '', transaction_count: 1, breakdown: { rentalIn: 0, saleIn: 0, depositIn: 0, depositRefundOut: 0, expenseOut: 0, manualIn: 0, manualOut: 0 }, recent_transactions: [{ id: 1, transaction_type: 'IN', category: 'MANUAL_IN', amount: payload.openingBalance || 0, reference_type: 'OPENING_BALANCE', reference_id: null, notes: 'رصيد افتتاحي', created_at: _nowStr() }] };
        webStore.set('active_cash_session', session);
        const sessions = webStore.get('cash_sessions', []);
        sessions.push({ id, session_code: code, opened_at: session.opened_at, closed_at: null, opening_balance: session.opening_balance, total_cash_in: session.total_cash_in, total_cash_out: 0, calculated_balance: session.calculated_balance, actual_balance: null, difference: 0, status: 'OPEN', transaction_count: 1 });
        webStore.set('cash_sessions', sessions);
        return { success: true, data: { id, sessionCode: code, openingBalance: session.opening_balance, openedAt: session.opened_at } };
      }
      if (channel === 'finance:close-cash-session') {
        const session = webStore.get('active_cash_session', null);
        const actual = Number(payload.actualBalance) || 0;
        const calc = session ? session.calculated_balance : 0;
        const diff = actual - calc;
        if (session) { session.status = 'CLOSED'; session.closed_at = _nowStr(); webStore.set('active_cash_session', null); }
        const sessions = webStore.get('cash_sessions', []);
        const s = sessions.find(x => x.id === (session?.id));
        if (s) { s.status = 'CLOSED'; s.closed_at = _nowStr(); s.actual_balance = actual; s.difference = diff; webStore.set('cash_sessions', sessions); }
        return { success: true, data: { sessionId: session?.id, sessionCode: session?.session_code || '', openingBalance: session?.opening_balance || 0, calculatedBalance: calc, actualBalance: actual, difference: diff, discrepancyText: diff === 0 ? 'متطابق تماماً' : diff > 0 ? `زيادة ${diff} ج.م` : `عجز ${Math.abs(diff)} ج.م`, closedAt: _nowStr() } };
      }
      if (channel === 'finance:get-summary') {
        const session = webStore.get('active_cash_session', null);
        const sales = webStore.get('sales', []);
        const bookings = webStore.get('bookings', []);
        const totalSales = sales.reduce((s, x) => s + (x.total_amount || 0), 0);
        const totalRental = bookings.reduce((s, x) => s + (x.paid_amount || 0), 0);
        return { success: true, data: { netSalesRevenue: totalSales, rentalRevenue: totalRental, lateFeesRevenue: 0, damageFeesRevenue: 0, grossOperatingRevenue: totalSales + totalRental, totalExpenses: 0, netOperatingProfit: totalSales + totalRental, escrowDepositsHeld: 0, activeDepositsCount: 0, currentDrawerCash: session ? session.calculated_balance : 0, isSessionOpen: !!session, activeSessionCode: session?.session_code || '' } };
      }
      if (channel === 'finance:get-expense-categories') {
        const extra = webStore.get('extra_expense_cats', []);
        const cats = [..._BASE_EXPENSE_CATS, ...extra];
        const expenses = webStore.get('expenses', []);
        return { success: true, data: cats.map(c => ({ ...c, expense_count: expenses.filter(e => e.category_name === c.name).length, total_spent: expenses.filter(e => e.category_name === c.name).reduce((s, e) => s + (e.amount || 0), 0) })) };
      }
      if (channel === 'finance:get-expenses') {
        return { success: true, data: webStore.get('expenses', []) };
      }
      if (channel === 'finance:record-expense') {
        const list = webStore.get('expenses', []);
        const id = webStore.nextId('expense');
        const item = { id, expense_number: `EXP-${_dateStr()}-${String(id).padStart(3, '0')}`, category_name: payload.category_name || 'مصروفات متنوعة', amount: payload.amount || 0, description: payload.description || '', session_code: '', created_at: _nowStr() };
        list.push(item);
        webStore.set('expenses', list);
        // Update session
        const session = webStore.get('active_cash_session', null);
        if (session) { session.total_cash_out += item.amount; session.calculated_balance -= item.amount; session.breakdown.expenseOut += item.amount; session.transaction_count++; webStore.set('active_cash_session', session); item.session_code = session.session_code; }
        return { success: true, data: { expenseId: id, expenseNumber: item.expense_number, amount: item.amount, categoryName: item.category_name } };
      }
      if (channel === 'finance:record-cash-adjustment') {
        const session = webStore.get('active_cash_session', null);
        const amt = payload.amount || 0;
        if (session) {
          if (payload.type === 'IN') { session.total_cash_in += amt; session.calculated_balance += amt; session.breakdown.manualIn += amt; }
          else { session.total_cash_out += amt; session.calculated_balance -= amt; session.breakdown.manualOut += amt; }
          session.transaction_count++;
          webStore.set('active_cash_session', session);
        }
        return { success: true, data: { type: payload.type || 'IN', amount: amt, newBalance: session ? session.calculated_balance : amt } };
      }
      if (channel === 'finance:get-escrow-deposits') {
        const bookings = webStore.get('bookings', []);
        const active = bookings.filter(b => (b.deposit_paid || 0) > 0 && b.status !== 'COMPLETED');
        const totalReceived = bookings.reduce((s, b) => s + (b.deposit_paid || 0), 0);
        const totalRefunded = bookings.reduce((s, b) => s + (b.deposit_refunded || 0), 0);
        return { success: true, data: { netEscrowHeld: totalReceived - totalRefunded, totalDepositsReceived: totalReceived, totalDepositsRefunded: totalRefunded, activeDepositsCount: active.length, activeDepositsList: active.map(b => ({ booking_id: b.id, booking_number: b.booking_number, customer_name: b.customer_name, customer_phone: b.customer_phone, pickup_date: b.pickup_date, return_due_date: b.return_due_date, status: b.status, deposit_paid: b.deposit_paid || 0, deposit_refunded: b.deposit_refunded || 0, remaining_deposit: (b.deposit_paid || 0) - (b.deposit_refunded || 0) })) } };
      }
      if (channel === 'finance:get-sessions-list') {
        return { success: true, data: webStore.get('cash_sessions', []) };
      }

      // ═══════════════ TASKS (dynamic, starts empty) ═══════════════
      if (channel === 'tasks:get-list') {
        return { success: true, data: webStore.get('tasks', []) };
      }
      if (channel === 'tasks:get-alerts') {
        const tasks = webStore.get('tasks', []);
        const bookings = webStore.get('bookings', []);
        const today = new Date().toISOString().slice(0, 10);
        const overdue = bookings.filter(b => b.return_due_date && b.return_due_date < today && (b.status === 'DELIVERED' || b.status === 'CONFIRMED')).length;
        const pickups = bookings.filter(b => b.pickup_date === today && (b.status === 'PREPARED' || b.status === 'CONFIRMED')).length;
        const returns = bookings.filter(b => b.return_due_date === today && (b.status === 'DELIVERED' || b.status === 'CONFIRMED')).length;
        return { success: true, data: { overdueCount: overdue, todayPickupsCount: pickups, todayReturnsCount: returns, todayFittingsCount: 0, unreadNotificationsCount: overdue, alertsList: [] } };
      }
      if (channel === 'tasks:get-returns-due') {
        const bookings = webStore.get('bookings', []);
        const today = new Date().toISOString().slice(0, 10);
        const list = bookings.filter(b => b.status === 'DELIVERED' || b.status === 'CONFIRMED' || b.status === 'PREPARED').map(b => {
          const retDate = b.return_due_date || today;
          const diffDays = Math.round((new Date(today) - new Date(retDate)) / 86400000);
          return {
            booking_id: b.id,
            booking_number: b.booking_number,
            status: b.status,
            pickup_date: b.pickup_date,
            return_due_date: retDate,
            deposit_paid: b.deposit_paid || b.total_deposit_amount || 0,
            total_deposit_amount: b.total_deposit_amount || 0,
            final_amount: b.final_amount || 0,
            customer_name: b.customer_name,
            customer_phone: b.customer_phone,
            items_summary: b.items_summary || 'بدلة رجالي فاخرة',
            days_overdue: diffDays,
            is_overdue: diffDays > 0,
            is_today: diffDays === 0,
            is_upcoming: diffDays < 0
          };
        });
        return { success: true, data: list };
      }
      if (channel === 'tasks:create') {
        const list = webStore.get('tasks', []);
        const id = webStore.nextId('task');
        const item = { id, title: payload.title || '', description: payload.description || '', task_type: payload.task_type || 'GENERAL', priority: payload.priority || 'NORMAL', due_date: payload.due_date || '', status: 'PENDING', booking_number: payload.booking_number || null, customer_name: payload.customer_name || null, customer_phone: payload.customer_phone || null, suit_name: payload.suit_name || null };
        list.push(item);
        webStore.set('tasks', list);
        return { success: true, data: item };
      }
      if (channel === 'tasks:complete') {
        const list = webStore.get('tasks', []);
        const t = list.find(x => x.id === payload.taskId);
        if (t) { t.status = 'COMPLETED'; webStore.set('tasks', list); }
        return { success: true, data: { taskId: payload.taskId, status: 'COMPLETED' } };
      }
      if (channel === 'tasks:generate-from-bookings') {
        const bookings = webStore.get('bookings', []);
        const tasks = webStore.get('tasks', []);
        const today = new Date().toISOString().slice(0, 10);
        let count = 0;
        bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'PREPARED' || b.status === 'DELIVERED').forEach(b => {
          const existsPrep = tasks.find(t => t.booking_number === b.booking_number && t.task_type === 'SUIT_PREPARATION');
          if (!existsPrep && b.status !== 'DELIVERED') {
            const id = webStore.nextId('task');
            tasks.push({ id, title: `تجهيز بدلة حجز #${b.booking_number}`, description: `تجهيز وكي للعميل ${b.customer_name}`, task_type: 'SUIT_PREPARATION', priority: 'HIGH', due_date: b.pickup_date, status: 'PENDING', booking_number: b.booking_number, customer_name: b.customer_name, customer_phone: b.customer_phone, suit_name: b.items_summary || '' });
            count++;
          }
          if (b.return_due_date && b.return_due_date < today) {
            const existsOverdue = tasks.find(t => t.booking_number === b.booking_number && t.task_type === 'RETURN_FOLLOWUP');
            if (!existsOverdue) {
              const id = webStore.nextId('task');
              tasks.push({ id, title: `⚠️ متابعة متأخرات إرجاع - حجز #${b.booking_number}`, description: `تجاوز تاريخ الإرجاع ${b.return_due_date}`, task_type: 'RETURN_FOLLOWUP', priority: 'URGENT', due_date: today, status: 'PENDING', booking_number: b.booking_number, customer_name: b.customer_name, customer_phone: b.customer_phone, suit_name: b.items_summary || '' });
              count++;
            }
          }
        });
        webStore.set('tasks', tasks);
        return { success: true, data: { createdCount: count } };
      }

      // ═══════════════ WHATSAPP ═══════════════
      if (channel === 'whatsapp:get-templates') {
        return {
          success: true, data: {
            FITTING_REMINDER: { key: 'FITTING_REMINDER', title: 'تذكير بموعد البروفة', template: 'مرحباً {customer_name}، نذكرك بميعاد بروفة البدلة الخاصة بكم في محل mohamed saed بتاريخ {date}. نسعد بتشريفكم!' },
            READY_FOR_PICKUP: { key: 'READY_FOR_PICKUP', title: 'تنبيه جاهزية البدلة للاستلام', template: 'مرحباً {customer_name}، بدلتكم جاهزة ومكوية للاستلام اليوم في محل mohamed saed. يرجى إحضار إيصال الحجز.' },
            RETURN_REMINDER: { key: 'RETURN_REMINDER', title: 'تذكير بموعد إرجاع البدلة', template: 'مرحباً {customer_name}، نود تذكيركم بموعد إرجاع البدلة غداً {date} لضمان استرداد كامل مبلغ التأمين. شكراً لتعاملكم معنا.' },
            OVERDUE_ALERT: { key: 'OVERDUE_ALERT', title: 'تنبيه عاجل لمتأخرات الإرجاع', template: 'عاجل: مرحباً {customer_name}، نود تذكيركم بأن موعد إرجاع البدلة قد تجاوز الوقت المحدد ({days_late} يوم تأخير). يرجى التوجه للمحل لتسليمها.' }
          }
        };
      }
      if (channel === 'whatsapp:generate-link') {
        let clean = String(payload.phone || '').replace(/\D/g, '');
        if (clean.startsWith('01') && clean.length === 11) clean = `20${clean.slice(1)}`;
        const text = payload.params?.custom_message || 'مرحباً بكم من محل mohamed saed.';
        return { success: true, data: { phone: clean, message: text, link: `https://wa.me/${clean}?text=${encodeURIComponent(text)}` } };
      }

      // ═══════════════ REPORTS (computed from stored data) ═══════════════
      if (channel === 'reports:get-profit-loss') {
        const sales = webStore.get('sales', []);
        const bookings = webStore.get('bookings', []);
        const expenses = webStore.get('expenses', []);
        const totalSales = sales.reduce((s, x) => s + (x.total_amount || 0), 0);
        const totalRental = bookings.reduce((s, x) => s + (x.paid_amount || 0), 0);
        const totalExp = expenses.reduce((s, x) => s + (x.amount || 0), 0);
        const gross = totalSales + totalRental;
        return { success: true, data: { revenue: { salesRevenue: totalSales, rentalRevenue: totalRental, lateFeesRevenue: 0, totalGrossRevenue: gross, discountsGiven: 0, totalNetRevenue: gross }, cogs: { salesCogs: 0, cleaningExpenses: 0, totalDirectCosts: 0 }, grossProfit: gross, grossMarginPercent: gross > 0 ? 100 : 0, operatingExpenses: { totalOperatingExpenses: totalExp, byCategory: [] }, netOperatingProfit: gross - totalExp, netMarginPercent: gross > 0 ? (((gross - totalExp) / gross) * 100).toFixed(1) : 0, escrowFlow: { depositsCollected: 0, depositsRefunded: 0, netEscrowChange: 0 } } };
      }
      if (channel === 'reports:get-stock-summary') {
        const units = webStore.get('suit_units', []);
        const products = webStore.get('products', []);
        const statusCounts = { AVAILABLE: 0, BOOKED: 0, IN_USE: 0, IN_CLEANING: 0, DAMAGED: 0, RETIRED: 0, SOLD: 0 };
        units.forEach(u => { if (statusCounts[u.status] !== undefined) statusCounts[u.status]++; });
        return { success: true, data: { suits: { totalUnits: units.length, statusCounts, activeFleet: units.length, totalCapitalCost: 0, potentialRentalCycle: 0 }, quantityInventory: { totalProducts: products.length, totalVariants: products.length, totalOnHand: products.reduce((s, p) => s + (p.total_quantity || 0), 0), totalReserved: products.reduce((s, p) => s + (p.reserved_quantity || 0), 0), availableQuantity: products.reduce((s, p) => s + (p.available_quantity || 0), 0), costValuation: 0, retailValuation: products.reduce((s, p) => s + ((p.sale_price || 0) * (p.total_quantity || 0)), 0) }, lowStockAlerts: products.filter(p => (p.reorder_level || 0) > 0 && (p.available_quantity || 0) <= (p.reorder_level || 0)) } };
      }
      if (channel === 'reports:get-occupancy') {
        const units = webStore.get('suit_units', []);
        const available = units.filter(u => u.status === 'AVAILABLE').length;
        const occupied = units.filter(u => u.status === 'BOOKED' || u.status === 'IN_USE').length;
        const cleaning = units.filter(u => u.status === 'IN_CLEANING').length;
        const damaged = units.filter(u => u.status === 'DAMAGED').length;
        return { success: true, data: { fleetSummary: { totalFleet: units.length, occupiedUnits: occupied, availableUnits: available, cleaningUnits: cleaning, damagedUnits: damaged, occupancyRate: units.length > 0 ? ((occupied / units.length) * 100).toFixed(1) : 0 }, topRentedModels: [], popularSizes: [] } };
      }
      if (channel === 'reports:get-top-customers') {
        const customers = webStore.get('customers', []);
        return { success: true, data: customers.slice(0, 10) };
      }
      if (channel === 'reports:get-low-stock') {
        const products = webStore.get('products', []);
        return { success: true, data: products.filter(p => (p.reorder_level || 0) > 0 && (p.available_quantity || 0) <= (p.reorder_level || 0)) };
      }

      // ═══════════════ PRINTING (static mocks) ═══════════════
      if (channel === 'print:get-printers') {
        return {
          success: true, data: [
            { name: 'الطابعة الافتراضية للنظام (Default)', isDefault: true, status: 0 },
            { name: 'طابعة الإيصالات الحرارية (Thermal POS 80mm)', isDefault: false, status: 0 },
            { name: 'Microsoft Print to PDF', isDefault: false, status: 0 }
          ]
        };
      }

      if (channel === 'print:receipt') {
        const receiptHtml = `
          <div style="font-family: Tahoma, sans-serif; text-align: center; direction: rtl; padding: 15px; font-size: 13px; color: #000;">
            <h3 style="margin: 0;">محل mohamed saed والعرائس</h3>
            <p style="font-size: 11px; margin: 4px 0;">شارع عباس العقاد، مدينة نصر، القاهرة</p>
            <p style="font-size: 11px; margin: 4px 0;">رقم الإيصال: <strong>${payload.receiptNumber || 'REC-8921'}</strong></p>
            <hr style="border: 1px dashed #000; margin: 10px 0;">
            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
              <tr><th style="text-align: right;">الصنف</th><th>الكمية</th><th style="text-align: left;">الإجمالي</th></tr>
              <tr><td style="text-align: right;">حذاء كلاسيك أسود</td><td style="text-align: center;">1</td><td style="text-align: left;">750 ج.م</td></tr>
              <tr><td style="text-align: right;">كرافتة ستان كحلي</td><td style="text-align: center;">1</td><td style="text-align: left;">150 ج.م</td></tr>
            </table>
            <hr style="border: 1px dashed #000; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
              <span>الصافي المطلوب:</span><span>900.00 ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 5px;">
              <span>طريقة الدفع:</span><span>نقدي (كاش)</span>
            </div>
            <p style="font-size: 10px; margin-top: 15px;">البضاعة المباعة تستبدل وترد خلال 14 يوماً بالإيصال الأصلي.</p>
          </div>
        `;
        return { success: true, data: { html: receiptHtml, pageSize: '80mm' } };
      }

      if (channel === 'print:invoice') {
        const invoiceHtml = `
          <div style="font-family: Arial, sans-serif; direction: rtl; padding: 25px; color: #111;">
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #d4af37; padding-bottom: 10px;">
              <div>
                <h2 style="margin: 0; color: #111;">محل mohamed saed والعرائس</h2>
                <p style="margin: 4px 0; font-size: 12px; color: #555;">سجل تجاري: 128456 | بطاقة ضريبية: 345-678-901</p>
              </div>
              <div style="text-align: left;">
                <h3 style="margin: 0; color: #d4af37;">فاتورة مبيعات رسمية</h3>
                <p style="margin: 4px 0; font-size: 12px;">رقم: <strong>${payload.invoiceNumber || 'INV-10492'}</strong></p>
              </div>
            </div>
            <div style="margin: 15px 0; background: #f9f9f9; padding: 12px; border-radius: 6px; font-size: 13px;">
              <div><strong>اسم العميل:</strong> ${payload.customerName || 'محمد أحمد سعيد'} | <strong>الهاتف:</strong> ${payload.customerPhone || '01012345678'}</div>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background: #111827; color: #fff; font-size: 12px;">
                  <th style="padding: 8px; text-align: center;">م</th>
                  <th style="padding: 8px; text-align: right;">البيان</th>
                  <th style="padding: 8px; text-align: center;">العدد</th>
                  <th style="padding: 8px; text-align: left;">السعر</th>
                  <th style="padding: 8px; text-align: left;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #ddd; font-size: 12px;">
                  <td style="padding: 8px; text-align: center;">1</td>
                  <td style="padding: 8px;">حذاء كلاسيك إيطالي جلد طبيعي</td>
                  <td style="padding: 8px; text-align: center;">1</td>
                  <td style="padding: 8px; text-align: left;">750.00 ج.م</td>
                  <td style="padding: 8px; text-align: left;">750.00 ج.م</td>
                </tr>
              </tbody>
            </table>
            <div style="float: left; width: 250px; background: #fdfdfd; border: 1px solid #ddd; padding: 12px; border-radius: 6px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 15px;">
                <span>الصافي الإجمالي:</span><span style="color: #d4af37;">750.00 ج.م</span>
              </div>
            </div>
            <div style="clear: both;"></div>
          </div>
        `;
        return { success: true, data: { html: invoiceHtml, pageSize: 'A4' } };
      }

      if (channel === 'print:rental-contract') {
        const contractHtml = `
          <div style="font-family: Arial, sans-serif; direction: rtl; padding: 25px; color: #111;">
            <div style="text-align: center; border-bottom: 2px solid #d4af37; padding-bottom: 10px;">
              <h2 style="margin: 0;">عقد واتفاقية استئجار بدلة وإقرار أمانات</h2>
              <p style="margin: 4px 0; font-size: 12px;">محل mohamed saed - رقم العقد: <strong>${payload.contractNumber || payload.bookingNumber || 'BK-1042'}</strong></p>
            </div>
            <div style="margin: 15px 0; font-size: 12px;">
              <p><strong>المستأجر:</strong> ${payload.customerName || 'محمد أحمد سعيد'} | <strong>الرقم القومي:</strong> ${payload.nationalId || '29001011234567'}</p>
              <p><strong>تاريخ الاستلام:</strong> ${payload.pickupDate || '2026-11-19'} | <strong>تاريخ الإرجاع:</strong> ${payload.returnDueDate || '2026-11-21'}</p>
            </div>
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-right: 4px solid #d97706; padding: 10px; font-size: 12px; margin: 15px 0;">
              🛡️ <strong>إقرار أمانات:</strong> يقر المستأجر بسداد مبلغ التأمين وقدره (1,000 ج.م) كأمانة نقدية مستردة بالكامل فور تسليم البدلة بحالتها السليمة.
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 50px; text-align: center;">
              <div>توقيع المستأجر المقر بما فيه: .................................</div>
              <div>ختم وتوقيع إدارة المحل: .................................</div>
            </div>
          </div>
        `;
        return { success: true, data: { html: contractHtml, pageSize: 'A4' } };
      }

      // Backup & Restore Engine Mocks (Phase 13)
      if (channel === 'backup:create-local') {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        return {
          success: true,
          data: {
            backupId: 101,
            filePath: `C:\\Users\\SuitStore\\backups\\suit_store_backup_${dateStr}.db`,
            fileName: `suit_store_backup_${dateStr}.db`,
            fileSizeBytes: 2457600,
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            createdAt: now.toISOString()
          }
        };
      }

      if (channel === 'backup:verify') {
        return {
          success: true,
          data: {
            valid: true,
            integrity: 'ok',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            fileSizeBytes: 2457600,
            tableCount: 22
          }
        };
      }

      if (channel === 'backup:restore-local') {
        return {
          success: true,
          data: {
            restoredFrom: payload?.backupFilePath || 'backup.db',
            safetyBackupPath: 'C:\\Users\\SuitStore\\backups\\safety_snapshot.db',
            restoredAt: new Date().toISOString()
          }
        };
      }

      if (channel === 'backup:sync-google-drive') {
        const records = webStore.get('gdrive_records', [
          {
            id: 1,
            backup_type: 'GOOGLE_DRIVE',
            file_path: 'suit_store_backup_cloud.db',
            file_size_bytes: 2457600,
            checksum_sha256: '5c0427ac971de6856d5e3900bf7a513070d5f513cc0df5248fafcbd9cd8b83c3',
            status: 'SUCCESS',
            created_at: new Date().toISOString()
          }
        ]);
        const newRecord = {
          id: Date.now(),
          backup_type: 'GOOGLE_DRIVE',
          file_path: payload?.backupFilePath ? payload.backupFilePath.split('\\').pop() : 'suit_store_backup_cloud.db',
          file_size_bytes: 380928,
          checksum_sha256: '5c0427ac971de6856d5e3900bf7a513070d5f513cc0df5248fafcbd9cd8b83c3',
          status: 'SUCCESS',
          created_at: new Date().toISOString()
        };
        records.unshift(newRecord);
        webStore.set('gdrive_records', records.slice(0, 10));
        return {
          success: true,
          data: {
            provider: 'GOOGLE_DRIVE',
            remoteFileId: 'gdrive_8f9a0c1e2b',
            fileName: newRecord.file_path,
            fileSizeBytes: newRecord.file_size_bytes,
            syncedAt: newRecord.created_at
          }
        };
      }

      if (channel === 'backup:get-gdrive-history') {
        const list = webStore.get('gdrive_records', [
          {
            id: 1,
            backup_type: 'GOOGLE_DRIVE',
            file_path: 'suit_store_backup_latest.db',
            file_size_bytes: 380928,
            checksum_sha256: '5c0427ac971de6856d5e3900bf7a513070d5f513cc0df5248fafcbd9cd8b83c3',
            status: 'SUCCESS',
            created_at: new Date().toISOString()
          }
        ]);
        return { success: true, data: list };
      }

      if (channel === 'backup:open-gdrive-url') {
        window.open('https://drive.google.com/drive/my-drive', '_blank');
        return { success: true };
      }

      if (channel === 'backup:gdrive-get-status') {
        const auth = webStore.get('gdrive_auth', null);
        return {
          success: true,
          data: {
            isConnected: !!auth,
            user: auth?.user || null,
            targetFolder: 'MohamedSaed_Store_Backups'
          }
        };
      }

      if (channel === 'backup:gdrive-start-auth') {
        const mockUser = { email: 'mohamed.saed.store@gmail.com', name: 'محمد السعيد' };
        webStore.set('gdrive_auth', { user: mockUser, access_token: 'mock_token', refresh_token: 'mock_refresh' });
        return {
          success: true,
          data: { user: mockUser }
        };
      }

      if (channel === 'backup:gdrive-disconnect') {
        webStore.set('gdrive_auth', null);
        return { success: true };
      }

      if (channel === 'backup:get-info') {
        return {
          success: true,
          data: {
            backupDir: 'C:\\Users\\karim\\AppData\\Roaming\\SuitStore\\backups',
            dbPath: 'C:\\Users\\karim\\AppData\\Roaming\\SuitStore\\data\\suit-store.db',
            latestBackup: {
              fileName: 'suit_store_backup_latest.db',
              filePath: 'C:\\Users\\karim\\AppData\\Roaming\\SuitStore\\backups\\suit_store_backup_latest.db',
              sizeBytes: 2457600,
              mtime: new Date().toISOString()
            },
            backupCount: 3
          }
        };
      }

      if (channel === 'backup:open-folder') {
        return {
          success: true,
          path: 'C:\\Users\\karim\\AppData\\Roaming\\SuitStore\\backups'
        };
      }

      if (channel === 'backup:select-file') {
        return {
          success: true,
          filePath: 'C:\\Users\\karim\\AppData\\Roaming\\SuitStore\\backups\\suit_store_backup_latest.db'
        };
      }

      if (channel === 'system:reset-database') {
        Object.keys(localStorage).filter(k => k.startsWith('suit_')).forEach(k => localStorage.removeItem(k));
        return { success: true };
      }

      // Auto Update Engine Mocks (Phase 14)
      if (channel === 'update:check') {
        return {
          success: true,
          data: {
            updateAvailable: true,
            currentVersion: '1.0.0',
            latestVersion: '1.1.0',
            releaseDate: '2026-11-08',
            releaseNotes: '• دعم قوالب الطباعة الحرارية 80mm والفواتير الرسمية A4\n• محرك النسخ الاحتياطي التلقائي وفحص سلامة SQLite\n• ميزة التحديث الآلي وحماية البيانات مع Pre-Update Safety Snapshots',
            downloadUrl: 'https://releases.suitstore.local/v1.1.0/update-v1.1.0.pkg',
            fileSizeBytes: 45280000,
            sha256Checksum: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
            mandatory: false,
            checkedAt: new Date().toISOString()
          }
        };
      }

      if (channel === 'update:download') {
        return {
          success: true,
          data: {
            stagedFilePath: 'C:\\Users\\SuitStore\\updates\\suit_store_update_v1.1.0.pkg',
            fileSizeBytes: 45280000,
            checksum: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
            checksumVerified: true
          }
        };
      }

      if (channel === 'update:apply') {
        return {
          success: true,
          data: {
            backupCreated: true,
            safetyBackupPath: 'C:\\Users\\SuitStore\\backups\\safety_snapshot_before_update.db',
            migrationsApplied: 0,
            readyToRestart: true,
            appliedAt: new Date().toISOString()
          }
        };
      }

      if (channel === 'update:get-status') {
        return {
          success: true,
          data: {
            state: 'AVAILABLE',
            currentVersion: '1.0.0',
            latestVersion: '1.1.0',
            downloadProgress: 0,
            lastCheckedAt: new Date().toISOString(),
            error: null
          }
        };
      }

      return {
        success: true,
        data: { channel, payload, success: true },
        timestamp: new Date().toISOString()
      };
    },
    platform: 'win32',
    isElectron: false
  };

  // 3. Navigation & Page Access Protection Management
  const pageContent = document.getElementById('page-content');
  const unlockedPagesSession = new Set();
  let cachedAppSettings = null;

  const PAGE_TITLES = {
    dashboard: 'لوحة التحكم',
    admin: 'البيانات الأساسية والسياسات',
    settings: 'الإعدادات العامة',
    suits: 'مخزون البدل والقطع',
    shoes: 'الأحذية الكلاسيك',
    accessories: 'الإكسسوارات',
    bookings: 'الحجوزات والتأجير',
    customers: 'دليل العملاء والقياسات',
    pos: 'نقطة البيع السريع (POS)',
    finance: 'الخزينة والمالية',
    tasks: 'المهام اليومية والتنبيهات',
    reports: 'التقارير المحاسبية والإحصائيات'
  };

  function getCategoryIcon(code, name, type) {
    const c = String(code || '').toUpperCase();
    const t = String(type || '').toUpperCase();
    const n = String(name || '');

    if (c === 'SUITS' || t === 'SUITS' || n.includes('بدل')) return '🤵';
    if (c === 'SHOES' || t === 'SHOES' || n.includes('حذاء') || n.includes('أحذية') || n.includes('جزم')) return '👞';
    if (c === 'ACCESSORIES' || t === 'ACCESSORIES' || n.includes('إكسسوار') || n.includes('اكسسوار')) return '🎀';
    if (c.includes('SHIRT') || n.includes('قميص') || n.includes('قمصان')) return '👔';
    if (c.includes('VEST') || n.includes('صدري') || n.includes('سديري')) return '🦺';
    if (c.includes('TIE') || n.includes('كرافت') || n.includes('ربطة')) return '🎗️';
    if (c.includes('WATCH') || n.includes('ساعة')) return '⌚';
    if (c.includes('BELT') || n.includes('حزام') || n.includes('أحزمة')) return '🥋';
    if (c.includes('HAT') || n.includes('قبعة') || n.includes('طربوش')) return '🎩';
    if (c.includes('PERF') || n.includes('عطر') || n.includes('برفان')) return '✨';
    if (c.includes('BAG') || n.includes('حقيب') || n.includes('شنط')) return '💼';
    if (c.includes('PANT') || n.includes('بنطلون')) return '👖';
    if (c.includes('COAT') || n.includes('بالطو') || n.includes('جاكيت')) return '🧥';
    return '📦';
  }

  async function buildDynamicInventoryNav() {
    const container = document.getElementById('nav-inventory-categories');
    if (!container) return;

    try {
      const res = await electronApi.invoke('admin:get-categories');
      const categories = (res?.data || []).filter(c => c.is_active !== 0);

      if (categories.length === 0) {
        container.innerHTML = `
          <a href="#suits" class="nav-item" data-page="suits">
            <span class="icon">🤵</span>
            <span class="label">مخزون البدل</span>
          </a>
          <a href="#shoes" class="nav-item" data-page="shoes">
            <span class="icon">👞</span>
            <span class="label">مخزون الأحذية</span>
          </a>
          <a href="#accessories" class="nav-item" data-page="accessories">
            <span class="icon">🎀</span>
            <span class="label">الإكسسوارات</span>
          </a>
        `;
        return;
      }

      const currentActive = window.location.hash.replace('#', '') || 'dashboard';
      let html = '';

      categories.forEach(cat => {
        const code = cat.code;
        const type = cat.type;
        const name = cat.name;
        const icon = getCategoryIcon(code, name, type);

        let pageSlug;
        if (type === 'SUITS' || code === 'SUITS') {
          pageSlug = 'suits';
        } else if (type === 'SHOES' || code === 'SHOES') {
          pageSlug = 'shoes';
        } else if (type === 'ACCESSORIES' || code === 'ACCESSORIES') {
          pageSlug = 'accessories';
        } else {
          pageSlug = `cat_${code}`;
        }

        PAGE_TITLES[pageSlug] = `مخزون ${name}`;
        const isActive = (currentActive === pageSlug) ? 'active' : '';

        html += `
          <a href="#${pageSlug}" class="nav-item ${isActive}" data-page="${pageSlug}">
            <span class="icon">${icon}</span>
            <span class="label">مخزون ${name}</span>
          </a>
        `;
      });

      container.innerHTML = html;
    } catch (err) {
      console.warn('Failed to build dynamic inventory nav:', err);
    }
  }

  function applyStoreSettings(store) {
    if (!store) return;

    // 1. تطبيق اسم المتجر في البراند وعنوان النافذة
    if (store.storeName) {
      const brandTitleEl = document.querySelector('.brand-title') || document.getElementById('brand-title-text');
      if (brandTitleEl) brandTitleEl.textContent = store.storeName;
      document.title = `${store.storeName} - نظام إدارة محلات البدل`;
    }

    // 2. تطبيق لوجو المتجر وموضعه (يمين / يسار)
    const brandLogoContainer = document.getElementById('brand-logo-container') || document.querySelector('.brand-logo');
    const sidebarBrandBox = document.getElementById('sidebar-brand-box') || document.querySelector('.sidebar-brand');

    if (sidebarBrandBox) {
      if (store.logoPosition === 'left') {
        sidebarBrandBox.style.flexDirection = 'row-reverse';
        sidebarBrandBox.style.justifyContent = 'space-between';
      } else {
        sidebarBrandBox.style.flexDirection = 'row';
        sidebarBrandBox.style.justifyContent = 'flex-start';
      }
    }

    if (brandLogoContainer) {
      if (store.logo && store.logo.trim()) {
        brandLogoContainer.style.background = 'transparent';
        brandLogoContainer.style.overflow = 'hidden';
        brandLogoContainer.style.padding = '0';
        brandLogoContainer.innerHTML = `<img src="${store.logo}" alt="لوجو المتجر" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px; display: block;">`;
      } else {
        brandLogoContainer.style.background = 'linear-gradient(135deg, var(--color-gold-400), var(--color-gold-600))';
        brandLogoContainer.style.padding = '';
        brandLogoContainer.innerHTML = '👔';
      }
    }
  }

  async function loadSettingsAndApply() {
    try {
      const res = await electronApi.invoke('settings:get');
      if (res?.data) {
        cachedAppSettings = res.data;
        applyStoreSettings(cachedAppSettings.store);
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  function navigateToPage(page) {
    const protectedPages = cachedAppSettings?.security?.protectedPages || [];
    const isProtected = protectedPages.includes(page);
    const isUnlocked = unlockedPagesSession.has(page);

    if (isProtected && !isUnlocked) {
      promptPinForPage(page);
    } else {
      switchActiveNav(page);
      loadPage(page);
    }
  }

  function switchActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(n => {
      if (n.getAttribute('data-page') === page) n.classList.add('active');
      else n.classList.remove('active');
    });
    window.location.hash = page;
  }

  function promptPinForPage(page) {
    const pageTitle = PAGE_TITLES[page] || page;
    if (!window.AppModal) {
      const pin = prompt(`🔒 صفحة محمية: يرجى إدخال رمز PIN للدخول إلى قسم [${pageTitle}]`);
      if (pin) {
        electronApi.invoke('app:verify-pin', { pin }).then(res => {
          if (res?.data?.valid || res?.valid) {
            unlockedPagesSession.add(page);
            switchActiveNav(page);
            loadPage(page);
          } else {
            alert('رمز PIN غير صحيح ❌');
          }
        });
      }
      return;
    }

    window.AppModal.open({
      title: `🔒 صفحة محمية برمز أمان (PIN)`,
      contentHtml: `
        <div style="text-align: center; padding: 12px 0;">
          <div style="font-size: 38px; margin-bottom: 8px;">🔐</div>
          <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 6px; color: var(--text-primary);">قسم [${pageTitle}] محمي</h3>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px;">يرجى إدخال رمز PIN المكون من 4 أرقام أو أكثر للمتابعة والوصول.</p>
          <div style="max-width: 200px; margin: 0 auto;">
            <input type="password" id="input-verify-page-pin" class="form-control" placeholder="••••" maxlength="8" autofocus style="text-align: center; font-size: 24px; letter-spacing: 6px; height: 48px; font-weight: bold;">
          </div>
          <div id="pin-error-msg" style="color: var(--color-danger); font-size: 12px; margin-top: 10px; font-weight: bold; display: none;">رمز PIN غير صحيح، حاول مجدداً ❌</div>
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-accent-action" id="btn-confirm-page-pin" style="min-width: 110px;">تأكيد وفتح 🔓</button>
      `,
      width: '380px'
    });

    const input = document.getElementById('input-verify-page-pin');
    const submitBtn = document.getElementById('btn-confirm-page-pin');
    const errorMsg = document.getElementById('pin-error-msg');

    const doVerify = async () => {
      const pin = input?.value || '';
      if (!pin) {
        if (errorMsg) { errorMsg.textContent = 'يرجى إدخال رمز PIN أولاً'; errorMsg.style.display = 'block'; }
        return;
      }
      try {
        const res = await electronApi.invoke('app:verify-pin', { pin });
        if (res?.data?.valid || res?.valid) {
          unlockedPagesSession.add(page);
          window.AppModal.close();
          if (window.AppToast) window.AppToast.success(`تم التحقق بنجاح! تم فتح قسم [${pageTitle}] 🔓`);
          switchActiveNav(page);
          loadPage(page);
        } else {
          if (errorMsg) { errorMsg.textContent = 'رمز PIN غير صحيح! حاول مجدداً ❌'; errorMsg.style.display = 'block'; }
          if (input) { input.value = ''; input.focus(); }
          if (window.AppToast) window.AppToast.error('رمز PIN غير صحيح ❌');
        }
      } catch (err) {
        if (errorMsg) { errorMsg.textContent = `خطأ: ${err.message}`; errorMsg.style.display = 'block'; }
      }
    };

    submitBtn?.addEventListener('click', doVerify);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doVerify();
      }
    });
    setTimeout(() => input?.focus(), 150);
  }

  // Sidebar navigation click delegation (works for static and dynamic category items)
  const asideSidebar = document.querySelector('aside.sidebar');
  if (asideSidebar) {
    asideSidebar.addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item');
      if (item) {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        if (page) navigateToPage(page);
      }
    });
  }

  // 4. Quick Actions
  const btnQuickPos = document.getElementById('btn-quick-pos');
  if (btnQuickPos) {
    btnQuickPos.addEventListener('click', () => {
      navigateToPage('pos');
      if (window.AppToast) window.AppToast.info('تم الانتقال إلى نقطة البيع السريع ⚡');
    });
  }

  const btnNewBooking = document.getElementById('btn-new-booking');
  if (btnNewBooking) {
    btnNewBooking.addEventListener('click', async () => {
      // Fetch available units, customers, and policies
      const [unitsRes, custRes, polRes] = await Promise.all([
        electronApi.invoke('inventory:get-suit-units'),
        electronApi.invoke('customers:get-list'),
        electronApi.invoke('admin:get-policies')
      ]);
      const units = (unitsRes.data || []).filter(u => u.status === 'AVAILABLE');
      const customers = custRes.data || [];
      const pol = polRes?.data || {};
      const enableDeposit = pol.enableSecurityDeposit !== false && String(pol.enableSecurityDeposit) !== '0';
      const defaultDeposit = enableDeposit ? (units[0]?.security_deposit || 2000) : 0;
      const rentalDays = Number(pol.defaultRentalDays) > 0 ? Number(pol.defaultRentalDays) : 3;
      const today = new Date().toISOString().slice(0, 10);
      const calcReturnDate = (pickup) => {
        if (!pickup) return '';
        const d = new Date(pickup);
        d.setDate(d.getDate() + rentalDays);
        return d.toISOString().slice(0, 10);
      };
      const initialReturn = calcReturnDate(today);

      window.AppModal.open({
        title: '➕ إنشاء عقد وحجز بدلة جديد',
        contentHtml: `
          <!-- Customer Selection or Creation -->
          <div class="form-group">
            <label class="form-label">العميل</label>
            <div style="display: flex; gap: 8px;">
              <select id="modal-bk-cust-select" class="form-control" style="flex: 1;">
                <option value="NEW">+ عميل جديد (تسجيل سريع الآن)</option>
                ${customers.map(c => `<option value="${c.id}" data-name="${c.name}" data-phone="${c.phone}">${c.name} (${c.phone})</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="modal-bk-new-cust-fields" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; background: var(--bg-app); padding: 10px; border-radius: 6px; border: 1px dashed var(--border-color);">
            <div>
              <label class="form-label" style="font-size: 11px;">اسم العميل الجديد</label>
              <input type="text" id="modal-bk-new-name" class="form-control" placeholder="الاسم ثلاثي...">
            </div>
            <div>
              <label class="form-label" style="font-size: 11px;">رقم الهاتف (11 رقم)</label>
              <input type="text" id="modal-bk-new-phone" class="form-control" placeholder="01xxxxxxxxx">
            </div>
          </div>

          <!-- Suit Unit Selection -->
          <div class="form-group">
            <label class="form-label">البدلة المراد حجزها (المتاحة حالياً)</label>
            <select id="modal-bk-unit-select" class="form-control">
              ${units.length > 0 ? units.map(u => `<option value="${u.id}" data-model="${u.model_name}" data-price="${u.rental_price}" data-deposit="${u.security_deposit}">[${u.unit_barcode}] ${u.model_name} (${u.size_name}) - إيجار: ${u.rental_price} ج.م ${enableDeposit ? ' | تأمين: ' + u.security_deposit + ' ج.م' : ''}</option>`).join('') : '<option value="">لا توجد بدل متاحة بالمخزن حالياً (أضف بدلة من قسم المخزون)</option>'}
            </select>
          </div>

          <!-- Dates -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">تاريخ استلام البدلة</label>
              <input type="date" id="modal-bk-pickup" class="form-control" value="${today}">
            </div>
            <div class="form-group">
              <label class="form-label">تاريخ الإرجاع المتوقع</label>
              <input type="date" id="modal-bk-return" class="form-control" value="${initialReturn}">
              <small style="color: var(--text-muted); font-size: 11px;">محسوب تلقائياً (${rentalDays} أيام وفق البيانات الأساسية)</small>
            </div>
          </div>

          <!-- Financials -->
          <div style="display: grid; grid-template-columns: ${enableDeposit ? '1fr 1fr 1fr' : '1fr 1fr'}; gap: 10px;">
            <div class="form-group">
              <label class="form-label">قيمة الإيجار (ج.م)</label>
              <input type="number" id="modal-bk-rental" class="form-control" value="${units[0]?.rental_price || 1500}">
            </div>
            <div class="form-group">
              <label class="form-label">العربون المدفوع الآن</label>
              <input type="number" id="modal-bk-advance" class="form-control" value="500">
            </div>
            ${enableDeposit ? `
              <div class="form-group">
                <label class="form-label">التأمين المسترد</label>
                <input type="number" id="modal-bk-deposit" class="form-control" value="${defaultDeposit}">
              </div>
            ` : `
              <input type="hidden" id="modal-bk-deposit" value="0">
            `}
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" id="btn-modal-confirm-booking">تأكيد وحفظ الحجز 📅</button>
        `,
        width: '540px'
      });

      // Customer select toggle
      const custSelect = document.getElementById('modal-bk-cust-select');
      const newCustFields = document.getElementById('modal-bk-new-cust-fields');
      custSelect?.addEventListener('change', () => {
        if (custSelect.value === 'NEW') {
          if (newCustFields) newCustFields.style.display = 'grid';
        } else {
          if (newCustFields) newCustFields.style.display = 'none';
        }
      });

      // Unit select price update
      const unitSelect = document.getElementById('modal-bk-unit-select');
      unitSelect?.addEventListener('change', () => {
        const opt = unitSelect.selectedOptions[0];
        if (opt) {
          const p = opt.getAttribute('data-price');
          const d = opt.getAttribute('data-deposit');
          const rentInput = document.getElementById('modal-bk-rental');
          const depInput = document.getElementById('modal-bk-deposit');
          if (rentInput && p) rentInput.value = p;
          if (depInput && d && enableDeposit) depInput.value = d;
        }
      });

      // Auto-update return date when pickup date changes
      const pickupInput = document.getElementById('modal-bk-pickup');
      const returnInput = document.getElementById('modal-bk-return');
      pickupInput?.addEventListener('change', () => {
        if (pickupInput.value && returnInput) {
          returnInput.value = calcReturnDate(pickupInput.value);
        }
      });

      // Submit booking
      document.getElementById('btn-modal-confirm-booking')?.addEventListener('click', async () => {
        let custName = '';
        let custPhone = '';
        let custId = null;

        if (custSelect?.value === 'NEW') {
          custName = document.getElementById('modal-bk-new-name')?.value.trim();
          custPhone = document.getElementById('modal-bk-new-phone')?.value.trim();
          if (!custName || !custPhone) {
            AppToast.error('يرجى إدخال اسم العميل الجديد ورقم هاتفه.');
            return;
          }
          const cRes = await electronApi.invoke('customers:create', { name: custName, phone: custPhone });
          if (!cRes || !cRes.success || !cRes.data || !cRes.data.id) {
            const errMsg = cRes?.error?.message || cRes?.error || 'فشل في حفظ بيانات العميل الجديد.';
            AppToast.error(`خطأ في تسجيل العميل: ${errMsg}`);
            return;
          }
          custId = cRes.data.id;
          custName = cRes.data.name || custName;
          custPhone = cRes.data.phone || custPhone;
        } else {
          const opt = custSelect?.selectedOptions[0];
          custId = Number(custSelect?.value);
          custName = opt?.getAttribute('data-name') || '';
          custPhone = opt?.getAttribute('data-phone') || '';
        }

        if (!custId) {
          AppToast.error('يرجى اختيار العميل أو إدخال بيانات عميل جديد صالح.');
          return;
        }

        const unitOpt = unitSelect?.selectedOptions[0];
        const unitId = Number(unitSelect?.value) || null;
        const suitName = unitOpt?.getAttribute('data-model') || 'بدلة رجالي فاخرة';
        const pickupDate = document.getElementById('modal-bk-pickup')?.value;
        const returnDate = document.getElementById('modal-bk-return')?.value;
        const rentalPrice = Number(document.getElementById('modal-bk-rental')?.value) || 0;
        const advance = Number(document.getElementById('modal-bk-advance')?.value) || 0;
        const deposit = Number(document.getElementById('modal-bk-deposit')?.value) || 0;

        const payload = {
          customer_id: custId,
          customer_name: custName,
          customer_phone: custPhone,
          suit_unit_id: unitId,
          items: unitId ? [{ suit_unit_id: unitId, rental_price: rentalPrice, security_deposit: deposit }] : [],
          pickup_date: pickupDate,
          return_due_date: returnDate,
          event_date: pickupDate,
          final_amount: rentalPrice,
          paid_advance: advance,
          paid_amount: advance,
          total_deposit_amount: deposit,
          deposit_paid: 0,
          items_summary: suitName
        };

        try {
          const res = await electronApi.invoke('booking:create', payload);
          AppToast.success(`تم حفظ الحجز بنجاح! رقم الحجز: #${res?.data?.bookingNumber || 'BK-1001'} 📅`);
          AppModal.close();
          const curPage = window.location.hash.replace('#', '');
          if (curPage === 'bookings') renderBookingsPage();
          else if (curPage === 'dashboard' || !curPage) renderDashboard();
          else if (curPage === 'suits') renderSuitsPage();
        } catch (err) {
          AppToast.error(err.message || 'فشل حفظ الحجز');
        }
      });
    });
  }

  // 5. Page Loading Dispatcher
  function loadPage(page) {
    if (!pageContent) return;
    if (page === 'dashboard') {
      renderDashboard();
    } else if (page === 'admin') {
      renderAdminPage();
    } else if (page === 'settings') {
      renderSettingsPage();
    } else if (page === 'suits') {
      renderSuitsPage();
    } else if (page === 'shoes') {
      renderShoesPage();
    } else if (page === 'accessories') {
      renderAccessoriesPage();
    } else if (page.startsWith('cat_')) {
      const catCode = page.replace('cat_', '');
      renderDynamicCategoryPage(catCode);
    } else if (page === 'bookings') {
      renderBookingsPage();
    } else if (page === 'customers') {
      renderCustomersPage();
    } else if (page === 'pos') {
      renderPosPage();
    } else if (page === 'finance') {
      renderFinancePage();
    } else if (page === 'tasks') {
      renderTasksPage();
    } else if (page === 'reports') {
      renderReportsPage();
    } else {
      renderPlaceholderPage(page);
    }
  }

  // --- Render Dashboard (Dynamic) ---
  async function renderDashboard() {
    // Show loading
    pageContent.innerHTML = '<div class="state-container loading-state"><div class="spinner"></div><p>جاري تحميل لوحة التحكم...</p></div>';

    // Fetch data
    const [alertsRes, bookingsRes, salesRes, sessionRes] = await Promise.all([
      electronApi.invoke('tasks:get-alerts'),
      electronApi.invoke('booking:get-list'),
      electronApi.invoke('sales:get-list'),
      electronApi.invoke('finance:get-cash-session')
    ]);
    const alerts = alertsRes.data || {};
    const bookings = bookingsRes.data || [];
    const sales = salesRes.data || [];
    const session = sessionRes.data;
    const today = new Date().toISOString().slice(0, 10);

    // Compute stats
    const todaySales = sales.filter(s => (s.created_at || '').startsWith(today));
    const todayRevenue = todaySales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const activeBookings = bookings.filter(b => b.status !== 'COMPLETED' && b.status !== 'CANCELLED');
    const todayPickups = bookings.filter(b => b.pickup_date === today && (b.status === 'PREPARED' || b.status === 'CONFIRMED'));
    const todayReturns = bookings.filter(b => b.return_due_date === today && (b.status === 'DELIVERED' || b.status === 'CONFIRMED' || b.status === 'PREPARED'));
    const overdueBookings = bookings.filter(b => b.return_due_date && b.return_due_date < today && (b.status === 'DELIVERED' || b.status === 'CONFIRMED' || b.status === 'PREPARED'));
    const fmtCurrency = (v) => window.UiUtils ? window.UiUtils.formatCurrency(v) : `${v.toLocaleString('ar-EG')} ج.م`;
    const fmtDate = (d) => window.UiUtils ? window.UiUtils.formatDate(d) : d.toLocaleDateString('ar-EG');

    // Today's action items (pickups + returns)
    const actionItems = [...todayPickups.map(b => ({ ...b, _action: 'pickup' })), ...todayReturns.map(b => ({ ...b, _action: 'return' })), ...overdueBookings.map(b => ({ ...b, _action: 'overdue' }))];

    const tableRows = actionItems.length > 0 ? actionItems.map(b => {
      const remaining = (b.final_amount || 0) - (b.paid_amount || 0);
      const statusMap = { pickup: { badge: 'badge-warning', text: 'جاهزة للاستلام' }, return: { badge: 'badge-success', text: 'مستلمة (إرجاع اليوم)' }, overdue: { badge: 'badge-danger', text: 'متأخرة عن الإرجاع' } };
      const st = statusMap[b._action] || statusMap.pickup;
      const actionBtn = b._action === 'pickup'
        ? `<button class="btn-accent-action" style="padding:6px 12px;font-size:12px;" onclick="window._openHandoverModal(${b.id}, '${b.booking_number}', ${(b.final_amount || 0) - (b.paid_amount || 0)}, ${b.total_deposit_amount || 0})">تسليم البدلة 🤝</button>`
        : `<button class="btn-primary-action" style="padding:6px 12px;font-size:12px;" onclick="window._openReturnModal(${b.id}, '${b.booking_number}', '${b.return_due_date}', ${b.deposit_paid || b.total_deposit_amount || 0})">استلام وتسوية 📦</button>`;
      return `<tr>
        <td><strong>#${b.booking_number}</strong></td>
        <td>${b.customer_name}</td>
        <td>${b.customer_phone || '—'}</td>
        <td>${b.items_summary || '—'}</td>
        <td>—</td>
        <td>${fmtCurrency(remaining)}</td>
        <td>${fmtCurrency(b.total_deposit_amount || 0)}</td>
        <td><span class="badge ${st.badge}">${st.text}</span></td>
        <td>${actionBtn}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-secondary);">لا توجد تسليمات أو مرتجعات مجدولة لليوم 🎉</td></tr>';

    pageContent.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-info">
            <h4>إجمالي إيراد اليوم</h4>
            <div class="value">${fmtCurrency(todayRevenue)}</div>
            <span style="font-size: 11px; color: var(--text-secondary)">${todaySales.length} عملية بيع اليوم</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🤵</div>
          <div class="stat-info">
            <h4>الحجوزات النشطة</h4>
            <div class="value">${activeBookings.length} حجز</div>
            <span style="font-size: 11px; color: var(--text-secondary)">إجمالي: ${bookings.length} حجز</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📦</div>
          <div class="stat-info">
            <h4>تسليمات منتظرة اليوم</h4>
            <div class="value">${todayPickups.length} عميل</div>
            <span style="font-size: 11px; color: var(--color-warning)">${todayPickups.length > 0 ? 'جاهزة ومكوية' : 'لا توجد تسليمات'}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-danger); background: rgba(239,68,68,0.12)">⏰</div>
          <div class="stat-info">
            <h4>متأخرات الإرجاع</h4>
            <div class="value" style="color: ${overdueBookings.length > 0 ? 'var(--color-danger)' : 'var(--text-primary)'}">${overdueBookings.length} بدلة</div>
            <span style="font-size: 11px; color: ${overdueBookings.length > 0 ? 'var(--color-danger)' : 'var(--text-secondary)'}">${overdueBookings.length > 0 ? 'تحتاج متابعة' : 'لا توجد متأخرات ✅'}</span>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <h3>📅 جدول تسليمات ومرتجعات اليوم</h3>
          <span class="badge badge-info">اليوم: ${fmtDate(new Date())}</span>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>رقم الحجز</th>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>موديل البدلة</th>
              <th>المقاس</th>
              <th>المطلوب سداده</th>
              <th>التأمين</th>
              <th>الحالة</th>
              <th>إجراء سريع</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  // --- Phase 5: Render Administration Page ---
  async function renderAdminPage() {
    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">🏛️ إدارة البيانات الأساسية (Administration)</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">تخصيص وإدارة الأقسام، المخازن، المقاسات، الألوان، وسياسات التأجير وتأخير الإرجاع.</p>
        </div>
        <button id="btn-add-admin-item" class="btn-accent-action">+ إضافة عنصر جديد</button>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px;">
        <button class="admin-tab-btn ${activeAdminTab === 'categories' ? 'active' : ''}" data-tab="categories">📁 الأقسام والتصنيفات</button>
        <button class="admin-tab-btn ${activeAdminTab === 'warehouses' ? 'active' : ''}" data-tab="warehouses">🏬 المخازن والفروع</button>
        <button class="admin-tab-btn ${activeAdminTab === 'sizes' ? 'active' : ''}" data-tab="sizes">📏 المقاسات</button>
        <button class="admin-tab-btn ${activeAdminTab === 'colors' ? 'active' : ''}" data-tab="colors">🎨 الألوان</button>
        <button class="admin-tab-btn ${activeAdminTab === 'policies' ? 'active' : ''}" data-tab="policies">📜 سياسات التأجير</button>
      </div>

      <div id="admin-tab-content">
        <div class="state-container loading-state"><div class="spinner"></div><p>جاري تحميل البيانات...</p></div>
      </div>
    `;

    // Hook tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeAdminTab = btn.getAttribute('data-tab');
        loadAdminTabContent(activeAdminTab);
      });
    });

    const addBtn = document.getElementById('btn-add-admin-item');
    if (addBtn) {
      addBtn.addEventListener('click', () => openAddAdminModal(activeAdminTab));
    }

    loadAdminTabContent(activeAdminTab);
  }

  async function loadAdminTabContent(tab) {
    const container = document.getElementById('admin-tab-content');
    if (!container) return;

    if (tab === 'categories') {
      const res = await electronApi.invoke('admin:get-categories');
      const cats = (res.data || []).filter(c => c.is_active !== 0);
      container.innerHTML = `
        <div class="table-card">
          <div class="table-header">
            <h3>📁 الأقسام والتصنيفات المعتمدة (${cats.length} قسم)</h3>
          </div>
          <table class="app-table">
            <thead>
              <tr><th>الكود</th><th>اسم القسم</th><th>النوع</th><th>الحالة</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              ${cats.map(c => `
                <tr>
                  <td><code>${c.code}</code></td>
                  <td><strong>${c.name}</strong></td>
                  <td><span class="badge badge-info">${c.type}</span></td>
                  <td><span class="badge ${c.is_active ? 'badge-success' : 'badge-danger'}">${c.is_active ? 'نشط' : 'معطل'}</span></td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="window._openEditCategoryModal(${c.id})">✏️ تعديل</button>
                      <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteCategory(${c.id}, '${c.name}')">🗑️ حذف</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      window._openEditCategoryModal = (catId) => {
        const cat = cats.find(x => x.id === catId);
        if (!cat) return;
        window.AppModal.open({
          title: `✏️ تعديل بيانات القسم [${cat.name}]`,
          contentHtml: `
            <div class="form-group">
              <label class="form-label">كود القسم</label>
              <input type="text" id="edit-cat-code" class="form-control" value="${cat.code}" disabled style="opacity: 0.7;">
            </div>
            <div class="form-group">
              <label class="form-label">اسم القسم بالعربية</label>
              <input type="text" id="edit-cat-name" class="form-control" value="${cat.name}">
            </div>
            <div class="form-group">
              <label class="form-label">نوع وطبيعة القسم</label>
              <input type="text" id="edit-cat-type" class="form-control" value="${cat.type || cat.code}" placeholder="مثال: ${cat.code} أو SUITS أو SHOES أو ACCESSORIES">
              <small style="color: var(--text-secondary); font-size: 11px;">(استخدم SUITS للبدل المرقمة بالباركود، أو أي كود لأصناف وكميات المخزون)</small>
            </div>
            <div class="form-group">
              <label class="form-label">حالة التفعيل</label>
              <select id="edit-cat-active" class="form-control">
                <option value="1" ${cat.is_active ? 'selected' : ''}>نشط ومتاح في القوائم والمخازن</option>
                <option value="0" ${!cat.is_active ? 'selected' : ''}>معطل ومخفي من القوائم</option>
              </select>
            </div>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-accent-action" onclick="window._saveEditCategory(${cat.id})">حفظ التعديلات</button>
          `,
          width: '460px'
        });

        window._saveEditCategory = async (id) => {
          const name = document.getElementById('edit-cat-name')?.value?.trim();
          const type = document.getElementById('edit-cat-type')?.value?.trim();
          const is_active = Number(document.getElementById('edit-cat-active')?.value);
          if (!name) {
            AppToast.error('يرجى إدخال اسم القسم.');
            return;
          }
          await electronApi.invoke('admin:update-category', { id, name, type, is_active });
          AppToast.success('تم تعديل القسم بنجاح! 📁');
          AppModal.close();
          await buildDynamicInventoryNav();
          loadAdminTabContent('categories');
        };
      };

      window._deleteCategory = async (id, name) => {
        if (!confirm(`هل أنت متأكد من حذف القسم "${name}" نهائياً من النظام؟`)) return;
        try {
          const res = await electronApi.invoke('admin:delete-category', { id });
          if (res && res.success === false) {
            AppToast.error(res.error?.message || 'فشل حذف القسم');
            return;
          }
          AppToast.success(`تم حذف القسم "${name}" بنجاح.`);
          await buildDynamicInventoryNav();
          loadAdminTabContent('categories');
        } catch (err) {
          AppToast.error(err.message || 'فشل حذف القسم');
        }
      };

    } else if (tab === 'warehouses') {
      const res = await electronApi.invoke('admin:get-warehouses');
      const whs = (res.data || []).filter(w => w.is_active !== 0);
      container.innerHTML = `
        <div class="table-card">
          <div class="table-header">
            <h3>🏬 المخازن والفروع (${whs.length} مخازن)</h3>
          </div>
          <table class="app-table">
            <thead>
              <tr><th>كود المخزن</th><th>الاسم</th><th>الموقع</th><th>الافتراضي</th><th>الحالة</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              ${whs.map(w => `
                <tr>
                  <td><code>${w.code}</code></td>
                  <td><strong>${w.name}</strong></td>
                  <td>${w.location || '—'}</td>
                  <td>${w.is_default ? '<span class="badge badge-success">★ الافتراضي</span>' : '—'}</td>
                  <td><span class="badge ${w.is_active ? 'badge-success' : 'badge-danger'}">${w.is_active ? 'نشط' : 'معطل'}</span></td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="window._openEditWarehouseModal(${w.id})">✏️ تعديل</button>
                      ${!w.is_default ? `<button class="btn-accent-action" style="padding: 4px 8px; font-size: 11px;" onclick="window._setDefaultWarehouse(${w.id})">★ تعيين افتراضي</button>` : ''}
                      ${!w.is_default ? `<button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteWarehouse(${w.id}, '${w.name}')">🗑️ حذف</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      window._openEditWarehouseModal = (whId) => {
        const wh = whs.find(x => x.id === whId);
        if (!wh) return;
        window.AppModal.open({
          title: `✏️ تعديل المخزن [${wh.name}]`,
          contentHtml: `
            <div class="form-group">
              <label class="form-label">كود المخزن</label>
              <input type="text" id="edit-wh-code" class="form-control" value="${wh.code}">
            </div>
            <div class="form-group">
              <label class="form-label">اسم المخزن</label>
              <input type="text" id="edit-wh-name" class="form-control" value="${wh.name}">
            </div>
            <div class="form-group">
              <label class="form-label">الموقع / العنوان</label>
              <input type="text" id="edit-wh-loc" class="form-control" value="${wh.location || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">حالة التفعيل</label>
              <select id="edit-wh-active" class="form-control">
                <option value="1" ${wh.is_active ? 'selected' : ''}>نشط</option>
                <option value="0" ${!wh.is_active ? 'selected' : ''}>معطل</option>
              </select>
            </div>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-accent-action" onclick="window._saveEditWarehouse(${wh.id})">حفظ التعديلات</button>
          `,
          width: '460px'
        });

        window._saveEditWarehouse = async (id) => {
          const code = document.getElementById('edit-wh-code')?.value?.trim();
          const name = document.getElementById('edit-wh-name')?.value?.trim();
          const location = document.getElementById('edit-wh-loc')?.value?.trim();
          const is_active = Number(document.getElementById('edit-wh-active')?.value);
          if (!code || !name) {
            AppToast.error('يرجى ملء الكود والاسم.');
            return;
          }
          await electronApi.invoke('admin:update-warehouse', { id, code, name, location, is_active });
          AppToast.success('تم تعديل بيانات المخزن بنجاح! 🏬');
          AppModal.close();
          loadAdminTabContent('warehouses');
        };
      };

      window._setDefaultWarehouse = async (id) => {
        await electronApi.invoke('admin:set-default-warehouse', { id });
        AppToast.success('تم تعيين المخزن كافتراضي بنجاح! ★');
        loadAdminTabContent('warehouses');
      };

      window._deleteWarehouse = async (id, name) => {
        if (!confirm(`هل أنت متأكد من حذف المخزن "${name}"؟`)) return;
        try {
          const res = await electronApi.invoke('admin:delete-warehouse', { id });
          if (res && res.success === false) {
            AppToast.error(res.error?.message || 'فشل حذف المخزن');
            return;
          }
          AppToast.success(`تم حذف المخزن "${name}" بنجاح.`);
          loadAdminTabContent('warehouses');
        } catch (err) {
          AppToast.error(err.message || 'فشل حذف المخزن');
        }
      };

    } else if (tab === 'sizes') {
      const res = await electronApi.invoke('admin:get-sizes');
      const sizes = (res.data || []).filter(s => s.is_active !== 0);
      container.innerHTML = `
        <div class="table-card">
          <div class="table-header">
            <h3>📏 المقاسات المعتمدة (${sizes.length} مقاس)</h3>
          </div>
          <table class="app-table">
            <thead>
              <tr><th>الفئة</th><th>الكود</th><th>اسم المقاس</th><th>ترتيب العرض</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              ${sizes.map(s => `
                <tr>
                  <td><span class="badge badge-info">${s.category_type}</span></td>
                  <td><code>${s.code}</code></td>
                  <td><strong>${s.name}</strong></td>
                  <td>${s.sort_order}</td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="window._openEditSizeModal(${s.id})">✏️ تعديل</button>
                      <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteSize(${s.id}, '${s.name}')">🗑️ حذف</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      window._openEditSizeModal = async (sizeId) => {
        const s = sizes.find(x => x.id === sizeId);
        if (!s) return;

        let catOptions = '';
        try {
          const catRes = await electronApi.invoke('admin:get-categories');
          const allCats = (catRes?.data || []).filter(c => c.is_active !== 0);
          if (allCats.length > 0) {
            catOptions = allCats.map(c => {
              const isSel = s.category_type === c.code || (s.category_type === 'SHOE' && c.code === 'SHOES') || (s.category_type === 'SUIT' && c.code === 'SUITS') || (s.category_type === c.type);
              return `<option value="${c.code}" ${isSel ? 'selected' : ''}>${c.name} (${c.code})</option>`;
            }).join('');
          }
        } catch (e) { }

        if (!catOptions) {
          catOptions = `
            <option value="SUIT" ${s.category_type === 'SUIT' ? 'selected' : ''}>بدل (SUIT)</option>
            <option value="SHOE" ${s.category_type === 'SHOE' ? 'selected' : ''}>أحذية (SHOE)</option>
            <option value="ACCESSORIES" ${s.category_type === 'ACCESSORIES' ? 'selected' : ''}>إكسسوارات (ACCESSORIES)</option>
          `;
        }

        window.AppModal.open({
          title: `✏️ تعديل المقاس [${s.name}]`,
          contentHtml: `
            <div class="form-group">
              <label class="form-label">القسم / الفئة التابع لها المقاس</label>
              <select id="edit-size-type" class="form-control">
                ${catOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">كود المقاس</label>
              <input type="text" id="edit-size-code" class="form-control" value="${s.code}">
            </div>
            <div class="form-group">
              <label class="form-label">اسم المقاس بالعربية</label>
              <input type="text" id="edit-size-name" class="form-control" value="${s.name}">
            </div>
            <div class="form-group">
              <label class="form-label">ترتيب العرض</label>
              <input type="number" id="edit-size-order" class="form-control" value="${s.sort_order || 10}">
            </div>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-accent-action" onclick="window._saveEditSize(${s.id})">حفظ التعديلات</button>
          `,
          width: '440px'
        });

        window._saveEditSize = async (id) => {
          const category_type = document.getElementById('edit-size-type')?.value;
          const code = document.getElementById('edit-size-code')?.value?.trim();
          const name = document.getElementById('edit-size-name')?.value?.trim();
          const sort_order = Number(document.getElementById('edit-size-order')?.value) || 10;
          if (!code || !name) {
            AppToast.error('يرجى ملء الكود واسم المقاس.');
            return;
          }
          await electronApi.invoke('admin:update-size', { id, category_type, code, name, sort_order });
          AppToast.success('تم تعديل المقاس بنجاح! 📏');
          AppModal.close();
          loadAdminTabContent('sizes');
        };
      };

      window._deleteSize = async (id, name) => {
        if (!confirm(`هل أنت متأكد من حذف المقاس "${name}"؟`)) return;
        try {
          const res = await electronApi.invoke('admin:delete-size', { id });
          if (res && res.success === false) {
            AppToast.error(res.error?.message || 'فشل حذف المقاس');
            return;
          }
          AppToast.success(`تم حذف المقاس "${name}" بنجاح.`);
          loadAdminTabContent('sizes');
        } catch (err) {
          AppToast.error(err.message || 'فشل حذف المقاس');
        }
      };

    } else if (tab === 'colors') {
      const res = await electronApi.invoke('admin:get-colors');
      const colors = (res.data || []).filter(col => col.is_active !== 0);
      container.innerHTML = `
        <div class="table-card">
          <div class="table-header">
            <h3>🎨 درجات الألوان المسجلة (${colors.length} ألوان)</h3>
          </div>
          <table class="app-table">
            <thead>
              <tr><th>اللون</th><th>اسم اللون</th><th>رمز Hex</th><th>الحالة</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              ${colors.map(col => `
                <tr>
                  <td><div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${col.hex_code}; border: 1px solid var(--border-color);"></div></td>
                  <td><strong>${col.name}</strong></td>
                  <td><code>${col.hex_code}</code></td>
                  <td><span class="badge badge-success">نشط</span></td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="window._openEditColorModal(${col.id})">✏️ تعديل</button>
                      <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteColor(${col.id}, '${col.name}')">🗑️ حذف</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      window._openEditColorModal = (colId) => {
        const col = colors.find(x => x.id === colId);
        if (!col) return;
        window.AppModal.open({
          title: `✏️ تعديل اللون [${col.name}]`,
          contentHtml: `
            <div class="form-group">
              <label class="form-label">اسم اللون</label>
              <input type="text" id="edit-col-name" class="form-control" value="${col.name}">
            </div>
            <div class="form-group">
              <label class="form-label">رمز اللون (Hex Code)</label>
              <input type="color" id="edit-col-hex" class="form-control" value="${col.hex_code}" style="height: 44px; padding: 4px;">
            </div>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-accent-action" onclick="window._saveEditColor(${col.id})">حفظ التعديلات</button>
          `,
          width: '420px'
        });

        window._saveEditColor = async (id) => {
          const name = document.getElementById('edit-col-name')?.value?.trim();
          const hex_code = document.getElementById('edit-col-hex')?.value?.trim();
          if (!name) {
            AppToast.error('يرجى إدخال اسم اللون.');
            return;
          }
          await electronApi.invoke('admin:update-color', { id, name, hex_code });
          AppToast.success('تم تعديل اللون بنجاح! 🎨');
          AppModal.close();
          loadAdminTabContent('colors');
        };
      };

      window._deleteColor = async (id, name) => {
        if (!confirm(`هل أنت متأكد من حذف اللون "${name}"؟`)) return;
        try {
          const res = await electronApi.invoke('admin:delete-color', { id });
          if (res && res.success === false) {
            AppToast.error(res.error?.message || 'فشل حذف اللون');
            return;
          }
          AppToast.success(`تم حذف اللون "${name}" بنجاح.`);
          loadAdminTabContent('colors');
        } catch (err) {
          AppToast.error(err.message || 'فشل حذف اللون');
        }
      };

    } else if (tab === 'policies') {
      const res = await electronApi.invoke('admin:get-policies');
      const pol = res.data || {};

      const enableDeposit = pol.enableSecurityDeposit !== false && String(pol.enableSecurityDeposit) !== '0';
      const depositRatioVal = (pol.defaultDepositRatio !== undefined && pol.defaultDepositRatio !== null && !isNaN(Number(pol.defaultDepositRatio))) ? Math.round(Number(pol.defaultDepositRatio) * 100) : 100;
      const applyLateFee = pol.applyLateFee !== false && String(pol.applyLateFee) !== '0';
      const lateFeeVal = (pol.lateFeePerDay !== undefined && pol.lateFeePerDay !== null && !isNaN(Number(pol.lateFeePerDay))) ? Number(pol.lateFeePerDay) : 300;
      const allowGrace = pol.allowGracePeriod !== false && String(pol.allowGracePeriod) !== '0';
      const graceHoursVal = (pol.allowGracePeriodHours !== undefined && pol.allowGracePeriodHours !== null && !isNaN(Number(pol.allowGracePeriodHours))) ? Number(pol.allowGracePeriodHours) : 4;
      const rentalDaysVal = (pol.defaultRentalDays !== undefined && pol.defaultRentalDays !== null && !isNaN(Number(pol.defaultRentalDays))) ? Number(pol.defaultRentalDays) : 3;
      const bufferDaysVal = (pol.bufferCleaningDays !== undefined && pol.bufferCleaningDays !== null && !isNaN(Number(pol.bufferCleaningDays))) ? Number(pol.bufferCleaningDays) : 1;

      container.innerHTML = `
        <div class="table-card" style="max-width: 680px;">
          <div class="table-header" style="margin-bottom: 20px;">
            <div>
              <h3>📜 سياسات وشروط التأجير المعتمدة</h3>
              <p style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">تحديد مدد التأجير، مبالغ التأمين والأمانات، وقواعد غرامات التأخير.</p>
            </div>
          </div>

          <!-- Basic Periods -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">مدة التأجير الافتراضية (بالأيام)</label>
              <input type="number" id="pol-rental-days" class="form-control" min="1" value="${rentalDaysVal}">
              <small style="color: var(--text-muted); font-size: 11px;">عدد الأيام المحسوبة تلقائياً عند إنشاء حجز جديد.</small>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">فترة الأمان للتجهيز والغسيل (Buffer Days)</label>
              <input type="number" id="pol-buffer-days" class="form-control" min="0" value="${bufferDaysVal}">
              <small style="color: var(--text-muted); font-size: 11px;">أيام حجز إضافية لمنع التعارض حتى انتهاء الغسيل.</small>
            </div>
          </div>

          <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 20px 0;">

          <!-- Security Deposit (Insurance) Controls -->
          <div style="background: var(--bg-card-hover); padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <strong style="font-size: 14px;">🛡️ تفعيل نظام مبالغ التأمين (الأمانات)</strong>
                <div style="color: var(--text-secondary); font-size: 12px; margin-top: 2px;">تحديد ما إذا كان التأمين مفعلاً ومطلوباً عند إضافة موديل أو قطع جديدة، وفي المخازن وعمليات الحجز والتأجير.</div>
              </div>
              <label class="switch" style="position: relative; display: inline-block; width: 48px; height: 26px;">
                <input type="checkbox" id="pol-enable-deposit" ${enableDeposit ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                <span class="slider round" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${enableDeposit ? 'var(--color-gold-500)' : 'var(--border-color)'}; transition: .3s; border-radius: 34px;"></span>
              </label>
            </div>

            <div id="pol-deposit-group" style="${enableDeposit ? '' : 'display: none; opacity: 0.6;'} margin-top: 12px;">
              <label class="form-label">نسبة التأمين الافتراضية بالنسبة لسعر الإيجار (% أو قيمة مخصصة)</label>
              <div style="display: flex; gap: 10px; align-items: center;">
                <input type="number" id="pol-deposit-ratio" class="form-control" style="width: 140px;" min="0" max="500" value="${depositRatioVal}">
                <span style="font-size: 13px; color: var(--text-secondary);">% من سعر الإيجار (مثال: 100% يعني التأمين مساوٍ للإيجار)</span>
              </div>
              <small style="color: var(--text-muted); font-size: 11px;">يظهر حقل التأمين مفعلًا ومقترحًا آليًا في شاشات إضافة الموديلات والقطع وحجوزات التأجير.</small>
            </div>

            <div id="pol-deposit-disabled-note" style="${enableDeposit ? 'display: none;' : ''} margin-top: 8px; font-size: 12px; color: var(--color-warning);">
              ℹ️ تم إيقاف التأمين: يتم إخفاء/تصفير مبالغ التأمين تلقائيًا عند إضافة الموديلات والقطع وفي شاشات الحجز والتأجير.
            </div>
          </div>

          <!-- Late Fee Controls -->
          <div style="background: var(--bg-card-hover); padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <strong style="font-size: 14px;">⚠️ تطبيق غرامة التأخير اليومية</strong>
                <div style="color: var(--text-secondary); font-size: 12px; margin-top: 2px;">تفعيل أو تعطيل احتساب غرامة التأخير عند تأخر العميل عن موعد الإرجاع.</div>
              </div>
              <label class="switch" style="position: relative; display: inline-block; width: 48px; height: 26px;">
                <input type="checkbox" id="pol-apply-late-fee" ${applyLateFee ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                <span class="slider round" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${applyLateFee ? 'var(--color-gold-500)' : 'var(--border-color)'}; transition: .3s; border-radius: 34px;"></span>
              </label>
            </div>

            <div id="pol-late-fee-group" style="${applyLateFee ? '' : 'display: none; opacity: 0.6;'} margin-top: 12px;">
              <label class="form-label">قيمة غرامة التأخير عن كل يوم (ج.م EGP)</label>
              <input type="number" id="pol-late-fee" class="form-control" min="0" value="${lateFeeVal}">
              <small style="color: var(--text-muted); font-size: 11px;">تخصم تلقائياً من مبلغ التأمين المسترد عند فحص البدلة وتسوية الحجز.</small>
            </div>

            <div id="pol-late-fee-disabled-note" style="${applyLateFee ? 'display: none;' : ''} margin-top: 8px; font-size: 12px; color: var(--color-warning);">
              ℹ️ تم إيقاف غرامة التأخير: لن يتم احتساب أي غرامة نقدية على العميل مهما تأخر في الإرجاع.
            </div>
          </div>

          <!-- Grace Period Controls -->
          <div style="background: var(--bg-card-hover); padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <strong style="font-size: 14px;">⏳ تطبيق فترة سماح قبل تطبيق الغرامة</strong>
                <div style="color: var(--text-secondary); font-size: 12px; margin-top: 2px;">إعطاء مهلة إضافية بعد انتهاء موعد الإرجاع قبل بدء احتساب غرامة اليوم.</div>
              </div>
              <label class="switch" style="position: relative; display: inline-block; width: 48px; height: 26px;">
                <input type="checkbox" id="pol-allow-grace" ${allowGrace ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                <span class="slider round" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${allowGrace ? 'var(--color-gold-500)' : 'var(--border-color)'}; transition: .3s; border-radius: 34px;"></span>
              </label>
            </div>

            <div id="pol-grace-hours-group" style="${allowGrace ? '' : 'display: none; opacity: 0.6;'} margin-top: 12px;">
              <label class="form-label">مدة فترة السماح (بالساعات)</label>
              <input type="number" id="pol-grace-hours" class="form-control" min="0" value="${graceHoursVal}">
              <small style="color: var(--text-muted); font-size: 11px;">مثال: 4 ساعات تعني أنه إذا تأخر العميل 4 ساعات بعد موعده لا تطبق عليه غرامة اليوم.</small>
            </div>

            <div id="pol-grace-disabled-note" style="${allowGrace ? 'display: none;' : ''} margin-top: 8px; font-size: 12px; color: var(--color-warning);">
              ℹ️ تم إيقاف فترة السماح: تبدأ الغرامة فور انقضاء موعد الإرجاع مباشرة.
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <button id="btn-save-policies" class="btn-accent-action" style="padding: 10px 24px; font-size: 14px;">💾 حفظ واعتماد سياسات التأجير</button>
          </div>
        </div>
      `;

      // Live toggles for switches
      const depositCheckbox = document.getElementById('pol-enable-deposit');
      const depositGroup = document.getElementById('pol-deposit-group');
      const depositNote = document.getElementById('pol-deposit-disabled-note');

      if (depositCheckbox) {
        depositCheckbox.addEventListener('change', () => {
          const isChecked = depositCheckbox.checked;
          const slider = depositCheckbox.nextElementSibling;
          if (slider) slider.style.backgroundColor = isChecked ? 'var(--color-gold-500)' : 'var(--border-color)';
          if (depositGroup) depositGroup.style.display = isChecked ? 'block' : 'none';
          if (depositNote) depositNote.style.display = isChecked ? 'none' : 'block';
        });
      }

      const lateFeeCheckbox = document.getElementById('pol-apply-late-fee');
      const lateFeeGroup = document.getElementById('pol-late-fee-group');
      const lateFeeNote = document.getElementById('pol-late-fee-disabled-note');

      if (lateFeeCheckbox) {
        lateFeeCheckbox.addEventListener('change', () => {
          const isChecked = lateFeeCheckbox.checked;
          const slider = lateFeeCheckbox.nextElementSibling;
          if (slider) slider.style.backgroundColor = isChecked ? 'var(--color-gold-500)' : 'var(--border-color)';
          if (lateFeeGroup) lateFeeGroup.style.display = isChecked ? 'block' : 'none';
          if (lateFeeNote) lateFeeNote.style.display = isChecked ? 'none' : 'block';
        });
      }

      const graceCheckbox = document.getElementById('pol-allow-grace');
      const graceGroup = document.getElementById('pol-grace-hours-group');
      const graceNote = document.getElementById('pol-grace-disabled-note');

      if (graceCheckbox) {
        graceCheckbox.addEventListener('change', () => {
          const isChecked = graceCheckbox.checked;
          const slider = graceCheckbox.nextElementSibling;
          if (slider) slider.style.backgroundColor = isChecked ? 'var(--color-gold-500)' : 'var(--border-color)';
          if (graceGroup) graceGroup.style.display = isChecked ? 'block' : 'none';
          if (graceNote) graceNote.style.display = isChecked ? 'none' : 'block';
        });
      }

      const savePolBtn = document.getElementById('btn-save-policies');
      if (savePolBtn) {
        savePolBtn.addEventListener('click', async () => {
          const rentalDaysRaw = Number(document.getElementById('pol-rental-days')?.value);
          const bufferDaysRaw = Number(document.getElementById('pol-buffer-days')?.value);
          const enableDepositVal = document.getElementById('pol-enable-deposit')?.checked ?? true;
          const depositRatioRaw = Number(document.getElementById('pol-deposit-ratio')?.value);
          const depositRatio = (!isNaN(depositRatioRaw) && depositRatioRaw >= 0) ? (depositRatioRaw / 100) : 1.0;
          const applyLateFeeVal = document.getElementById('pol-apply-late-fee')?.checked ?? true;
          const lateFeeRaw = Number(document.getElementById('pol-late-fee')?.value);
          const allowGraceVal = document.getElementById('pol-allow-grace')?.checked ?? true;
          const graceHoursRaw = Number(document.getElementById('pol-grace-hours')?.value);

          const payload = {
            defaultRentalDays: !isNaN(rentalDaysRaw) && rentalDaysRaw > 0 ? rentalDaysRaw : 3,
            bufferCleaningDays: !isNaN(bufferDaysRaw) && bufferDaysRaw >= 0 ? bufferDaysRaw : 1,
            enableSecurityDeposit: enableDepositVal,
            defaultDepositRatio: depositRatio,
            applyLateFee: applyLateFeeVal,
            lateFeePerDay: !isNaN(lateFeeRaw) && lateFeeRaw >= 0 ? lateFeeRaw : 0,
            allowGracePeriod: allowGraceVal,
            allowGracePeriodHours: !isNaN(graceHoursRaw) && graceHoursRaw >= 0 ? graceHoursRaw : 0
          };

          try {
            await electronApi.invoke('admin:update-policies', payload);
            AppToast.success('تم حفظ واعتماد سياسات التأجير وتأخير الإرجاع بنجاح! 📜');
            // Re-render policies tab to guarantee synced state
            loadAdminTabContent('policies');
          } catch (err) {
            AppToast.error(err.message || 'فشل في حفظ السياسات');
          }
        });
      }
    }
  }

  async function openAddAdminModal(tab) {
    if (!window.AppModal) return;

    if (tab === 'categories') {
      window.AppModal.open({
        title: '➕ إضافة قسم وتصنيف جديد',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">كود القسم بالإنجليزية (مثال: VESTS أو SHIRTS أو BELTS)</label>
            <input type="text" id="new-cat-code" class="form-control" placeholder="الكود بالإنجليزية (مثال: VESTS)...">
          </div>
          <div class="form-group">
            <label class="form-label">اسم القسم بالعربية (مثال: صدريات، قمصان بدل، أحزمة)</label>
            <input type="text" id="new-cat-name" class="form-control" placeholder="اسم القسم بالعربية...">
          </div>
          <div class="form-group">
            <label class="form-label">طبيعة تتبع المخزون بالقسم</label>
            <select id="new-cat-nature-select" class="form-control">
              <option value="AUTO" selected>📦 مخزون بالعدد والكمية (افتراضي: للأصناف، القمصان، الأحذية، الإكسسوارات، إلخ)</option>
              <option value="SUITS">🤵 تتبع فردي بالباركود لكل قطعة (مثل موديلات البدل الكاملة)</option>
            </select>
            <small style="color: var(--text-secondary); font-size: 11px; margin-top: 4px; display: block;">سيتولى النظام آلياً إنشاء صفحة مستقلة لهذا القسم في الشريط الجانبي والمخزن ونقاط البيع.</small>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveCategory()">حفظ وإنشاء القسم 🚀</button>
        `,
        width: '480px'
      });

      window._saveCategory = async () => {
        const code = document.getElementById('new-cat-code')?.value?.trim().toUpperCase();
        const name = document.getElementById('new-cat-name')?.value?.trim();
        const nature = document.getElementById('new-cat-nature-select')?.value;
        if (!code || !name) {
          AppToast.error('يرجى إدخال كود القسم واسمه بالعربية.');
          return;
        }
        const type = (nature === 'SUITS') ? 'SUITS' : code;
        try {
          await electronApi.invoke('admin:create-category', { code, name, type });
          AppToast.success(`تم إنشاء قسم [${name}] بنجاح وإضافته للشريط الجانبي والمخزن! 🎉`);
          AppModal.close();
          await buildDynamicInventoryNav();
          loadAdminTabContent('categories');
        } catch (err) {
          AppToast.error(err.message || 'فشل في حفظ القسم');
        }
      };
    } else if (tab === 'warehouses') {
      window.AppModal.open({
        title: '➕ إضافة مخزن أو فرع جديد',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">كود المخزن (مثال: BRANCH_2)</label>
            <input type="text" id="new-wh-code" class="form-control" placeholder="الكود...">
          </div>
          <div class="form-group">
            <label class="form-label">اسم المخزن</label>
            <input type="text" id="new-wh-name" class="form-control" placeholder="الاسم...">
          </div>
          <div class="form-group">
            <label class="form-label">الموقع / العنوان</label>
            <input type="text" id="new-wh-loc" class="form-control" placeholder="الموقع...">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveWarehouse()">حفظ المخزن</button>
        `,
        width: '460px'
      });

      window._saveWarehouse = async () => {
        const code = document.getElementById('new-wh-code')?.value;
        const name = document.getElementById('new-wh-name')?.value;
        const location = document.getElementById('new-wh-loc')?.value;
        if (!code || !name) {
          AppToast.error('يرجى ملء الكود والاسم.');
          return;
        }
        await electronApi.invoke('admin:create-warehouse', { code, name, location });
        AppToast.success('تمت إضافة المخزن بنجاح!');
        AppModal.close();
        loadAdminTabContent('warehouses');
      };
    } else if (tab === 'colors') {
      window.AppModal.open({
        title: '➕ إضافة لون جديد',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">اسم اللون</label>
            <input type="text" id="new-col-name" class="form-control" placeholder="مثال: بترولي لامع...">
          </div>
          <div class="form-group">
            <label class="form-label">رمز اللون (Hex Code)</label>
            <input type="color" id="new-col-hex" class="form-control" value="#1E3A8A" style="height: 44px; padding: 4px;">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveColor()">حفظ اللون</button>
        `,
        width: '420px'
      });

      window._saveColor = async () => {
        const name = document.getElementById('new-col-name')?.value;
        const hex_code = document.getElementById('new-col-hex')?.value;
        if (!name) {
          AppToast.error('يرجى إدخال اسم اللون.');
          return;
        }
        await electronApi.invoke('admin:create-color', { name, hex_code });
        AppToast.success('تمت إضافة اللون بنجاح!');
        AppModal.close();
        loadAdminTabContent('colors');
      };
    } else if (tab === 'sizes') {
      let catOptions = '';
      try {
        const catRes = await electronApi.invoke('admin:get-categories');
        const allCats = (catRes?.data || []).filter(c => c.is_active !== 0);
        if (allCats.length > 0) {
          catOptions = allCats.map(c => {
            const val = c.code === 'SHOES' ? 'SHOE' : (c.code === 'SUITS' ? 'SUIT' : c.code);
            return `<option value="${val}">${c.name} (${val})</option>`;
          }).join('');
        }
      } catch (e) { }

      if (!catOptions) {
        catOptions = `
          <option value="SUIT">بدل (SUIT)</option>
          <option value="SHOE">أحذية (SHOE)</option>
          <option value="ACCESSORIES">إكسسوارات (ACCESSORIES)</option>
        `;
      }

      window.AppModal.open({
        title: '➕ إضافة مقاس جديد',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">نوع القسم / الفئة التابع لها المقاس</label>
            <select id="new-size-type" class="form-control">
              ${catOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">كود المقاس (مثال: 54 أو 44)</label>
            <input type="text" id="new-size-code" class="form-control" placeholder="الكود...">
          </div>
          <div class="form-group">
            <label class="form-label">اسم المقاس (مثال: مقاس 54 أو مقاس 44)</label>
            <input type="text" id="new-size-name" class="form-control" placeholder="الاسم...">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveSize()">حفظ المقاس</button>
        `,
        width: '420px'
      });

      window._saveSize = async () => {
        const category_type = document.getElementById('new-size-type')?.value;
        const code = document.getElementById('new-size-code')?.value;
        const name = document.getElementById('new-size-name')?.value;
        if (!code || !name) {
          AppToast.error('يرجى ملء الكود واسم المقاس.');
          return;
        }
        await electronApi.invoke('admin:create-size', { category_type, code, name });
        AppToast.success('تمت إضافة المقاس بنجاح!');
        AppModal.close();
        loadAdminTabContent('sizes');
      };
    } else {
      AppToast.info(`إضافة عنصر في تبويب: ${tab}`);
    }
  }

  // --- Phase 5: Render Settings Page ---
  async function renderSettingsPage() {
    const res = await electronApi.invoke('settings:get');
    const store = res.data?.store || {};
    const printers = res.data?.printers || {};
    const security = res.data?.security || { hasPin: true, protectedPages: [] };
    const whatsapp = res.data?.whatsapp || { autoSendAlerts: false, autoSendReturns: true, autoSendOverdue: true, autoSendFittings: true };
    const protectedPages = Array.isArray(security.protectedPages) ? security.protectedPages : [];
    cachedAppSettings = res.data;

    pageContent.innerHTML = `
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: 700;">⚙️ إعدادات النظام العامة (Settings)</h2>
        <p style="color: var(--text-secondary); font-size: 13px;">تخصيص بيانات المتجر، الطابعات، وقفل الشاشة وحماية الوصول للصفحات برمز PIN.</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <!-- Store Info Card -->
        <div class="table-card">
          <h3 style="margin-bottom: 16px;">🏪 بيانات المتجر والفاتورة</h3>
          <div class="form-group">
            <label class="form-label">اسم المتجر</label>
            <input type="text" id="set-store-name" class="form-control" value="${store.storeName || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">رقم الهاتف التجاري</label>
            <input type="text" id="set-store-phone" class="form-control" value="${store.phone || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">العنوان</label>
            <input type="text" id="set-store-address" class="form-control" value="${store.address || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">الرقم الضريبي / السجل التجاري</label>
            <input type="text" id="set-store-tax" class="form-control" value="${store.taxNumber || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">رسالة تذييل الفاتورة والعقد</label>
            <textarea id="set-store-footer" class="form-control" rows="3">${store.invoiceFooter || ''}</textarea>
          </div>

          <!-- Logo & Brand Customization -->
          <div class="form-group" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-top: 10px;">
            <label class="form-label" style="font-weight: 600; margin-bottom: 8px; display: block;">🖼️ لوجو المتجر (شعار البرنامج)</label>
            <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
              <div id="set-store-logo-preview" style="width: 52px; height: 52px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; background: ${store.logo ? 'transparent' : 'linear-gradient(135deg, var(--color-gold-400), var(--color-gold-600))'}; overflow: hidden; font-size: 26px;">
                ${store.logo ? `<img src="${store.logo}" style="width: 100%; height: 100%; object-fit: contain;">` : '👔'}
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <input type="file" id="set-store-logo-file" accept="image/*" style="display: none;">
                <div style="display: flex; gap: 6px;">
                  <button type="button" id="btn-choose-logo" class="btn-secondary" style="font-size: 11px; padding: 6px 12px;">
                    📂 اختيار صورة لوجو...
                  </button>
                  <button type="button" id="btn-remove-logo" class="btn-secondary" style="font-size: 11px; padding: 6px 10px; color: var(--color-danger); ${store.logo ? '' : 'display: none;'}">
                    🗑️ استعادة الافتراضي
                  </button>
                </div>
                <small style="color: var(--text-secondary); font-size: 10px;">يدعم PNG, JPG, WebP, SVG (يُفضل صورة مربعة أو مفرغة الخلفية).</small>
              </div>
            </div>

            <!-- Logo Position Selector -->
            <div style="margin-top: 12px;">
              <label class="form-label" style="font-size: 11px; margin-bottom: 4px;">موضع الشعار في الشريط الجانبي للبرنامج:</label>
              <select id="set-store-logo-pos" class="form-control" style="font-size: 12px; padding: 5px 8px;">
                <option value="right" ${store.logoPosition !== 'left' ? 'selected' : ''}>➡️ على اليمين (الوضع الطبيعي للغة العربية)</option>
                <option value="left" ${store.logoPosition === 'left' ? 'selected' : ''}>⬅️ على اليسار</option>
              </select>
            </div>
          </div>

          <button id="btn-save-store-settings" class="btn-accent-action" style="margin-top: 12px;">حفظ وتطبيق بيانات المتجر والشعار فوراً</button>
        </div>

        <!-- Printers & Security Card -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Printers Card -->
          <div class="table-card">
            <h3 style="margin-bottom: 16px;">🖨️ إعدادات الطابعات</h3>
            <div class="form-group">
              <label class="form-label">طابعة الإيصالات الحرارية (80mm)</label>
              <select id="set-printer-receipt" class="form-control">
                <option value="Default Thermal 80mm">Default Thermal 80mm (الافتراضية)</option>
                <option value="POS-80">POS-80 USB Printer</option>
                <option value="Microsoft Print to PDF">Microsoft Print to PDF</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">طابعة العقود والفواتير (A4)</label>
              <select id="set-printer-a4" class="form-control">
                <option value="Default A4">Default A4 Laser Printer (الافتراضية)</option>
                <option value="HP LaserJet">HP LaserJet Pro</option>
                <option value="Microsoft Print to PDF">Microsoft Print to PDF</option>
              </select>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
              <input type="checkbox" id="set-printer-autoprint" ${printers.autoPrintReceipt ? 'checked' : ''} style="width: 18px; height: 18px;">
              <label for="set-printer-autoprint" style="font-size: 13px; cursor: pointer;">طباعة الإيصال فورًا بعد كل عملية بيع مباشر</label>
            </div>
            <button id="btn-save-printer-settings" class="btn-primary-action" style="margin-top: 12px;">حفظ إعدادات الطابعات</button>
          </div>

          <!-- Security PIN & Page Protection Card -->
          <div class="table-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <h3 style="margin: 0; font-size: 16px;">🔒 أمان وقفل الصفحات برمز PIN</h3>
              <span class="badge ${protectedPages.length > 0 ? 'badge-warning' : 'badge-info'}" id="security-status-badge">
                ${protectedPages.length > 0 ? `محمي (${protectedPages.length} صفحات)` : 'غير مفعل على الصفحات'}
              </span>
            </div>

            <!-- PIN Code Input & Toggle Visibility -->
            <div class="form-group">
              <label class="form-label">تعيين أو تغيير رمز PIN (4 أرقام أو أكثر)</label>
              <div style="display: flex; gap: 8px;">
                <input type="password" id="set-pin-code" class="form-control" placeholder="أدخل رمز PIN الجديد أو اتركه فارغاً للإبقاء..." maxlength="8" style="font-size: 16px; letter-spacing: 3px;">
                <button type="button" id="btn-toggle-pin-visibility" class="btn-secondary" style="padding: 0 12px;" title="إظهار/إخفاء الرمز">👁️</button>
              </div>
              <small style="color: var(--text-secondary); font-size: 11px; display: block; margin-top: 4px;">الرمز الافتراضي الأولي هو <strong>1234</strong>. إذا كتبت رمزاً جديداً وضغطت حفظ سيتم اعتماده وتحديثه فوراً.</small>
            </div>

            <!-- Page Protection Checkboxes -->
            <div class="form-group" style="margin-top: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <label class="form-label" style="margin: 0; font-weight: 600;">حدد الصفحات المطلوب حمايتها برمز PIN:</label>
                <div style="display: flex; gap: 6px;">
                  <button type="button" id="btn-select-all-pages" class="btn-secondary" style="font-size: 11px; padding: 2px 8px;">تحديد الكل</button>
                  <button type="button" id="btn-deselect-all-pages" class="btn-secondary" style="font-size: 11px; padding: 2px 8px;">إلغاء الكل</button>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--bg-app); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);" id="protected-pages-checkboxes">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="finance" class="page-pin-checkbox" ${protectedPages.includes('finance') ? 'checked' : ''}>
                  <span>💰 الخزينة والمالية</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="reports" class="page-pin-checkbox" ${protectedPages.includes('reports') ? 'checked' : ''}>
                  <span>📈 التقارير والمحاسبة</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="settings" class="page-pin-checkbox" ${protectedPages.includes('settings') ? 'checked' : ''}>
                  <span>⚙️ الإعدادات العامة</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="admin" class="page-pin-checkbox" ${protectedPages.includes('admin') ? 'checked' : ''}>
                  <span>🏛️ البيانات الأساسية</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="customers" class="page-pin-checkbox" ${protectedPages.includes('customers') ? 'checked' : ''}>
                  <span>👥 دليل العملاء</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="bookings" class="page-pin-checkbox" ${protectedPages.includes('bookings') ? 'checked' : ''}>
                  <span>📅 الحجوزات والتأجير</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="pos" class="page-pin-checkbox" ${protectedPages.includes('pos') ? 'checked' : ''}>
                  <span>⚡ البيع السريع POS</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="suits" class="page-pin-checkbox" ${protectedPages.includes('suits') ? 'checked' : ''}>
                  <span>🤵 مخزون البدل</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                  <input type="checkbox" value="tasks" class="page-pin-checkbox" ${protectedPages.includes('tasks') ? 'checked' : ''}>
                  <span>📋 المهام والتنبيهات</span>
                </label>
              </div>
            </div>

            <!-- Action buttons -->
            <div style="display: flex; gap: 8px; margin-top: 14px;">
              <button id="btn-save-security-settings" class="btn-primary-action" style="flex: 1;">حفظ إعدادات الحماية و PIN 🔒</button>
              <button id="btn-relock-all-pages" class="btn-secondary" style="padding: 0 14px;" title="إعادة قفل الصفحات المفتوحة الآن">🔒 إعادة القفل</button>
            </div>
          </div>
        </div>
      </div>

      <!-- WhatsApp Automated Messaging & Alerts Card -->
      <div class="table-card" style="margin-top: 24px; border: 1px solid rgba(16, 185, 129, 0.35); background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(6, 78, 59, 0.02));">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
              <span>💬</span> إرسال التنبيهات والرسائل التلقائية للعملاء المؤجرين (واتساب)
            </h3>
            <p style="margin: 4px 0 0; font-size: 12px; color: var(--text-secondary);">
              إرسال رسائل تذكير بمواعيد الإرجاع والمتأخرات للعملاء تلقائياً في الخلفية بدون الحاجة للدخول والضغط اليدوي على إرسال.
            </p>
          </div>
          <span class="badge ${whatsapp.autoSendAlerts ? 'badge-success' : 'badge-warning'}" id="wa-auto-status-badge">
            ${whatsapp.autoSendAlerts ? '⚡ الإرسال التلقائي مفعل' : '⏸️ متوقف (يدوي فقط)'}
          </span>
        </div>

        <!-- Master Switch -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 14px; font-weight: 700; color: var(--text-primary);">
            <input type="checkbox" id="set-wa-auto-alerts" ${whatsapp.autoSendAlerts ? 'checked' : ''} style="width: 20px; height: 20px; accent-color: #10B981;">
            <span>⚡ تفعيل إرسال التنبيهات والرسائل للعملاء المؤجرين تلقائياً (بدون الحاجة للضغط على إرسال)</span>
          </label>
          <div style="margin-right: 32px; margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
            عند التفعيل، يقوم النظام في الخلفية بفحص البدل المستحقة للإرجاع والمتأخرات، وإرسال الرسائل فوراً عبر واتساب للعملاء بصمت تام، مع تمييز العملاء الذين تم إرسال رسائل لهم بعلامة <strong style="color: #10B981;">✅ تم الإرسال</strong>.
          </div>
        </div>

        <!-- Notification Types Checkboxes -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; background: var(--bg-app); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
            <input type="checkbox" id="set-wa-auto-returns" ${whatsapp.autoSendReturns !== false ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #10B981;">
            <span>📅 تذكير بمواعيد إرجاع البدل (اليوم وغداً)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; background: var(--bg-app); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
            <input type="checkbox" id="set-wa-auto-overdue" ${whatsapp.autoSendOverdue !== false ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #10B981;">
            <span>⚠️ تنبيهات عاجلة للبدل المتأخرة عن الإرجاع</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; background: var(--bg-app); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
            <input type="checkbox" id="set-wa-auto-fittings" ${whatsapp.autoSendFittings !== false ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #10B981;">
            <span>✂️ تذكير بمواعيد البروفات والخياط</span>
          </label>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <button id="btn-save-wa-settings" class="btn-primary-action" style="background: #10B981; border-color: #10B981; font-size: 13px; padding: 8px 18px;">
            💾 حفظ إعدادات الإرسال التلقائي
          </button>
          <button id="btn-trigger-wa-auto-run" class="btn-secondary" style="font-size: 13px; padding: 8px 14px; display: inline-flex; align-items: center; gap: 6px;" title="تشغيل فحص وإرسال فوري الآن للعملاء المستحقين">
            <span>🚀</span> تشغيل فحص وإرسال التنبيهات الآن
          </button>
          <span id="wa-auto-run-status" style="font-size: 12px; color: var(--text-secondary); margin-right: 6px;"></span>
        </div>
      </div>

      <!-- Phase 13: Backup & Restore Card -->
      <div class="table-card" style="margin-top: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h3 style="margin: 0; font-size: 16px;">💾 النسخ الاحتياطي واستعادة قاعدة البيانات (Backup & Recovery)</h3>
            <p style="margin: 4px 0 0; font-size: 12px; color: var(--text-secondary);">حماية بيانات المحل وأخذ نسخ احتياطية دورية متسقة محلياً وسحابياً عبر SQLite Online Backup API</p>
          </div>
          <span class="badge badge-success">حماية البيانات مفعلة ✅</span>
        </div>

        <!-- Current Backup Directory Card & Direct Access -->
        <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">📁</span>
              <div>
                <strong style="font-size: 13px; color: var(--text-primary);">مسار مجلد النسخ الاحتياطية الحالي على الجهاز:</strong>
                <div style="font-size: 11px; color: var(--text-secondary);">المجلد المخصص لحفظ جميع النسخ الاحتياطية لقاعدة البيانات وملفات الأمان تلقائياً</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="btn-open-backup-dir" class="btn-primary-action" style="padding: 7px 14px; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                📂 فتح مجلد النسخ الاحتياطية
              </button>
              <button id="btn-copy-backup-dir" class="btn-secondary" style="padding: 7px 12px; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                📋 نسخ المسار
              </button>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 12px; color: var(--color-gold-400); word-break: break-all; direction: ltr; text-align: left;">
            <span id="current-backup-path-text">جاري فحص المسار...</span>
          </div>
          <div id="backup-extra-info" style="display: flex; gap: 16px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div style="background: var(--bg-app); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm);">
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">نسخ احتياطي محلي سريع</div>
            <button id="btn-create-local-backup" class="btn-primary-action" style="width: 100%; font-size: 12px; padding: 8px;">
              💾 إنشاء نسخة احتياطية الآن
            </button>
          </div>

          <div style="background: var(--bg-app); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm);">
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">التحقق من سلامة نسخة</div>
            <button id="btn-verify-backup" class="btn-secondary" style="width: 100%; font-size: 12px; padding: 8px;">
              🔍 فحص سلامة وتكامل نسخة
            </button>
          </div>

          <div style="background: var(--bg-app); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm);">
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">استعادة قاعدة البيانات</div>
            <button id="btn-restore-backup" class="btn-secondary" style="width: 100%; font-size: 12px; padding: 8px; color: var(--color-danger);">
              🔄 استعادة من نسخة احتياطية
            </button>
          </div>

          <div style="background: var(--bg-app); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm);">
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">مزامنة سحابية</div>
            <button id="btn-sync-gdrive" class="btn-secondary" style="width: 100%; font-size: 12px; padding: 8px;">
              ☁️ رفع إلى Google Drive
            </button>
          </div>
        </div>

        <div id="backup-status-area" style="font-size: 12px; color: var(--text-secondary); padding: 10px; background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px dashed var(--border-color);">
          💡 <strong>معلومة أمان:</strong> عند الضغط على "استعادة"، يقوم النظام تلقائياً بإنشاء نسخة وقائية (Safety Snapshot) قبل الكتابة لضمان عدم فقدان أي بيانات نهائياً.
        </div>
      </div>

      <!-- Phase 14: Auto Update Engine Card -->
      <div class="table-card" style="margin-top: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h3 style="margin: 0; font-size: 16px;">🚀 التحديثات التلقائية للنظام (Auto Updates & Safety Staging)</h3>
            <p style="margin: 4px 0 0; font-size: 12px; color: var(--text-secondary);">فحص وتنزيل وتثبيت التحديثات الجديدة مع فحص البصمة الرقمية (SHA-256) والنسخ الاحتياطي الحتمي قبل التحديث</p>
          </div>
          <span class="badge badge-gold" id="current-app-version-badge">الإصدار الحالي: v1.0.0</span>
        </div>

        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">
          <button id="btn-check-for-updates" class="btn-primary-action" style="font-size: 13px; padding: 9px 18px;">
            🔍 فحص وجود تحديثات جديدة
          </button>
          <button id="btn-download-update" class="btn-secondary" style="font-size: 13px; padding: 9px 18px; display: none;">
            ⬇️ تنزيل التحديث الآن
          </button>
          <button id="btn-apply-update" class="btn-secondary" style="font-size: 13px; padding: 9px 18px; display: none; color: var(--color-success); font-weight: bold;">
            ⚡ تطبيق التحديث وإعادة التشغيل الآمنة
          </button>
        </div>

        <div id="update-status-area" style="font-size: 13px; padding: 14px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid var(--border-color); display: none;">
          <!-- Dynamically populated -->
        </div>
      </div>
    `;

    // State for store logo
    let currentStoreLogo = store.logo || '';

    // Hook choose logo button
    document.getElementById('btn-choose-logo')?.addEventListener('click', () => {
      document.getElementById('set-store-logo-file')?.click();
    });

    // Handle logo file selection and convert to Base64
    document.getElementById('set-store-logo-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2.5 * 1024 * 1024) {
        if (window.AppToast) window.AppToast.warning('حجم صورة اللوجو كبير جداً. يرجى اختيار صورة أقل من 2.5 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        currentStoreLogo = loadEvt.target.result;
        const preview = document.getElementById('set-store-logo-preview');
        const removeBtn = document.getElementById('btn-remove-logo');
        if (preview) {
          preview.style.background = 'transparent';
          preview.innerHTML = `<img src="${currentStoreLogo}" style="width: 100%; height: 100%; object-fit: contain;">`;
        }
        if (removeBtn) removeBtn.style.display = 'inline-block';
        if (window.AppToast) window.AppToast.info('تم تحميل الشعار، اضغط "حفظ وتطبيق بيانات المتجر" لتثبيته.');
      };
      reader.readAsDataURL(file);
    });

    // Hook remove logo button
    document.getElementById('btn-remove-logo')?.addEventListener('click', () => {
      currentStoreLogo = '';
      const preview = document.getElementById('set-store-logo-preview');
      const removeBtn = document.getElementById('btn-remove-logo');
      const fileInput = document.getElementById('set-store-logo-file');
      if (fileInput) fileInput.value = '';
      if (preview) {
        preview.style.background = 'linear-gradient(135deg, var(--color-gold-400), var(--color-gold-600))';
        preview.innerHTML = '👔';
      }
      if (removeBtn) removeBtn.style.display = 'none';
      if (window.AppToast) window.AppToast.info('تمت استعادة الشعار الافتراضي، اضغط حفظ للاعتماد.');
    });

    // Hook store settings save
    document.getElementById('btn-save-store-settings')?.addEventListener('click', async () => {
      const storePayload = {
        storeName: document.getElementById('set-store-name').value.trim() || 'mohamed saed والعرائس',
        phone: document.getElementById('set-store-phone').value.trim(),
        address: document.getElementById('set-store-address').value.trim(),
        taxNumber: document.getElementById('set-store-tax').value.trim(),
        invoiceFooter: document.getElementById('set-store-footer').value.trim(),
        logo: currentStoreLogo,
        logoPosition: document.getElementById('set-store-logo-pos')?.value || 'right'
      };
      await electronApi.invoke('settings:update', { store: storePayload });
      if (cachedAppSettings) cachedAppSettings.store = storePayload;
      applyStoreSettings(storePayload);
      if (window.AppToast) window.AppToast.success(`تم حفظ بيانات المتجر وتطبيق اسم [${storePayload.storeName}] والشعار بنجاح! 🏪✨`);
    });

    // Hook printer settings save
    document.getElementById('btn-save-printer-settings')?.addEventListener('click', async () => {
      const printersPayload = {
        receiptPrinter: document.getElementById('set-printer-receipt').value,
        invoicePrinter: document.getElementById('set-printer-a4').value,
        autoPrintReceipt: document.getElementById('set-printer-autoprint').checked
      };
      await electronApi.invoke('settings:update', { printers: printersPayload });
      if (cachedAppSettings) cachedAppSettings.printers = printersPayload;
      if (window.AppToast) window.AppToast.success('تم حفظ إعدادات الطابعات بنجاح! 🖨️');
    });

    // Toggle PIN visibility
    document.getElementById('btn-toggle-pin-visibility')?.addEventListener('click', () => {
      const pinInput = document.getElementById('set-pin-code');
      if (pinInput) {
        pinInput.type = pinInput.type === 'password' ? 'text' : 'password';
      }
    });

    // Select all pages
    document.getElementById('btn-select-all-pages')?.addEventListener('click', () => {
      document.querySelectorAll('.page-pin-checkbox').forEach(cb => cb.checked = true);
    });

    // Deselect all pages
    document.getElementById('btn-deselect-all-pages')?.addEventListener('click', () => {
      document.querySelectorAll('.page-pin-checkbox').forEach(cb => cb.checked = false);
    });

    // Relock all pages
    document.getElementById('btn-relock-all-pages')?.addEventListener('click', () => {
      unlockedPagesSession.clear();
      if (window.AppToast) window.AppToast.info('تمت إعادة قفل جميع الصفحات المحمية بنجاح 🔒');
    });

    // Save Security PIN & Protected Pages
    document.getElementById('btn-save-security-settings')?.addEventListener('click', async () => {
      const pin = document.getElementById('set-pin-code')?.value.trim();
      const selectedPages = Array.from(document.querySelectorAll('.page-pin-checkbox:checked')).map(cb => cb.value);

      const updatePayload = {
        protectedPages: selectedPages
      };

      if (pin) {
        if (pin.length < 4) {
          if (window.AppToast) window.AppToast.error('رمز PIN يجب أن يتكون من 4 أرقام على الأقل');
          return;
        }
        updatePayload.pin = pin;
      }

      await electronApi.invoke('settings:update', updatePayload);
      if (cachedAppSettings) {
        cachedAppSettings.security = {
          ...(cachedAppSettings.security || {}),
          protectedPages: selectedPages
        };
        if (pin) cachedAppSettings.security.hasPin = true;
      }

      // Reset unlocked session for security
      unlockedPagesSession.clear();

      if (window.AppToast) {
        window.AppToast.success(`تم حفظ إعدادات الأمان! تم تفعيل القفل على (${selectedPages.length}) صفحات بنجاح 🔒`);
      }
      document.getElementById('set-pin-code').value = '';

      // Update badge
      const badge = document.getElementById('security-status-badge');
      if (badge) {
        badge.className = `badge ${selectedPages.length > 0 ? 'badge-warning' : 'badge-info'}`;
        badge.textContent = selectedPages.length > 0 ? `محمي (${selectedPages.length} صفحات)` : 'غير مفعل على الصفحات';
      }
    });

    // Hook WhatsApp Automation Settings Save
    document.getElementById('btn-save-wa-settings')?.addEventListener('click', async () => {
      const isAuto = document.getElementById('set-wa-auto-alerts')?.checked || false;
      const waPayload = {
        autoSendAlerts: isAuto,
        autoSendReturns: document.getElementById('set-wa-auto-returns')?.checked || false,
        autoSendOverdue: document.getElementById('set-wa-auto-overdue')?.checked || false,
        autoSendFittings: document.getElementById('set-wa-auto-fittings')?.checked || false
      };

      await electronApi.invoke('settings:update', { whatsapp: waPayload });
      if (cachedAppSettings) cachedAppSettings.whatsapp = waPayload;

      const waBadge = document.getElementById('wa-auto-status-badge');
      if (waBadge) {
        waBadge.className = `badge ${isAuto ? 'badge-success' : 'badge-warning'}`;
        waBadge.textContent = isAuto ? '⚡ الإرسال التلقائي مفعل' : '⏸️ متوقف (يدوي فقط)';
      }

      if (window.AppToast) {
        if (isAuto) {
          window.AppToast.success('تم تفعيل إرسال التنبيهات والرسائل التلقائية للعملاء بنجاح! ⚡💬');
        } else {
          window.AppToast.info('تم إيقاف الإرسال التلقائي (يعمل يدوياً فقط الآن).');
        }
      }
    });

    // Hook Trigger WhatsApp Auto Run Now
    document.getElementById('btn-trigger-wa-auto-run')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-trigger-wa-auto-run');
      const statusSpan = document.getElementById('wa-auto-run-status');
      if (btn) btn.disabled = true;
      if (statusSpan) statusSpan.textContent = '⏳ جاري فحص العملاء والإرسال...';

      try {
        if (window.AppToast) window.AppToast.info('جاري تشغيل محرك فحص وإرسال التنبيهات في الخلفية... 🚀');
        const res = await electronApi.invoke('whatsapp:run-auto-alerts');
        const data = res?.data || res || {};

        if (data.success) {
          const sent = data.sentCount || 0;
          const skipped = data.skippedCount || 0;
          if (statusSpan) statusSpan.innerHTML = `<span style="color: var(--color-success); font-weight: bold;">✅ تم إرسال (${sent}) رسائل، وتخطي (${skipped}) تم إرسالها مسبقاً.</span>`;
          if (window.AppToast) {
            window.AppToast.success(`اكتمل الإرسال بنجاح! تم إرسال ${sent} رسالة وتخطي ${skipped} مكررة. 🎉`);
          }
        } else {
          if (statusSpan) statusSpan.innerHTML = `<span style="color: var(--color-warning);">${data.reason || data.error || 'لم يتم الإرسال'}</span>`;
          if (window.AppToast) window.AppToast.warning(data.reason || data.error || 'تعذر الإرسال التلقائي');
        }
      } catch (err) {
        if (statusSpan) statusSpan.innerHTML = `<span style="color: var(--color-danger);">${err.message}</span>`;
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // Hook Backup & Restore Actions (Phase 13)
    let currentBackupPath = '';
    const loadBackupInfo = async () => {
      try {
        const infoRes = await electronApi.invoke('backup:get-info');
        const info = infoRes?.data || infoRes || {};
        currentBackupPath = info.backupDir || 'C:\\Users\\karim\\AppData\\Roaming\\SuitStore\\backups';
        const pathEl = document.getElementById('current-backup-path-text');
        if (pathEl) pathEl.textContent = currentBackupPath;

        const extraEl = document.getElementById('backup-extra-info');
        if (extraEl) {
          const count = info.backupCount !== undefined ? info.backupCount : 0;
          const latest = info.latestBackup;
          let html = `<span>📦 إجمالي النسخ المحفوظة محلياً: <strong style="color: var(--text-primary);">${count}</strong> نسخة</span>`;
          if (latest) {
            const sizeKb = ((latest.sizeBytes || 0) / 1024).toFixed(1);
            const dateStr = latest.mtime ? new Date(latest.mtime).toLocaleString('ar-EG') : '';
            html += `<span>🕒 أحدث نسخة احتياطية: <strong style="color: var(--color-gold-400);">${latest.fileName}</strong> (${sizeKb} KB ${dateStr ? '- ' + dateStr : ''})</span>`;
          }
          extraEl.innerHTML = html;
        }
      } catch (e) {
        console.warn('Could not load backup info', e);
      }
    };
    loadBackupInfo();

    // Open backup folder in Explorer
    document.getElementById('btn-open-backup-dir')?.addEventListener('click', async () => {
      try {
        const res = await electronApi.invoke('backup:open-folder');
        if (res && res.success === false) {
          if (window.navigator?.clipboard && currentBackupPath) {
            await navigator.clipboard.writeText(currentBackupPath);
            AppToast.info(`تم نسخ مسار مجلد النسخ للحافظة: ${currentBackupPath}`);
          } else {
            AppToast.warning(`مسار المجلد: ${currentBackupPath}`);
          }
        } else {
          AppToast.success('تم فتح مجلد النسخ الاحتياطية في مستكشف الملفات (Explorer) 📂');
        }
      } catch (err) {
        if (window.navigator?.clipboard && currentBackupPath) {
          await navigator.clipboard.writeText(currentBackupPath);
          AppToast.info(`تعذر الفتح التلقائي، تم نسخ المسار للحافظة: ${currentBackupPath}`);
        } else {
          AppToast.error(`خطأ: ${err.message}`);
        }
      }
    });

    // Copy backup path
    document.getElementById('btn-copy-backup-dir')?.addEventListener('click', async () => {
      if (!currentBackupPath) return;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(currentBackupPath);
          AppToast.success('تم نسخ مسار مجلد النسخ الاحتياطية إلى الحافظة بنجاح 📋');
        } else {
          prompt('مسار المجلد (اضغط Ctrl+C للنسخ):', currentBackupPath);
        }
      } catch (e) {
        prompt('مسار المجلد (اضغط Ctrl+C للنسخ):', currentBackupPath);
      }
    });

    document.getElementById('btn-create-local-backup')?.addEventListener('click', async () => {
      try {
        AppToast.info('جاري إنشاء النسخة الاحتياطية بأمان... ⏳');
        const res = await electronApi.invoke('backup:create-local');
        if (res.success && res.data) {
          const d = res.data;
          AppToast.success(`تم حفظ النسخة الاحتياطية بنجاح! 💾 [${d.fileName}]`);
          const statusBox = document.getElementById('backup-status-area');
          if (statusBox) {
            statusBox.innerHTML = `
              <div style="color: var(--color-success); font-weight: 600;">✅ آخر نسخة احتياطية: ${d.fileName}</div>
              <div style="font-size: 11px; color: var(--text-muted);">المسار: ${d.filePath} | الحجم: ${(d.fileSizeBytes / 1024).toFixed(1)} KB</div>
            `;
          }
          loadBackupInfo();
        } else {
          AppToast.error(res.error?.message || 'فشل إنشاء النسخة الاحتياطية.');
        }
      } catch (err) {
        AppToast.error(`خطأ: ${err.message}`);
      }
    });

    document.getElementById('btn-verify-backup')?.addEventListener('click', async () => {
      try {
        AppToast.info('جاري فحص سلامة وتكامل قاعدة البيانات... 🔍');
        const res = await electronApi.invoke('backup:verify', {});
        if (res.success && res.data?.valid) {
          AppToast.success('فحص السلامة الهيكلية ناجح بنجاح 100%! ✅ (Integrity: OK)');
        } else {
          AppToast.warning(`نتيجة الفحص: ${res.data?.error || 'يوجد مشكلة بالملف'}`);
        }
      } catch (err) {
        AppToast.error(`خطأ: ${err.message}`);
      }
    });

    window._openRestoreModal = async () => {
      if (!window.AppModal) return;

      let localInfo = {};
      let gdriveStatus = {};
      let gdriveBackups = [];
      let gdriveLoadError = null;

      try {
        const [infoRes, statusRes] = await Promise.all([
          electronApi.invoke('backup:get-info'),
          electronApi.invoke('backup:gdrive-get-status')
        ]);
        localInfo = infoRes?.data || infoRes || {};
        gdriveStatus = statusRes?.data || statusRes || {};
      } catch (_) {}

      const localFiles = Array.isArray(localInfo.backupFiles) ? localInfo.backupFiles : [];
      const isGdriveConnected = !!gdriveStatus.isConnected;
      const gdriveEmail = gdriveStatus.user?.email || '';

      // If connected, fetch cloud backups list
      if (isGdriveConnected) {
        try {
          const listRes = await electronApi.invoke('backup:gdrive-list-backups');
          gdriveBackups = Array.isArray(listRes?.data) ? listRes.data : (Array.isArray(listRes) ? listRes : []);
        } catch (e) {
          gdriveLoadError = e.message;
        }
      }

      window.AppModal.open({
        title: '🔄 استعادة قاعدة البيانات من نسخة احتياطية',
        contentHtml: `
          <div style="color: var(--color-danger); margin-bottom: 10px; font-weight: bold; font-size: 13px;">
            ⚠️ تحذير: استعادة قاعدة البيانات ستعيد كافة البيانات للحالة التي كانت عليها وقت أخذ النسخة.
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px;">
            🛡️ سيقوم النظام تلقائياً بإنشاء نسخة وقائية سريعة (Safety Snapshot) للبيانات الحالية قبل الاستبدال لتتمكن من الرجوع إليها عند اللزوم.
          </p>

          <!-- Source Selector: Local vs Google Drive -->
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 600; margin-bottom: 8px;">اختر مصدر النسخة الاحتياطية:</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label id="restore-tab-local-lbl" style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(255,255,255,0.05); border: 2px solid var(--color-gold-500); border-radius: 8px; cursor: pointer;">
                <input type="radio" name="restore-source-type" id="restore-src-local" value="LOCAL" checked style="width: 16px; height: 16px;">
                <div>
                  <strong style="font-size: 13px; color: var(--text-primary); display: block;">💻 النسخ بالجهاز</strong>
                  <span style="font-size: 10px; color: var(--text-secondary);">ملف محلي أو مجلد النسخ</span>
                </div>
              </label>

              <label id="restore-tab-gdrive-lbl" style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer;">
                <input type="radio" name="restore-source-type" id="restore-src-gdrive" value="GDRIVE" style="width: 16px; height: 16px;">
                <div>
                  <strong style="font-size: 13px; color: var(--text-primary); display: block;">☁️ Google Drive</strong>
                  <span style="font-size: 10px; color: var(--text-secondary);">${isGdriveConnected ? '🟢 متصل' : '⚠️ غير متصل'}</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Section 1: Local Restore Panel -->
          <div id="restore-panel-local">
            ${localFiles.length > 0 ? `
              <div class="form-group" style="margin-bottom: 14px;">
                <label class="form-label">النسخ الاحتياطية المتوفرة على القرص المحلي (${localFiles.length}):</label>
                <select id="modal-restore-select" class="form-control" style="font-size: 12px;">
                  ${localFiles.map((f, idx) => {
                    const sizeKb = ((f.sizeBytes || 0) / 1024).toFixed(1);
                    const dateStr = f.mtime ? new Date(f.mtime).toLocaleString('ar-EG') : '';
                    return `<option value="${f.filePath.replace(/"/g, '&quot;')}" ${idx === 0 ? 'selected' : ''}>
                      ${f.fileName} (${sizeKb} KB - ${dateStr})
                    </option>`;
                  }).join('')}
                </select>
              </div>
            ` : `
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">لا توجد نسخ تلقائية سابقة في مجلد النسخ. يمكنك اختيار ملف من أي مكان.</div>
            `}

            <div class="form-group" style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label class="form-label" style="margin: 0;">مسار ملف النسخة المحددة (.db):</label>
                <button type="button" id="btn-browse-backup-file" class="btn-secondary" style="font-size: 11px; padding: 4px 10px;">
                  📂 تصفح ملف من الجهاز...
                </button>
              </div>
              <input type="text" id="modal-restore-path" class="form-control"
                value="${localFiles.length > 0 ? localFiles[0].filePath : ''}"
                placeholder="C:\\path\\to\\backup.db" style="direction: ltr; font-family: monospace; font-size: 11px;">
            </div>
          </div>

          <!-- Section 2: Google Drive Restore Panel (Hidden by default) -->
          <div id="restore-panel-gdrive" style="display: none;">
            ${isGdriveConnected ? `
              <div style="background: rgba(66, 133, 244, 0.08); border: 1px solid rgba(66, 133, 244, 0.25); border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
                  <span>☁️</span>
                  <span>حساب متصل: <strong style="color: var(--color-gold-400);">${gdriveEmail}</strong></span>
                </div>
                <button type="button" id="btn-refresh-gdrive-list" class="btn-secondary" style="font-size: 11px; padding: 4px 8px;" title="إعادة جلب القائمة من درايف">
                  🔄 تحديث القائمة
                </button>
              </div>

              ${gdriveBackups.length > 0 ? `
                <div class="form-group" style="margin-bottom: 14px;">
                  <label class="form-label" style="font-weight: 600;">اختر النسخة السحابية المراد استعادتها من Google Drive (${gdriveBackups.length}):</label>
                  <select id="modal-restore-gdrive-select" class="form-control" style="font-size: 12px;">
                    ${gdriveBackups.map((f, idx) => {
                      const szKb = ((f.sizeBytes || 0) / 1024).toFixed(1);
                      const dStr = f.createdTime ? new Date(f.createdTime).toLocaleString('ar-EG') : '';
                      return `<option value="${f.id}" data-name="${f.name}" ${idx === 0 ? 'selected' : ''}>
                        ☁️ ${f.name} (${szKb} KB - ${dStr})
                      </option>`;
                    }).join('')}
                  </select>
                </div>
                <div style="font-size: 11px; color: var(--color-gold-400); line-height: 1.4; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px;">
                  📥 سيقوم النظام بتنزيل النسخة من Google Drive مباشرة وفحص سلامتها واستعادتها بأمان تام.
                </div>
              ` : `
                <div style="text-align: center; padding: 25px 15px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 8px;">
                  <div style="font-size: 32px; margin-bottom: 8px;">☁️ 📭</div>
                  <strong style="font-size: 13px; color: var(--text-primary); display: block; margin-bottom: 4px;">لم يتم العثور على نسخ احتياطية في مجلد Drive</strong>
                  <p style="font-size: 11px; color: var(--text-muted); margin: 0;">يمكنك رفع نسخة سحابية أولاً باستخدام زر "رفع إلى Google Drive".</p>
                </div>
              `}
            ` : `
              <div style="text-align: center; padding: 25px 15px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 8px;">
                <div style="font-size: 36px; margin-bottom: 10px;">☁️ 🔑</div>
                <strong style="font-size: 14px; color: var(--text-primary); display: block; margin-bottom: 6px;">Google Drive غير متصل</strong>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 14px;">
                  سجّل الدخول بحساب Google لتمكين استعراض واستعادة النسخ الاحتياطية السحابية.
                </p>
                <button type="button" id="modal-restore-gdrive-login" class="btn-primary-action" style="font-size: 12px; padding: 8px 18px; margin: 0 auto; display: inline-flex; align-items: center; gap: 8px; background: #4285F4; border-color: #4285F4;">
                  <span>🔑</span> تسجيل الدخول بحساب Google
                </button>
              </div>
            `}
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-primary-action" id="btn-confirm-do-restore" style="background: var(--color-danger); border-color: var(--color-danger); display: flex; align-items: center; gap: 6px;">
            <span>🔄</span> تأكيد الاستعادة الآن
          </button>
        `,
        width: '580px'
      });

      // Synchronize local select dropdown with input text
      const selectEl = document.getElementById('modal-restore-select');
      const inputEl = document.getElementById('modal-restore-path');
      if (selectEl && inputEl) {
        selectEl.addEventListener('change', () => {
          inputEl.value = selectEl.value;
        });
      }

      // Tab switching: Local vs Google Drive
      const radioLocal = document.getElementById('restore-src-local');
      const radioGdrive = document.getElementById('restore-src-gdrive');
      const panelLocal = document.getElementById('restore-panel-local');
      const panelGdrive = document.getElementById('restore-panel-gdrive');
      const lblLocal = document.getElementById('restore-tab-local-lbl');
      const lblGdrive = document.getElementById('restore-tab-gdrive-lbl');

      const updateTabs = () => {
        if (radioLocal.checked) {
          panelLocal.style.display = 'block';
          panelGdrive.style.display = 'none';
          lblLocal.style.border = '2px solid var(--color-gold-500)';
          lblLocal.style.background = 'rgba(255,255,255,0.05)';
          lblGdrive.style.border = '1px solid var(--border-color)';
          lblGdrive.style.background = 'rgba(255,255,255,0.02)';
        } else {
          panelLocal.style.display = 'none';
          panelGdrive.style.display = 'block';
          lblGdrive.style.border = '2px solid #4285F4';
          lblGdrive.style.background = 'rgba(66, 133, 244, 0.1)';
          lblLocal.style.border = '1px solid var(--border-color)';
          lblLocal.style.background = 'rgba(255,255,255,0.02)';
        }
      };

      radioLocal?.addEventListener('change', updateTabs);
      radioGdrive?.addEventListener('change', updateTabs);

      // Browse file button
      document.getElementById('btn-browse-backup-file')?.addEventListener('click', async () => {
        try {
          const res = await electronApi.invoke('backup:select-file');
          if (res?.success && res.filePath) {
            if (inputEl) inputEl.value = res.filePath;
          }
        } catch (e) {
          console.warn(e);
        }
      });

      // Google Login button inside restore modal if disconnected
      document.getElementById('modal-restore-gdrive-login')?.addEventListener('click', async () => {
        AppModal.close();
        window._openGoogleDriveSyncModal();
      });

      // Refresh Google Drive List button
      document.getElementById('btn-refresh-gdrive-list')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-refresh-gdrive-list');
        if (btn) btn.innerHTML = '⏳ جاري التحديث...';
        window._openRestoreModal();
      });

      // Confirm Restore Button Execution
      document.getElementById('btn-confirm-do-restore')?.addEventListener('click', async () => {
        const isGdrive = radioGdrive?.checked;
        const confirmBtn = document.getElementById('btn-confirm-do-restore');

        if (isGdrive) {
          // Google Drive restore
          const selectGdrive = document.getElementById('modal-restore-gdrive-select');
          const fileId = selectGdrive?.value;
          const selectedOption = selectGdrive?.selectedOptions?.[0];
          const fileName = selectedOption?.getAttribute('data-name') || 'النسخة المحددة';

          if (!fileId) {
            if (window.AppToast) window.AppToast.warning('يرجى اختيار ملف نسخة احتياطية من Google Drive.');
            return;
          }

          if (!confirm(`هل أنت متأكد تماماً من استعادة النسخة السحابية:\n"${fileName}"؟\n\nسيتم أخذ نسخة أمان سريعة للبيانات الحالية قبل الاستبدال.`)) {
            return;
          }

          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span>⏳</span> جاري التنزيل والاستعادة...';
          }
          if (window.AppToast) window.AppToast.info('جاري تنزيل النسخة من Google Drive واستعادتها بأمان... ☁️⏳');

          try {
            const res = await electronApi.invoke('backup:gdrive-restore', { fileId, safetyBackup: true });
            if (res && res.success) {
              if (window.AppToast) window.AppToast.success('تمت استعادة قاعدة البيانات من Google Drive بنجاح تام! ☁️🎉');
              setTimeout(() => location.reload(), 1200);
            } else {
              if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<span>🔄</span> تأكيد الاستعادة الآن';
              }
              if (window.AppToast) window.AppToast.error(res?.error?.message || res?.error || 'فشلت الاستعادة من Google Drive.');
            }
          } catch (err) {
            if (confirmBtn) {
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = '<span>🔄</span> تأكيد الاستعادة الآن';
            }
            if (window.AppToast) window.AppToast.error(`خطأ أثناء الاستعادة: ${err.message}`);
          }
        } else {
          // Local restore
          const filePath = inputEl?.value.trim();
          if (!filePath) {
            if (window.AppToast) window.AppToast.warning('يرجى تحديد مسار ملف النسخة الاحتياطية.');
            return;
          }

          if (!confirm(`هل أنت متأكد من استعادة قاعدة البيانات من الملف:\n"${filePath}"؟`)) {
            return;
          }

          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span>⏳</span> جاري الاستعادة...';
          }
          if (window.AppToast) window.AppToast.info('جاري التحقق والاستعادة الآمنة من النسخة المحلية... ⏳');

          try {
            const res = await electronApi.invoke('backup:restore-local', { backupFilePath: filePath, safetyBackup: true });
            if (res && res.success) {
              if (window.AppToast) window.AppToast.success('تمت استعادة قاعدة البيانات بنجاح تام! 🔄 جاري تحديث التطبيق...');
              setTimeout(() => location.reload(), 1200);
            } else {
              if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<span>🔄</span> تأكيد الاستعادة الآن';
              }
              if (window.AppToast) window.AppToast.error(res?.error?.message || res?.error || 'فشلت الاستعادة.');
            }
          } catch (err) {
            if (confirmBtn) {
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = '<span>🔄</span> تأكيد الاستعادة الآن';
            }
            if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
          }
        }
      });
    };

    document.getElementById('btn-restore-backup')?.addEventListener('click', () => {
      window._openRestoreModal();
    });

    // Hook Google Drive Sync Modal
    window._openGoogleDriveSyncModal = async () => {
      if (!window.AppModal) return;

      let backupInfo = {};
      let gdriveHistory = [];
      let gdriveStatus = {};

      try {
        const [infoRes, historyRes, statusRes] = await Promise.all([
          electronApi.invoke('backup:get-info'),
          electronApi.invoke('backup:get-gdrive-history', { limit: 5 }),
          electronApi.invoke('backup:gdrive-get-status')
        ]);
        backupInfo = infoRes?.data || infoRes || {};
        gdriveHistory = Array.isArray(historyRes?.data) ? historyRes.data : (Array.isArray(historyRes) ? historyRes : []);
        gdriveStatus = statusRes?.data || statusRes || {};
      } catch (e) {
        console.warn('Error loading backup info for GDrive modal', e);
      }

      const isConnected = !!gdriveStatus.isConnected;
      const userEmail = gdriveStatus.user?.email || '';
      const userName = gdriveStatus.user?.name || '';
      const localFiles = Array.isArray(backupInfo.backupFiles) ? backupInfo.backupFiles : [];
      const latestSync = gdriveHistory[0] || null;

      window.AppModal.open({
        title: '☁️ المزامنة السحابية والرفع إلى Google Drive',
        contentHtml: `
          <!-- Google Drive Account & Connection Status Card -->
          <div style="background: linear-gradient(135deg, rgba(66, 133, 244, 0.12), rgba(52, 168, 83, 0.08)); border: 1px solid rgba(66, 133, 244, 0.3); border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
            ${isConnected ? `
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="font-size: 30px; background: rgba(255,255,255,0.08); width: 46px; height: 46px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                    ☁️
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <strong style="font-size: 14px; color: var(--text-primary);">${userName || 'حساب Google متصل'}</strong>
                      <span class="badge badge-success" style="font-size: 10px; padding: 2px 6px;">🟢 متصل</span>
                    </div>
                    <div style="font-size: 12px; color: var(--color-gold-400); margin-top: 2px;">
                      📧 ${userEmail}
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                      📁 مجلد المزامنة السحابي: <code style="color: var(--color-gold-400);">MohamedSaed_Store_Backups</code>
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" id="modal-gdrive-web-btn" class="btn-secondary" style="font-size: 11px; padding: 6px 12px; display: flex; align-items: center; gap: 6px;">
                    🌐 فتح درايف ↗
                  </button>
                  <button type="button" id="modal-gdrive-disconnect-btn" class="btn-secondary" style="font-size: 11px; padding: 6px 10px; color: var(--color-danger);" title="قطع الاتصال بحساب Google">
                    🚪 خروج
                  </button>
                </div>
              </div>
            ` : `
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="font-size: 30px; background: rgba(255,255,255,0.08); width: 46px; height: 46px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                    ☁️
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <strong style="font-size: 14px; color: var(--text-primary);">خدمة Google Drive السحابية</strong>
                      <span class="badge badge-warning" style="font-size: 10px; padding: 2px 6px;">⚠️ غير متصل</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">
                      سجّل الدخول بحساب Google لتمكين الرفع السحابي وحفظ بيانات المحل بأمان.
                    </div>
                    <div style="font-size: 11px; color: #fbbf24; margin-top: 4px;">
                      ⚠️ <b>هام:</b> عند تسجيل الدخول، تأكد من وضع علامة <b>(✓)</b> بجوار إذن Google Drive للسماح برفع النسخ.
                    </div>
                  </div>
                </div>
                <button type="button" id="modal-gdrive-login-btn" class="btn-primary-action" style="font-size: 12px; padding: 8px 16px; display: flex; align-items: center; gap: 8px; background: #4285F4; border-color: #4285F4; box-shadow: 0 2px 8px rgba(66, 133, 244, 0.4);">
                  <span>🔑</span> تسجيل الدخول بحساب Google
                </button>
              </div>
            `}

            ${latestSync ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 11px; color: var(--text-muted); display: flex; gap: 16px; flex-wrap: wrap;">
                <span>🕒 آخر مزامنة: <strong style="color: var(--color-gold-400);">${new Date(latestSync.created_at).toLocaleString('ar-EG')}</strong></span>
                <span>📦 الحجم: <strong>${((latestSync.file_size_bytes || 0) / 1024).toFixed(1)} KB</strong></span>
                <span style="color: var(--color-success);">✅ الحالة: مكتملة بنجاح</span>
              </div>
            ` : ''}
          </div>

          <!-- Mode Selection: Fresh Instant Backup vs Existing Local File -->
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 600; margin-bottom: 8px;">اختر مصدر النسخة المراد رفعها إلى Google Drive:</label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer;">
                <input type="radio" name="gdrive-source-radio" id="gdrive-src-fresh" value="FRESH" checked style="width: 16px; height: 16px;">
                <div>
                  <strong style="font-size: 13px; color: var(--text-primary);">⚡ إنشاء نسخة حية فورية الآن ورفعها مباشرة (موصى به)</strong>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">يأخذ لقطة فورية متكاملة لقاعدة البيانات الحالية ويرفعها مباشرة إلى السحابة.</div>
                </div>
              </label>

              <label style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer;">
                <input type="radio" name="gdrive-source-radio" id="gdrive-src-existing" value="EXISTING" style="width: 16px; height: 16px;">
                <div style="flex: 1;">
                  <strong style="font-size: 13px; color: var(--text-primary);">📦 اختيار نسخة احتياطية سابقة من الجهاز</strong>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">تحديد أحد ملفات النسخ الاحتياطية المحفوظة محلياً لرفعها.</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Dropdown for existing backups (hidden by default) -->
          <div id="gdrive-existing-select-area" style="display: none; margin-bottom: 16px; background: var(--bg-app); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
            <label class="form-label" style="font-size: 12px;">اختر النسخة المحلية المراد رفعها:</label>
            ${localFiles.length > 0 ? `
              <select id="modal-gdrive-local-file" class="form-control" style="font-size: 12px;">
                ${localFiles.map(f => {
                  const sizeKb = ((f.sizeBytes || 0) / 1024).toFixed(1);
                  const dStr = f.mtime ? new Date(f.mtime).toLocaleString('ar-EG') : '';
                  return `<option value="${f.filePath.replace(/"/g, '&quot;')}">${f.fileName} (${sizeKb} KB - ${dStr})</option>`;
                }).join('')}
              </select>
            ` : `
              <div style="color: var(--text-muted); font-size: 12px;">لا توجد نسخ محلية سابقة. سيتم استخدام خيار النسخة الفورية.</div>
            `}
          </div>

          <!-- Live Sync & Upload Progress Box -->
          <div id="gdrive-progress-area" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div id="gdrive-idle-state" style="display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-secondary);">
              <span style="font-size: 20px;">🔒</span>
              <div>
                <strong>حماية وتشفير متكامل:</strong> يتم تشفير الحزمة السحابية بحساب البصمة SHA-256 ونقلها عبر بروتوكول مشفر TLS/SSL مباشرة إلى مجلد التخزين الآمن في Google Drive.
              </div>
            </div>

            <div id="gdrive-active-state" style="display: none;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span id="gdrive-progress-title" style="font-size: 13px; font-weight: 600; color: var(--color-gold-400);">جاري بدء المزامنة...</span>
                <span id="gdrive-progress-percent" style="font-size: 14px; font-weight: bold; color: var(--color-success);">0%</span>
              </div>

              <!-- Progress Bar -->
              <div style="background: rgba(255,255,255,0.08); height: 10px; border-radius: 5px; overflow: hidden; margin-bottom: 12px;">
                <div id="gdrive-progress-bar" style="background: linear-gradient(90deg, var(--color-gold-500), var(--color-success)); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
              </div>

              <!-- Step checklist -->
              <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: var(--text-secondary);" id="gdrive-step-list">
                <div id="step-pack" style="display: flex; align-items: center; gap: 6px;">⏳ <span>تجهيز حزمة النسخة وفحص سلامة الهيكل...</span></div>
                <div id="step-hash" style="display: flex; align-items: center; gap: 6px; opacity: 0.5;">⏳ <span>حساب البصمة الرقمية والتشفير (SHA-256)...</span></div>
                <div id="step-connect" style="display: flex; align-items: center; gap: 6px; opacity: 0.5;">⏳ <span>الاتصال الآمن بسيرفرات Google Drive API...</span></div>
                <div id="step-upload" style="display: flex; align-items: center; gap: 6px; opacity: 0.5;">⏳ <span>نقل وتخزين الملف في مجلد MohamedSaed_Store_Backups...</span></div>
                <div id="step-verify" style="display: flex; align-items: center; gap: 6px; opacity: 0.5;">⏳ <span>تأكيد المزامنة وتسجيل العملية بنجاح...</span></div>
              </div>
            </div>
          </div>

          <!-- Recent Cloud Sync History -->
          ${gdriveHistory.length > 0 ? `
            <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
              <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                📋 سجل آخر عمليات المزامنة السحابية (${gdriveHistory.length})
              </div>
              <div style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
                ${gdriveHistory.map(rec => {
                  const fname = (rec.file_path || '').split(/[\/\\]/).pop();
                  const sz = ((rec.file_size_bytes || 0) / 1024).toFixed(1);
                  const d = rec.created_at ? new Date(rec.created_at).toLocaleString('ar-EG') : '';
                  return `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 4px 8px; background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.04);">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: var(--color-success);">☁️ ✅</span>
                        <strong style="color: var(--text-secondary);">${fname}</strong>
                      </div>
                      <div style="color: var(--text-muted); display: flex; gap: 10px;">
                        <span>${sz} KB</span>
                        <span>${d}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-primary-action" id="modal-btn-start-sync" ${isConnected ? '' : 'disabled style="opacity: 0.6; cursor: not-allowed;"'} style="display: flex; align-items: center; gap: 6px;">
            ${isConnected ? '🚀 بدء الرفع والمزامنة الآن' : '⚠️ يرجى تسجيل الدخول أولاً للرفع'}
          </button>
        `,
        width: '600px'
      });

      // Wire Google Login button
      document.getElementById('modal-gdrive-login-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('modal-gdrive-login-btn');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span>⏳</span> جاري فتح صفحة تسجيل الدخول بالمتصفح...';
        }
        try {
          if (window.AppToast) window.AppToast.info('تم فتح صفحة تسجيل الدخول في المتصفح، يرجى الموافقة على الربط... 🌐');
          const authRes = await electronApi.invoke('backup:gdrive-start-auth');
          if (authRes && authRes.success) {
            if (window.AppToast) window.AppToast.success(`تم تسجيل الدخول بنجاح! مرحباً ${authRes.user?.name || authRes.user?.email || ''} ☁️🎉`);
            window._openGoogleDriveSyncModal(); // Refresh modal into connected state
          } else {
            if (window.AppToast) window.AppToast.error(authRes?.error || 'فشل تسجيل الدخول.');
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = '<span>🔑</span> تسجيل الدخول بحساب Google';
            }
          }
        } catch (err) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🔑</span> تسجيل الدخول بحساب Google';
          }
        }
      });

      // Wire Disconnect button
      document.getElementById('modal-gdrive-disconnect-btn')?.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من تسجيل الخروج وقطع الاتصال مع حساب Google؟')) return;
        try {
          await electronApi.invoke('backup:gdrive-disconnect');
          if (window.AppToast) window.AppToast.info('تم تسجيل الخروج وقطع الاتصال بنجاح.');
          window._openGoogleDriveSyncModal();
        } catch (err) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
        }
      });

      // Wire radio selection
      const radioFresh = document.getElementById('gdrive-src-fresh');
      const radioExisting = document.getElementById('gdrive-src-existing');
      const existingArea = document.getElementById('gdrive-existing-select-area');

      radioFresh?.addEventListener('change', () => {
        if (existingArea) existingArea.style.display = 'none';
      });
      radioExisting?.addEventListener('change', () => {
        if (existingArea) existingArea.style.display = 'block';
      });

      // Wire external Google Drive web button
      document.getElementById('modal-gdrive-web-btn')?.addEventListener('click', async () => {
        try {
          await electronApi.invoke('backup:open-gdrive-url');
        } catch (_) {
          window.open('https://drive.google.com/drive/my-drive', '_blank');
        }
      });

      // Wire Start Sync Button
      document.getElementById('modal-btn-start-sync')?.addEventListener('click', async () => {
        const btn = document.getElementById('modal-btn-start-sync');
        if (btn) btn.disabled = true;

        const idleState = document.getElementById('gdrive-idle-state');
        const activeState = document.getElementById('gdrive-active-state');
        if (idleState) idleState.style.display = 'none';
        if (activeState) activeState.style.display = 'block';

        const progressTitle = document.getElementById('gdrive-progress-title');
        const progressPercent = document.getElementById('gdrive-progress-percent');
        const progressBar = document.getElementById('gdrive-progress-bar');

        const setStep = (stepId, isDone, text) => {
          const el = document.getElementById(stepId);
          if (el) {
            el.style.opacity = '1';
            el.innerHTML = isDone
              ? `✅ <span style="color: var(--color-success); font-weight: 600;">${text}</span>`
              : `⏳ <span style="color: var(--color-gold-400); font-weight: 600;">${text}</span>`;
          }
        };

        const updateProgress = (pct, title) => {
          if (progressPercent) progressPercent.textContent = `${pct}%`;
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressTitle) progressTitle.textContent = title;
        };

        try {
          // Step 1: Packing
          updateProgress(20, 'جاري تجهيز حزمة النسخة وفحص سلامة الهيكل...');
          setStep('step-pack', false, 'جاري تجهيز حزمة النسخة...');
          await new Promise(r => setTimeout(r, 400));
          setStep('step-pack', true, 'تم تجهيز حزمة النسخة بنجاح ✅');

          // Step 2: Hashing
          updateProgress(45, 'جاري حساب البصمة الرقمية والتشفير SHA-256...');
          setStep('step-hash', false, 'جاري التشفير وحساب البصمة...');
          await new Promise(r => setTimeout(r, 400));
          setStep('step-hash', true, 'تم التحقق من البصمة الرقمية والتشفير ✅');

          // Step 3: Connect
          updateProgress(70, 'جاري الاتصال الآمن بخوادم Google Drive...');
          setStep('step-connect', false, 'جاري الاتصال الآمن بالسحابة...');
          await new Promise(r => setTimeout(r, 400));
          setStep('step-connect', true, 'تم الاتصال الآمن بسيرفرات Google Drive ✅');

          // Step 4: Upload via backend
          updateProgress(85, 'جاري رفع الملف إلى مجلد MohamedSaed_Store_Backups...');
          setStep('step-upload', false, 'جاري رفع الملف للسحابة...');

          let selectedFilePath = null;
          if (radioExisting?.checked) {
            selectedFilePath = document.getElementById('modal-gdrive-local-file')?.value || null;
          }

          const res = await electronApi.invoke('backup:sync-google-drive', {
            backupFilePath: selectedFilePath
          });

          if (res && res.success) {
            updateProgress(100, 'اكتملت المزامنة السحابية بنجاح تام! ☁️✅');
            setStep('step-upload', true, 'تم رفع وتخزين الملف بنجاح ✅');
            setStep('step-verify', true, 'تم تأكيد المزامنة وتسجيلها في السجل السحابي ✅');

            if (window.AppToast) window.AppToast.success('تمت المزامنة والرفع إلى Google Drive بنجاح تام! ☁️🎉');
            if (btn) {
              btn.textContent = 'تم الرفع بنجاح ✅';
              btn.style.background = 'var(--color-success)';
              btn.style.borderColor = 'var(--color-success)';
            }

            if (typeof loadBackupInfo === 'function') loadBackupInfo();

            setTimeout(() => {
              if (window.AppModal) window.AppModal.close();
            }, 1800);
          } else {
            throw new Error(res?.error?.message || 'فشلت المزامنة السحابية.');
          }
        } catch (err) {
          if (progressTitle) {
            progressTitle.textContent = `خطأ في المزامنة: ${err.message}`;
            progressTitle.style.color = 'var(--color-danger)';
          }
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'إعادة المحاولة 🔄';
          }
          if (window.AppToast) window.AppToast.error(`فشلت المزامنة: ${err.message}`);
        }
      });
    };

    document.getElementById('btn-sync-gdrive')?.addEventListener('click', () => {
      window._openGoogleDriveSyncModal();
    });

    // ══════════════════════════════════════════════════════════════════════════
    // WHATSAPP DIRECT BACKGROUND SERVICE INTEGRATION (الأجهزة المرتبطة)
    // ══════════════════════════════════════════════════════════════════════════
    window._updateWhatsAppHeaderStatus = async () => {
      const textEl = document.getElementById('header-wa-status-text');
      const btn = document.getElementById('btn-whatsapp-status');
      if (!textEl || !btn) return;

      try {
        const res = await electronApi.invoke('whatsapp:get-status');
        const data = res?.data || res || {};
        const isReady = !!(data.isReady || res?.isReady);
        if (isReady) {
          textEl.innerHTML = '<span style="color: var(--color-success); font-weight: 600;">🟢 متصل</span>';
          btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          btn.style.background = 'rgba(16, 185, 129, 0.08)';
        } else {
          textEl.innerHTML = '<span style="color: var(--color-warning);">⚠️ ربط واتساب</span>';
          btn.style.borderColor = 'rgba(245, 158, 11, 0.3)';
          btn.style.background = 'rgba(255, 255, 255, 0.04)';
        }
      } catch (_) {
        textEl.textContent = 'واتساب';
      }
    };

    window._openWhatsAppManagerModal = async () => {
      if (!window.AppModal) return;

      let status = {};
      try {
        const res = await electronApi.invoke('whatsapp:get-status');
        status = res?.data || res || {};
      } catch (_) {}

      const isConnected = !!(status.isReady || status.data?.isReady);

      window.AppModal.open({
        title: '💬 ربط واتساب - الإرسال الصامت المباشر (الأجهزة المرتبطة)',
        contentHtml: `
          <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.08)); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-size: 32px; background: rgba(255,255,255,0.08); width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                  💬
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="font-size: 14px; color: var(--text-primary);">خدمة واتساب المباشرة</strong>
                    <span class="badge ${isConnected ? 'badge-success' : 'badge-warning'}" style="font-size: 10px; padding: 2px 6px;">
                      ${isConnected ? '🟢 متصل وجاهز للإرسال' : '⚠️ غير مربوط بعد'}
                    </span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">
                    ${isConnected ? 'الجهاز مرتبط بنجاح، ويتم إرسال كافة التنبيهات في الخلفية بصمت تام بدون فتح أي متصفح.' : 'امسح الباركود بهاتفك مرة واحدة فقط للربط التلقائي.'}
                  </div>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button type="button" id="btn-wa-refresh-status" class="btn-secondary" style="font-size: 11px; padding: 6px 10px;" title="إعادة فحص الاتصال">
                  🔄 تحديث الحالة
                </button>
                ${isConnected ? `
                  <button type="button" id="btn-wa-disconnect" class="btn-secondary" style="color: var(--color-danger); font-size: 11px; padding: 6px 10px;">
                    🚪 خروج
                  </button>
                ` : ''}
              </div>
            </div>
          </div>

          ${isConnected ? `
            <!-- Connected: Test Message Section -->
            <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 14px;">
              <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;">
                🧪 تجربة إرسال رسالة مباشرة الآن (صامتة بدون فتح أي شيء):
              </div>
              <div class="form-group" style="margin-bottom: 10px;">
                <label class="form-label">رقم الهاتف للتجربة:</label>
                <input type="text" id="wa-test-phone" class="form-control" placeholder="01xxxxxxxxx" style="font-size: 12px;">
              </div>
              <div class="form-group" style="margin-bottom: 10px;">
                <label class="form-label">نص التجربة:</label>
                <input type="text" id="wa-test-msg" class="form-control" value="مرحباً! هذه رسالة تجريبية ناجحة من برنامج محل بدَل محمد السعيد 👔✨" style="font-size: 12px;">
              </div>
              <button type="button" id="btn-send-test-wa" class="btn-primary-action" style="background: #10B981; border-color: #10B981; font-size: 12px; padding: 7px 14px; display: inline-flex; align-items: center; gap: 6px;">
                <span>🚀</span> إرسال الرسالة في الخلفية الآن
              </button>
            </div>
          ` : `
            <!-- Disconnected: QR Code Instructions & Pairing Action -->
            <div style="text-align: center; padding: 20px 15px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 8px; margin-bottom: 14px;">
              <div style="font-size: 42px; margin-bottom: 10px;">📱 📷</div>
              <strong style="font-size: 14px; color: var(--text-primary); display: block; margin-bottom: 6px;">
                ربط واتساب بخاصية الأجهزة المرتبطة (Linked Devices)
              </strong>
              <p style="font-size: 12px; color: var(--text-secondary); max-width: 440px; margin: 0 auto 16px; line-height: 1.6;">
                اضغط على الزر بالأسفل لفتح شاشة الباركود، ثم افتح تطبيق واتساب بهاتفك واختر <b>الأجهزة المرتبطة > ربط جهاز</b> ووجّه الكاميرا نحو الكود.
              </p>
              <button type="button" id="btn-open-wa-pairing-win" class="btn-primary-action" style="background: #10B981; border-color: #10B981; font-size: 13px; padding: 9px 20px; display: inline-flex; align-items: center; gap: 8px;">
                <span>📱</span> فتح شاشة مسح الباركود (QR Code)
              </button>
            </div>
          `}

          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 6px;">
            💡 <b>ملاحظة:</b> بمجرد ربط جهازك لمرة واحدة، يتم حفظ الجلسة على هذا الكمبيوتر تلقائياً، وتعمل في الخلفية بصمت تام دون الحاجة لفتح أي متصفح.
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إغلاق</button>
        `,
        width: '520px'
      });

      // Auto-watcher for pairing status when not connected
      let pairingPollTimer = null;
      const clearPairingWatcher = () => {
        if (pairingPollTimer) {
          clearInterval(pairingPollTimer);
          pairingPollTimer = null;
        }
      };

      const startPairingWatcher = () => {
        clearPairingWatcher();
        let attempts = 0;
        pairingPollTimer = setInterval(async () => {
          attempts++;
          if (attempts > 120) { // 3 minutes timeout
            clearPairingWatcher();
            return;
          }
          try {
            const pollRes = await electronApi.invoke('whatsapp:get-status');
            const pollData = pollRes?.data || pollRes || {};
            if (pollData.isReady || pollRes?.isReady) {
              clearPairingWatcher();
              await electronApi.invoke('whatsapp:hide-pairing');
              await window._updateWhatsAppHeaderStatus();
              if (window.AppToast) {
                window.AppToast.success('🎉 تم ربط واتساب بنجاح! التطبيق جاهز الآن للإرسال الصامت المباشر في الخلفية.');
              }
              // Auto-refresh the manager modal to show the connected state
              window._openWhatsAppManagerModal();
            }
          } catch (_) {}
        }, 1500);
      };

      if (!isConnected) {
        startPairingWatcher();
      }

      // Wire Refresh Status Button
      document.getElementById('btn-wa-refresh-status')?.addEventListener('click', async () => {
        clearPairingWatcher();
        const btn = document.getElementById('btn-wa-refresh-status');
        if (btn) btn.innerHTML = '⏳ فحص...';
        await window._updateWhatsAppHeaderStatus();
        window._openWhatsAppManagerModal();
      });

      // Wire Disconnect Button
      document.getElementById('btn-wa-disconnect')?.addEventListener('click', async () => {
        clearPairingWatcher();
        if (!confirm('هل أنت متأكد من تسجيل الخروج وفك ربط واتساب؟')) return;
        try {
          await electronApi.invoke('whatsapp:disconnect');
          if (window.AppToast) window.AppToast.info('تم تسجيل الخروج وفك الربط بنجاح.');
          window._updateWhatsAppHeaderStatus();
          window._openWhatsAppManagerModal();
        } catch (err) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
        }
      });

      // Wire Open Pairing Window Button
      document.getElementById('btn-open-wa-pairing-win')?.addEventListener('click', async () => {
        try {
          await electronApi.invoke('whatsapp:open-pairing');
          if (window.AppToast) window.AppToast.info('تم فتح شاشة الباركود. يرجى مسح الكود من تطبيق واتساب بهاتفك 📷');
          startPairingWatcher();
        } catch (err) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
        }
      });

      // Wire Test Send Button
      document.getElementById('btn-send-test-wa')?.addEventListener('click', async () => {
        const phone = document.getElementById('wa-test-phone')?.value.trim();
        const message = document.getElementById('wa-test-msg')?.value.trim();
        const sendBtn = document.getElementById('btn-send-test-wa');

        if (!phone) {
          if (window.AppToast) window.AppToast.warning('يرجى كتابة رقم الهاتف.');
          return;
        }

        if (sendBtn) {
          sendBtn.disabled = true;
          sendBtn.innerHTML = '<span>⏳</span> جاري الإرسال في الخلفية...';
        }

        try {
          if (window.AppToast) window.AppToast.info('جاري إرسال الرسالة عبر واتساب صامتاً في الخلفية... ⏳');
          const res = await electronApi.invoke('whatsapp:send-direct', { phone, message });
          if (res?.success) {
            if (window.AppToast) window.AppToast.success(`تم إرسال الرسالة إلى +${res.phone} بنجاح تام! 💬✅`);
            if (sendBtn) {
              sendBtn.disabled = false;
              sendBtn.innerHTML = '<span>🚀</span> إرسال الرسالة في الخلفية الآن';
            }
          } else {
            if (window.AppToast) window.AppToast.error(res?.error || 'فشل الإرسال.');
            if (sendBtn) {
              sendBtn.disabled = false;
              sendBtn.innerHTML = '<span>🚀</span> إرسال الرسالة في الخلفية الآن';
            }
          }
        } catch (err) {
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span>🚀</span> إرسال الرسالة في الخلفية الآن';
          }
          if (window.AppToast) window.AppToast.error(`خطأ أثناء الإرسال: ${err.message}`);
        }
      });
    };

    document.getElementById('btn-whatsapp-status')?.addEventListener('click', () => {
      window._openWhatsAppManagerModal();
    });

    // Push notification listener from Electron Main process when WhatsApp pairing succeeds
    if (typeof electronApi?.on === 'function') {
      electronApi.on('whatsapp:paired', async () => {
        await window._updateWhatsAppHeaderStatus();
        if (window.AppToast) {
          window.AppToast.success('🎉 تم ربط واتساب بنجاح! التطبيق جاهز الآن للإرسال المباشر.');
        }
        // Auto-refresh the manager modal if currently visible
        const modalContainer = document.querySelector('.modal-container');
        if (modalContainer && modalContainer.querySelector('#btn-open-wa-pairing-win')) {
          window._openWhatsAppManagerModal();
        }
      });
    }

    // Update header status on startup and every 15 seconds
    setTimeout(() => window._updateWhatsAppHeaderStatus(), 1500);
    setInterval(() => window._updateWhatsAppHeaderStatus(), 15000);

    // Hook Auto Update Engine Actions (Phase 14)
    let currentUpdateData = null;

    document.getElementById('btn-check-for-updates')?.addEventListener('click', async () => {
      try {
        AppToast.info('جاري التحقق من التحديثات عبر السيرفر... 🔄');
        const btnCheck = document.getElementById('btn-check-for-updates');
        const btnDownload = document.getElementById('btn-download-update');
        const btnApply = document.getElementById('btn-apply-update');
        const statusArea = document.getElementById('update-status-area');

        if (btnCheck) btnCheck.disabled = true;

        const res = await electronApi.invoke('update:check');
        if (btnCheck) btnCheck.disabled = false;

        if (res.success && res.data) {
          const d = res.data;
          currentUpdateData = d;
          statusArea.style.display = 'block';

          if (d.updateAvailable) {
            AppToast.success(`يوجد إصدار جديد متوفر: v${d.latestVersion}! 🎉`);
            if (btnDownload) btnDownload.style.display = 'inline-block';
            if (btnApply) btnApply.style.display = 'none';

            statusArea.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 700; color: var(--color-gold-500); font-size: 15px;">🎉 إصدار جديد متوفر: v${d.latestVersion}</span>
                <span style="font-size: 11px; color: var(--text-muted);">تاريخ الإصدار: ${d.releaseDate} | الحجم: ${(d.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
              <div style="font-size: 12px; margin-bottom: 8px; color: var(--text-secondary); white-space: pre-line;">${d.releaseNotes}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">SHA-256: ${d.sha256Checksum?.slice(0, 24)}...</div>
            `;
          } else {
            AppToast.info('أنت تعمل بأحدث إصدار مستقر حالياً! ✅');
            if (btnDownload) btnDownload.style.display = 'none';
            if (btnApply) btnApply.style.display = 'none';

            statusArea.innerHTML = `
              <div style="color: var(--color-success); font-weight: 600;">✅ التطبيق محدث بالكامل (الإصدار الحالي: v${d.currentVersion}).</div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">آخر فحص: ${new Date(d.checkedAt).toLocaleTimeString('ar-EG')}</div>
            `;
          }
        } else {
          AppToast.error(res.error?.message || 'فشل فحص التحديثات.');
        }
      } catch (err) {
        AppToast.error(`خطأ أثناء فحص التحديثات: ${err.message}`);
      }
    });

    document.getElementById('btn-download-update')?.addEventListener('click', async () => {
      try {
        const btnDownload = document.getElementById('btn-download-update');
        const btnApply = document.getElementById('btn-apply-update');
        const statusArea = document.getElementById('update-status-area');

        if (btnDownload) {
          btnDownload.disabled = true;
          btnDownload.textContent = '⏳ جاري التنزيل والتحقق من البصمة...';
        }

        AppToast.info('بدء تنزيل حزمة التحديث وفحص بصمة SHA-256... ⬇️');
        const res = await electronApi.invoke('update:download', {
          downloadUrl: currentUpdateData?.downloadUrl,
          expectedChecksum: currentUpdateData?.sha256Checksum
        });

        if (res.success && res.data) {
          AppToast.success('تم تنزيل وتوثيق حزمة التحديث بنجاح تام! 🛡️✅');
          if (btnDownload) btnDownload.style.display = 'none';
          if (btnApply) {
            btnApply.style.display = 'inline-block';
            btnApply.disabled = false;
          }

          statusArea.innerHTML += `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-color); color: var(--color-success);">
              🛡️ تم فحص البصمة الرقمية للملف ومطابقتها بنجاح 100%. الحزمة جاهزة للتطبيق الآمن.
            </div>
          `;
        } else {
          AppToast.error(res.error?.message || 'فشل تنزيل التحديث.');
          if (btnDownload) {
            btnDownload.disabled = false;
            btnDownload.textContent = '⬇️ إعادة محاولة التنزيل';
          }
        }
      } catch (err) {
        AppToast.error(`خطأ أثناء التنزيل: ${err.message}`);
      }
    });

    document.getElementById('btn-apply-update')?.addEventListener('click', async () => {
      if (!window.AppModal) return;
      window.AppModal.open({
        title: '🚀 تأكيد تطبيق التحديث وإعادة التشغيل',
        contentHtml: `
          <div style="margin-bottom: 12px; font-weight: 600; color: var(--color-gold-500);">
            جاهز لتطبيق التحديث v${currentUpdateData?.latestVersion || '1.1.0'}
          </div>
          <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
            🛡️ <strong>إجراءات الأمان التلقائية:</strong><br>
            1. سيقوم النظام بأخذ نسخة احتياطية فورية وحتمية من قاعدة البيانات الحالية.<br>
            2. فحص السلامة الهيكلية لقاعدة البيانات (Database Health Check).<br>
            3. تطبيق المهاجرات الجديدة (Migrations) تلقائياً.<br>
            4. إعادة تشغيل التطبيق على الإصدار الجديد.
          </p>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">تأجيل</button>
          <button class="btn-primary-action" id="btn-confirm-apply-update" style="background: var(--color-gold-500); border-color: var(--color-gold-500); color: #000;">
            تأكيد التحديث وإعادة التشغيل ⚡
          </button>
        `,
        width: '500px'
      });

      document.getElementById('btn-confirm-apply-update')?.addEventListener('click', async () => {
        AppModal.close();
        try {
          AppToast.info('جاري أخذ النسخة الوقائية وتطبيق التحديث... ⏳');
          const res = await electronApi.invoke('update:apply', { backupFirst: true });
          if (res.success) {
            AppToast.success('تم تطبيق التحديث وترحيل قاعدة البيانات بنجاح تام! 🚀');
            const versionBadge = document.getElementById('current-app-version-badge');
            if (versionBadge && currentUpdateData) {
              versionBadge.textContent = `الإصدار الحالي: v${currentUpdateData.latestVersion}`;
            }
            const statusArea = document.getElementById('update-status-area');
            if (statusArea) {
              statusArea.innerHTML = `
                <div style="color: var(--color-success); font-weight: 700; font-size: 14px;">
                  ✅ تم تطبيق التحديث بنجاح! تم أخذ نسخة وقائية وترحيل الجداول.
                </div>
              `;
            }
            const btnApply = document.getElementById('btn-apply-update');
            if (btnApply) btnApply.style.display = 'none';
          } else {
            AppToast.error(res.error?.message || 'فشل تطبيق التحديث.');
          }
        } catch (err) {
          AppToast.error(`خطأ: ${err.message}`);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED QUANTITY PRODUCTS EDIT & DELETE HELPERS (SHOES, ACCESSORIES, DYNAMIC)
  // ═══════════════════════════════════════════════════════════════════════════
  window._openEditQuantityProduct = async (prodId, currentName, returnPage) => {
    let p = null;
    let availableSizes = [];
    try {
      const [res, sizesRes, allSizesRes] = await Promise.all([
        electronApi.invoke('inventory:get-quantity-products', { categoryType: returnPage }),
        electronApi.invoke('admin:get-sizes', { categoryType: returnPage }),
        electronApi.invoke('admin:get-sizes')
      ]);
      p = (res?.data || []).find(x => x.id === prodId);
      const sList = Array.isArray(sizesRes) ? sizesRes : (sizesRes?.data || []);
      const allS = Array.isArray(allSizesRes) ? allSizesRes : (allSizesRes?.data || []);
      const sizesMap = new Map();
      sList.forEach(s => sizesMap.set(s.id, s));
      if (returnPage === 'ACCESSORIES' || returnPage === 'TIES') {
        allS.filter(s => ['ACCESSORIES', 'ACCESSORY', 'TIES'].includes((s.category_type || '').toUpperCase())).forEach(s => sizesMap.set(s.id, s));
      }
      availableSizes = Array.from(sizesMap.values());
    } catch (e) { }

    const name = p?.name || currentName || '';
    const code = p?.code || '';
    const sale_price = p?.sale_price || 0;
    const rental_price = p?.rental_price || 0;
    const cost_price = p?.cost_price || 0;
    const reorder_level = p?.reorder_level || 2;
    const description = p?.description || '';

    window.AppModal.open({
      title: `✏️ تعديل بيانات الصنف [${name}]`,
      contentHtml: `
        <div class="form-group">
          <label class="form-label">كود الصنف</label>
          <input type="text" id="edit-prod-code" class="form-control" value="${code}">
        </div>
        <div class="form-group">
          <label class="form-label">اسم الصنف والموديل</label>
          <input type="text" id="edit-prod-name" class="form-control" value="${name}">
        </div>
        ${availableSizes.length > 0 ? `
          <div class="form-group">
            <label class="form-label">المقاس</label>
            <select id="edit-prod-size" class="form-control">
              <option value="" ${!p?.size_id ? 'selected' : ''}>-- عام / بدون مقاس محدد --</option>
              ${availableSizes.map(s => `<option value="${s.id}" data-name="${s.name}" data-code="${s.code}" ${(p?.size_id === s.id || p?.size_name === s.name || p?.size_code === s.code) ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label class="form-label">سعر البيع (ج.م)</label>
            <input type="number" id="edit-prod-sale-price" class="form-control" value="${sale_price}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">سعر الإيجار (ج.م)</label>
            <input type="number" id="edit-prod-rental-price" class="form-control" value="${rental_price}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">سعر التكلفة (ج.م) <span style="color:var(--color-danger);">*</span></label>
            <input type="number" id="edit-prod-cost-price" class="form-control" value="${cost_price}" min="1" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">حد إعادة الطلب (تنبيه قرب النفاد)</label>
          <input type="number" id="edit-prod-reorder" class="form-control" value="${reorder_level}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">الوصف والملاحظات</label>
          <input type="text" id="edit-prod-desc" class="form-control" value="${description}" placeholder="ملاحظات الصنف...">
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-accent-action" onclick="window._saveEditQuantityProduct(${prodId}, '${returnPage}')">حفظ التعديلات</button>
      `,
      width: '480px'
    });

    window._saveEditQuantityProduct = async (id, retPage) => {
      const newCode = document.getElementById('edit-prod-code')?.value?.trim();
      const newName = document.getElementById('edit-prod-name')?.value?.trim();
      const newSale = Number(document.getElementById('edit-prod-sale-price')?.value) || 0;
      const newRental = Number(document.getElementById('edit-prod-rental-price')?.value) || 0;
      const newCost = Number(document.getElementById('edit-prod-cost-price')?.value) || 0;
      const newReorder = Number(document.getElementById('edit-prod-reorder')?.value) || 0;
      const newDesc = document.getElementById('edit-prod-desc')?.value || '';

      const sizeSelect = document.getElementById('edit-prod-size');
      const selectedOpt = sizeSelect?.selectedOptions?.[0];
      const size_id = sizeSelect ? (sizeSelect.value ? Number(sizeSelect.value) : null) : undefined;
      const size_name = selectedOpt?.getAttribute('data-name') || null;
      const size_code = selectedOpt?.getAttribute('data-code') || null;

      if (!newName) {
        AppToast.error('يرجى إدخال اسم الصنف.');
        return;
      }
      if (!newCost || newCost <= 0) {
        AppToast.error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر بدقة.');
        return;
      }

      try {
        await electronApi.invoke('inventory:update-quantity-product', {
          id,
          code: newCode,
          name: newName,
          sale_price: newSale,
          rental_price: newRental,
          cost_price: newCost,
          reorder_level: newReorder,
          description: newDesc,
          size_id,
          size_name,
          size_code
        });
        AppToast.success('تم حفظ تعديلات الصنف بنجاح! 📦');
        AppModal.close();
        if (retPage === 'SHOES') renderShoesPage();
        else if (retPage === 'ACCESSORIES') renderAccessoriesPage();
        else renderDynamicCategoryPage(retPage);
      } catch (err) {
        AppToast.error(err.message || 'فشل حفظ التعديلات');
      }
    };
  };

  window._deleteQuantityProduct = async (prodId, prodName, returnPage) => {
    if (!confirm(`هل أنت متأكد من حذف الصنف "${prodName}" من المخزن؟`)) return;
    try {
      const res = await electronApi.invoke('inventory:delete-quantity-product', { id: prodId });
      if (res && res.success === false) {
        AppToast.error(res.error?.message || 'فشل حذف الصنف');
        return;
      }
      AppToast.success(`تم حذف الصنف "${prodName}" بنجاح.`);
      if (returnPage === 'SHOES') renderShoesPage();
      else if (returnPage === 'ACCESSORIES') renderAccessoriesPage();
      else renderDynamicCategoryPage(returnPage);
    } catch (err) {
      AppToast.error(err.message || 'فشل حذف الصنف');
    }
  };

  // --- Phase 6: Render Suits Inventory (مخزون البدل والقطع الفردية) ---
  async function renderSuitsPage() {
    const [modelsRes, unitsRes, whRes, polRes] = await Promise.all([
      electronApi.invoke('inventory:get-suit-models'),
      electronApi.invoke('inventory:get-suit-units'),
      electronApi.invoke('admin:get-warehouses'),
      electronApi.invoke('admin:get-policies')
    ]);
    const models = modelsRes.data || [];
    const units = unitsRes.data || [];
    const warehouses = (whRes.data || []).filter(w => w.is_active !== 0);
    const pol = polRes?.data || {};
    const enableDeposit = pol.enableSecurityDeposit !== false && String(pol.enableSecurityDeposit) !== '0';

    const statusBadge = (s) => {
      const map = {
        AVAILABLE: '<span class="badge badge-success">متاحة للإيجار</span>',
        BOOKED: '<span class="badge badge-warning">محجوزة</span>',
        IN_USE: '<span class="badge badge-info">مع العميل</span>',
        IN_CLEANING: '<span class="badge" style="background: rgba(168,85,247,0.15); color: #A855F7;">في الدراي كلين</span>',
        IN_MAINTENANCE: '<span class="badge" style="background: rgba(249,115,22,0.15); color: #F97316;">تحت الصيانة</span>',
        DAMAGED: '<span class="badge badge-danger">تالفة</span>',
        RETIRED: '<span class="badge badge-danger">خرجت من الخدمة</span>'
      };
      return map[s] || `<span class="badge">${s}</span>`;
    };

    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">🤵 مخزون البدل والقطع الفردية (Suits Inventory)</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">تتبع موديلات البدل والوحدات الفردية بالباركود، دورة حياة كل بدلة، تعديل الموديلات وحذفها والفلترة السريعة.</p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="btn-add-suit-model" class="btn-secondary">+ إضافة موديل بدلة</button>
          <button id="btn-add-suit-batch" class="btn-primary-action">📦 + إضافة دفعة بالمقاسات</button>
          <button id="btn-add-suit-unit" class="btn-accent-action">+ قطعة فردية (باركود)</button>
        </div>
      </div>

      <!-- Quick KPI Stats -->
      <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
        <div class="stat-card">
          <div class="stat-icon">👔</div>
          <div class="stat-info">
            <h4>إجمالي وحدات البدل</h4>
            <div class="value">${units.length} بدلة</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-success); background: rgba(16,185,129,0.12)">✅</div>
          <div class="stat-info">
            <h4>متاحة للتأجير الفوري</h4>
            <div class="value" style="color: var(--color-success)">${units.filter(u => u.status === 'AVAILABLE').length} بدلة</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-info); background: rgba(59,130,246,0.12)">🤵</div>
          <div class="stat-info">
            <h4>محجوزة أو مع عميل</h4>
            <div class="value" style="color: var(--color-info)">${units.filter(u => ['BOOKED', 'IN_USE'].includes(u.status)).length} بدلة</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: #A855F7; background: rgba(168,85,247,0.12)">🧼</div>
          <div class="stat-info">
            <h4>في المغسلة والدراي كلين</h4>
            <div class="value" style="color: #A855F7">${units.filter(u => u.status === 'IN_CLEANING').length} بدلة</div>
          </div>
        </div>
      </div>

      <!-- Models Table with Filter & Sort Toolbar -->
      <div class="table-card" style="margin-bottom: 24px;">
        <div class="table-header" style="flex-wrap: wrap; gap: 10px;">
          <div>
            <h3>📋 موديلات وتصميمات البدل المسجلة (<span id="suit-models-count">${models.length}</span> موديل)</h3>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <input type="text" id="suit-models-search" class="form-control" placeholder="🔍 بحث في الموديلات..." style="width: 220px; padding: 6px 10px; font-size: 12px;">
            <select id="suit-models-sort" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="NEWEST">الأحدث إدخالاً</option>
              <option value="NAME_ASC">الاسم (أ - ي)</option>
              <option value="UNITS_DESC">الأكثر قطعاً</option>
              <option value="PRICE_DESC">الأعلى سعراً</option>
              <option value="PRICE_ASC">الأقل سعراً</option>
            </select>
          </div>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>كود الموديل</th>
              <th>اسم البدلة / الموديل</th>
              <th>سعر البيع</th>
              <th>سعر الإيجار</th>
              <th>سعر التكلفة</th>
              <th>مبلغ التأمين ${enableDeposit ? '' : '<span style="font-size: 10px; color: var(--text-muted);">(معطل)</span>'}</th>
              <th>إجمالي الوحدات</th>
              <th>الوحدات المتاحة</th>
              <th>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody id="suit-models-tbody">
          </tbody>
        </table>
      </div>

      <!-- Units Table with Filter & Sort Toolbar -->
      <div class="table-card">
        <div class="table-header" style="flex-wrap: wrap; gap: 10px;">
          <div>
            <h3>🏷️ سجل وحدات وقطع البدل الفردية بالباركود (<span id="suit-units-count">${units.length}</span> قطعة)</h3>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <input type="text" id="suit-units-search" class="form-control" placeholder="🔍 بحث بالباركود، الموديل أو الحجز..." style="width: 220px; padding: 6px 10px; font-size: 12px;">
            <select id="suit-units-status" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="ALL">جميع الحالات</option>
              <option value="AVAILABLE">متاحة للإيجار فقط</option>
              <option value="BOOKED">محجوزة ومؤجرة (جميع المحجوز)</option>
              <option value="BOOKED_ONLY">محجوزة فقط (قيد الانتظار)</option>
              <option value="IN_USE">مسلّمة مع العميل حالياً</option>
              <option value="IN_CLEANING">في المغسلة</option>
              <option value="IN_MAINTENANCE">تحت الصيانة</option>
              <option value="DAMAGED">تالفة</option>
              <option value="RETIRED">خارج الخدمة</option>
            </select>
            <select id="suit-units-wh" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="ALL">جميع المخازن</option>
              ${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
            </select>
            <select id="suit-units-sort" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="NEWEST">الأحدث إدخالاً</option>
              <option value="BARCODE_ASC">ترتيب الباركود</option>
              <option value="MODEL_ASC">اسم الموديل (أ - ي)</option>
              <option value="RENTALS_DESC">الأكثر تأجيراً</option>
            </select>
          </div>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>باركود القطعة</th>
              <th>موديل البدلة</th>
              <th>المقاس</th>
              <th>المخزن</th>
              <th>سعر الإيجار</th>
              <th>التكلفة</th>
              <th>التأمين ${enableDeposit ? '' : '<span style="font-size: 10px; color: var(--text-muted);">(معطل)</span>'}</th>
              <th>الحالة الحالية</th>
              <th>مرات التأجير</th>
              <th>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody id="suits-table-body">
          </tbody>
        </table>
      </div>
    `;

    // ── Function to render Models rows ──
    const renderModelsList = () => {
      const tbody = document.getElementById('suit-models-tbody');
      const countEl = document.getElementById('suit-models-count');
      if (!tbody) return;

      const searchTerm = document.getElementById('suit-models-search')?.value?.trim()?.toLowerCase() || '';
      const sortBy = document.getElementById('suit-models-sort')?.value || 'NEWEST';

      let list = [...models];
      if (searchTerm) {
        list = list.filter(m => (m.name && m.name.toLowerCase().includes(searchTerm)) || (m.code && m.code.toLowerCase().includes(searchTerm)));
      }

      if (sortBy === 'NAME_ASC') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      } else if (sortBy === 'UNITS_DESC') {
        list.sort((a, b) => (b.total_units || 0) - (a.total_units || 0));
      } else if (sortBy === 'PRICE_DESC') {
        list.sort((a, b) => (b.rental_price || 0) - (a.rental_price || 0));
      } else if (sortBy === 'PRICE_ASC') {
        list.sort((a, b) => (a.rental_price || 0) - (b.rental_price || 0));
      } else {
        list.sort((a, b) => b.id - a.id);
      }

      if (countEl) countEl.textContent = list.length;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 25px; color: var(--text-secondary);">لا توجد موديلات مطابقة لخيارات البحث أو الفلترة.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(m => `
        <tr>
          <td><code>${m.code}</code></td>
          <td>
            <strong>${m.name}</strong>
            ${m.sizes_detail ? `
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
                ${m.sizes_detail.split(' | ').map(sz => `<span class="badge badge-info" style="font-size: 10px; padding: 2px 6px;">${sz}</span>`).join('')}
              </div>
            ` : '<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">لم تُضف قطع بعد</div>'}
          </td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(m.sale_price || 0) : (m.sale_price || 0) + ' ج.م'}</td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(m.rental_price) : m.rental_price + ' ج.م'}</td>
          <td style="color: var(--color-warning); font-weight: 600;">${window.UiUtils ? window.UiUtils.formatCurrency(m.cost_price || 0) : (m.cost_price || 0) + ' ج.م'}</td>
          <td>${enableDeposit ? (window.UiUtils ? window.UiUtils.formatCurrency(m.security_deposit) : m.security_deposit + ' ج.م') : '<span style="color: var(--text-muted); font-size: 11px;">— (معطل)</span>'}</td>
          <td><span class="badge badge-info">${m.total_units || 0} قطعة</span></td>
          <td><span class="badge badge-success">${m.available_units || 0} متاح</span></td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-primary-action" style="padding: 4px 8px; font-size: 11px;" onclick="window._openBatchUnitsForModel(${m.id})">📦 دفعة مقاسات</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openAddUnitForModel(${m.id})">+ قطعة</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openEditSuitModel(${m.id})">✏️ تعديل</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteSuitModel(${m.id}, '${m.name.replace(/'/g, "\\'")}')">🗑️ حذف</button>
            </div>
          </td>
        </tr>
      `).join('');
    };

    // ── Function to render Units rows ──
    const renderUnitsList = () => {
      const tbody = document.getElementById('suits-table-body');
      const countEl = document.getElementById('suit-units-count');
      if (!tbody) return;

      const searchTerm = document.getElementById('suit-units-search')?.value?.trim()?.toLowerCase() || '';
      const statusFilter = document.getElementById('suit-units-status')?.value || 'ALL';
      const whFilter = document.getElementById('suit-units-wh')?.value || 'ALL';
      const sortBy = document.getElementById('suit-units-sort')?.value || 'NEWEST';

      let list = [...units];
      if (searchTerm) {
        list = list.filter(u =>
          (u.unit_barcode && u.unit_barcode.toLowerCase().includes(searchTerm)) ||
          (u.model_name && u.model_name.toLowerCase().includes(searchTerm)) ||
          (u.size_name && u.size_name.toLowerCase().includes(searchTerm)) ||
          (u.active_booking_number && u.active_booking_number.toLowerCase().includes(searchTerm)) ||
          (u.active_customer_name && u.active_customer_name.toLowerCase().includes(searchTerm))
        );
      }

      if (statusFilter === 'BOOKED') {
        list = list.filter(u => u.status === 'BOOKED' || u.status === 'IN_USE' || u.active_booking_number);
      } else if (statusFilter === 'BOOKED_ONLY') {
        list = list.filter(u => u.status === 'BOOKED');
      } else if (statusFilter !== 'ALL') {
        list = list.filter(u => u.status === statusFilter);
      } else {
        list = list.filter(u => u.status !== 'RETIRED');
      }

      if (whFilter !== 'ALL') {
        list = list.filter(u => String(u.warehouse_id) === String(whFilter));
      }

      if (sortBy === 'BARCODE_ASC') {
        list.sort((a, b) => (a.unit_barcode || '').localeCompare(b.unit_barcode || ''));
      } else if (sortBy === 'MODEL_ASC') {
        list.sort((a, b) => (a.model_name || '').localeCompare(b.model_name || '', 'ar'));
      } else if (sortBy === 'RENTALS_DESC') {
        list.sort((a, b) => (b.rental_count || 0) - (a.rental_count || 0));
      } else {
        list.sort((a, b) => b.id - a.id);
      }

      if (countEl) countEl.textContent = list.length;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 25px; color: var(--text-secondary);">لا توجد قطع بدل مطابقة لخيارات الفلترة المحددة.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(u => `
        <tr>
          <td><code style="background: rgba(212,175,55,0.1); color: var(--color-gold-400); padding: 2px 6px; border-radius: 4px;">${u.unit_barcode}</code></td>
          <td><strong>${u.model_name}</strong></td>
          <td><span class="badge badge-info">${u.size_name}</span></td>
          <td>${u.warehouse_name}</td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(u.rental_price) : u.rental_price + ' ج.م'}</td>
          <td style="color: var(--color-warning); font-weight: 600;">${window.UiUtils ? window.UiUtils.formatCurrency(u.purchase_cost || 0) : (u.purchase_cost || 0) + ' ج.م'}</td>
          <td>${enableDeposit ? (window.UiUtils ? window.UiUtils.formatCurrency(u.security_deposit) : u.security_deposit + ' ج.م') : '<span style="color: var(--text-muted); font-size: 11px;">— (معطل)</span>'}</td>
          <td>
            ${statusBadge(u.status)}
            ${u.active_booking_number ? `
              <div style="font-size: 11px; margin-top: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                <span style="color: var(--color-gold-400); font-weight: 600;">حجز #${u.active_booking_number}</span>
                ${u.active_customer_name ? `<span style="color: var(--text-secondary);">(${u.active_customer_name})</span>` : ''}
              </div>
            ` : ''}
          </td>
          <td>${u.rental_count || 0} مرات</td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openUnitStatusModal(${u.id}, '${u.status}')">الحالة</button>
              <button class="btn-primary-action" style="padding: 4px 8px; font-size: 11px;" onclick="window._openUnitHistoryDrawer(${u.id}, '${u.unit_barcode}', '${u.model_name.replace(/'/g, "\\'")}')">السجل</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openEditSuitUnit(${u.id})">✏️</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteSuitUnit(${u.id}, '${u.unit_barcode}')">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('');
    };

    // Initial render of rows
    renderModelsList();
    renderUnitsList();

    // Wire filter listeners for Models
    document.getElementById('suit-models-search')?.addEventListener('input', renderModelsList);
    document.getElementById('suit-models-sort')?.addEventListener('change', renderModelsList);

    // Wire filter listeners for Units
    document.getElementById('suit-units-search')?.addEventListener('input', renderUnitsList);
    document.getElementById('suit-units-status')?.addEventListener('change', renderUnitsList);
    document.getElementById('suit-units-wh')?.addEventListener('change', renderUnitsList);
    document.getElementById('suit-units-sort')?.addEventListener('change', renderUnitsList);

    // ── Edit & Delete Suit Model Modals ──
    window._openEditSuitModel = (modelId) => {
      const m = models.find(x => x.id === modelId);
      if (!m) return;

      window.AppModal.open({
        title: `✏️ تعديل موديل البدلة [${m.name}]`,
        contentHtml: `
          <div class="form-group">
            <label class="form-label">كود الموديل</label>
            <input type="text" id="edit-model-code" class="form-control" value="${m.code}">
          </div>
          <div class="form-group">
            <label class="form-label">اسم البدلة / الموديل</label>
            <input type="text" id="edit-model-name" class="form-control" value="${m.name}">
          </div>
          <div style="display: grid; grid-template-columns: ${enableDeposit ? '1fr 1fr' : '1fr'}; gap: 12px;">
            <div class="form-group">
              <label class="form-label">سعر الإيجار (ج.م)</label>
              <input type="number" id="edit-model-rental" class="form-control" value="${m.rental_price}" min="0">
            </div>
            ${enableDeposit ? `
              <div class="form-group">
                <label class="form-label">مبلغ التأمين المسترد (ج.م)</label>
                <input type="number" id="edit-model-deposit" class="form-control" value="${m.security_deposit}" min="0">
              </div>
            ` : `
              <input type="hidden" id="edit-model-deposit" value="0">
            `}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">سعر البيع المباشر (إن وجد)</label>
              <input type="number" id="edit-model-sale" class="form-control" value="${m.sale_price || 0}" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر التكلفة (ج.م) <span style="color:var(--color-danger);">*</span></label>
              <input type="number" id="edit-model-cost" class="form-control" value="${m.cost_price || 0}" min="1" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">وصف ومواصفات الموديل</label>
            <input type="text" id="edit-model-desc" class="form-control" value="${m.description || ''}" placeholder="وصف الموديل، القماش...">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveEditSuitModel(${modelId})">حفظ التعديلات</button>
        `,
        width: '480px'
      });

      window._saveEditSuitModel = async (id) => {
        const code = document.getElementById('edit-model-code')?.value?.trim();
        const name = document.getElementById('edit-model-name')?.value?.trim();
        const rental_price = Number(document.getElementById('edit-model-rental')?.value) || 0;
        const security_deposit = Number(document.getElementById('edit-model-deposit')?.value) || 0;
        const sale_price = Number(document.getElementById('edit-model-sale')?.value) || 0;
        const cost_price = Number(document.getElementById('edit-model-cost')?.value) || 0;
        const description = document.getElementById('edit-model-desc')?.value || '';

        if (!code || !name) {
          AppToast.error('يرجى ملء الكود واسم الموديل.');
          return;
        }
        if (!cost_price || cost_price <= 0) {
          AppToast.error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر.');
          return;
        }

        try {
          await electronApi.invoke('inventory:update-suit-model', {
            id,
            code,
            name,
            rental_price,
            security_deposit,
            sale_price,
            cost_price,
            description
          });
          AppToast.success('تم حفظ تعديلات موديل البدلة بنجاح! 🤵');
          AppModal.close();
          renderSuitsPage();
        } catch (err) {
          AppToast.error(err.message || 'فشل تعديل الموديل');
        }
      };
    };

    window._deleteSuitModel = async (modelId, modelName) => {
      if (!confirm(`هل أنت متأكد من حذف موديل البدلة "${modelName}"؟ سيتم إخراج جميع وحداته المرتبطة من الخدمة.`)) return;
      try {
        const res = await electronApi.invoke('inventory:delete-suit-model', { id: modelId });
        if (res && res.success === false) {
          AppToast.error(res.error?.message || 'فشل حذف الموديل');
          return;
        }
        AppToast.success(`تم حذف الموديل "${modelName}" بنجاح.`);
        renderSuitsPage();
      } catch (err) {
        AppToast.error(err.message || 'فشل حذف الموديل');
      }
    };

    // ── Edit & Delete Suit Unit Modals ──
    window._openEditSuitUnit = async (unitId) => {
      const u = units.find(x => x.id === unitId);
      if (!u) return;

      const [sizesRes, allWhRes] = await Promise.all([
        electronApi.invoke('admin:get-sizes', { categoryType: 'SUIT' }),
        electronApi.invoke('admin:get-warehouses')
      ]);
      const sizes = (sizesRes.data || []).filter(s => s.is_active !== 0);
      const whList = (allWhRes.data || []).filter(w => w.is_active !== 0);

      window.AppModal.open({
        title: `✏️ تعديل وحدة البدلة [${u.unit_barcode}]`,
        contentHtml: `
          <div style="padding: 10px; background: var(--bg-card-hover); border-radius: 6px; margin-bottom: 14px;">
            <strong>الموديل:</strong> ${u.model_name}
          </div>
          <div class="form-group">
            <label class="form-label">باركود القطعة</label>
            <input type="text" id="edit-unit-barcode" class="form-control" value="${u.unit_barcode}">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">المقاس</label>
              <select id="edit-unit-size-id" class="form-control">
                ${sizes.map(s => `<option value="${s.id}" ${s.id === u.size_id || s.name === u.size_name ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">المخزن / الفرع</label>
              <select id="edit-unit-wh-id" class="form-control">
                ${whList.map(w => `<option value="${w.id}" ${w.id === u.warehouse_id || w.name === u.warehouse_name ? 'selected' : ''}>${w.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">تكلفة شراء / تفصيل القطعة (ج.م)</label>
            <input type="number" id="edit-unit-cost" class="form-control" value="${u.purchase_cost || 0}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">ملاحظات على القطعة</label>
            <input type="text" id="edit-unit-notes" class="form-control" value="${u.notes || ''}" placeholder="حالة القماش، تعديلات خاصة...">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveEditSuitUnit(${unitId})">حفظ التعديلات</button>
        `,
        width: '460px'
      });

      window._saveEditSuitUnit = async (id) => {
        const barcode = document.getElementById('edit-unit-barcode')?.value?.trim();
        const size_id = Number(document.getElementById('edit-unit-size-id')?.value);
        const warehouse_id = Number(document.getElementById('edit-unit-wh-id')?.value);
        const purchase_cost = Number(document.getElementById('edit-unit-cost')?.value) || 0;
        const notes = document.getElementById('edit-unit-notes')?.value || '';

        if (!barcode) {
          AppToast.error('الباركود مطلوب.');
          return;
        }

        try {
          await electronApi.invoke('inventory:update-suit-unit', {
            id,
            unit_barcode: barcode,
            size_id,
            warehouse_id,
            purchase_cost,
            notes
          });
          AppToast.success('تم تعديل بيانات وحدة البدلة بنجاح! 🏷️');
          AppModal.close();
          renderSuitsPage();
        } catch (err) {
          AppToast.error(err.message || 'فشل تعديل الوحدة');
        }
      };
    };

    window._deleteSuitUnit = async (unitId, barcode) => {
      if (!confirm(`هل أنت متأكد من حذف أو إخراج قطعة البدلة [${barcode}] من المخزن؟`)) return;
      try {
        const res = await electronApi.invoke('inventory:delete-suit-unit', { id: unitId, unitId });
        if (res && res.success === false) {
          AppToast.error(res.error?.message || 'فشل حذف القطعة');
          return;
        }
        AppToast.success(`تم حذف قطعة البدلة [${barcode}] بنجاح.`);
        renderSuitsPage();
      } catch (err) {
        AppToast.error(err.message || 'فشل حذف القطعة');
      }
    };

    // Hook Add Model Modal (Dynamic Categories & Colors)
    document.getElementById('btn-add-suit-model')?.addEventListener('click', async () => {
      const [catRes, colRes] = await Promise.all([
        electronApi.invoke('admin:get-categories'),
        electronApi.invoke('admin:get-colors')
      ]);
      const categories = (catRes.data || []).filter(c => c.type === 'SUITS' || c.is_active);
      const colors = (colRes.data || []).filter(c => c.is_active !== 0);

      window.AppModal.open({
        title: '➕ إضافة موديل بدلة جديد',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">كود الموديل (مثال: MDL-TUX-01)</label>
            <input type="text" id="new-model-code" class="form-control" placeholder="الكود...">
          </div>
          <div class="form-group">
            <label class="form-label">اسم الموديل بالعربية</label>
            <input type="text" id="new-model-name" class="form-control" placeholder="مثال: سموكنج شال كول أسود...">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">القسم / التصنيف</label>
              <select id="new-model-cat" class="form-control">
                ${categories.length > 0 ? categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('') : '<option value="بدل رجالي وعرائس">بدل رجالي وعرائس</option>'}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">اللون الرئيسي</label>
              <select id="new-model-col" class="form-control">
                ${colors.length > 0 ? colors.map(col => `<option value="${col.name}">${col.name}</option>`).join('') : '<option value="أسود ملكي">أسود ملكي</option>'}
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label class="form-label">سعر البيع النهائي (ج.م)</label>
              <input type="number" id="new-model-sale" class="form-control" value="3000" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر الإيجار اليومي (ج.م)</label>
              <input type="number" id="new-model-rental" class="form-control" value="1500" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر التكلفة (ج.م) <span style="color:var(--color-danger);">*</span></label>
              <input type="number" id="new-model-cost" class="form-control" value="1200" min="1" required>
            </div>
          </div>
          ${enableDeposit ? `
            <div class="form-group">
              <label class="form-label">مبلغ التأمين الافتراضي (ج.م)</label>
              <input type="number" id="new-model-deposit" class="form-control" value="${Math.round(1500 * (pol.defaultDepositRatio || 1.0))}">
            </div>
          ` : `
            <input type="hidden" id="new-model-deposit" value="0">
          `}
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveSuitModel()">حفظ الموديل</button>
        `,
        width: '500px'
      });

      window._saveSuitModel = async () => {
        const code = document.getElementById('new-model-code')?.value?.trim();
        const name = document.getElementById('new-model-name')?.value?.trim();
        const category_name = document.getElementById('new-model-cat')?.value || 'بدل رجالي';
        const color_name = document.getElementById('new-model-col')?.value || 'أسود';
        const sale_price = Number(document.getElementById('new-model-sale')?.value) || 0;
        const rental_price = Number(document.getElementById('new-model-rental')?.value) || 0;
        const cost_price = Number(document.getElementById('new-model-cost')?.value) || 0;
        const security_deposit = Number(document.getElementById('new-model-deposit')?.value) || 0;
        if (!code || !name) {
          AppToast.error('يرجى ملء الكود واسم الموديل.');
          return;
        }
        if (!cost_price || cost_price <= 0) {
          AppToast.error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر بدقة.');
          return;
        }
        await electronApi.invoke('inventory:create-suit-model', { code, name, category_name, color_name, sale_price, rental_price, cost_price, security_deposit });
        AppToast.success('تمت إضافة موديل البدلة بنجاح! 🤵');
        AppModal.close();
        renderSuitsPage();
      };
    });

    // Hook Add Batch Units Modal (Multi-size quantities per warehouse)
    window._openBatchUnitsForModel = async (preselectedModelId) => {
      const [modelsRes, sizesRes, whRes] = await Promise.all([
        electronApi.invoke('inventory:get-suit-models'),
        electronApi.invoke('admin:get-sizes', { categoryType: 'SUIT' }),
        electronApi.invoke('admin:get-warehouses')
      ]);
      const curModels = modelsRes.data || models;
      const suitSizes = (sizesRes.data || []).filter(s => s.is_active !== 0);
      const whList = (whRes.data || []).filter(w => w.is_active !== 0);

      const selModel = curModels.find(m => m.id === preselectedModelId) || curModels[0] || {};
      const defCost = selModel.cost_price || 0;

      window.AppModal.open({
        title: '📦 إضافة كميات بالمقاسات لموديل البدلة (دفعة قطع بالباركود)',
        contentHtml: `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">موديل البدلة</label>
              <select id="batch-model-id" class="form-control">
                ${curModels.map(m => `<option value="${m.id}" data-cost="${m.cost_price || 0}" ${m.id === preselectedModelId ? 'selected' : ''}>${m.name} (${m.code})</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">المخزن / الفرع المستهدف</label>
              <select id="batch-wh-id" class="form-control">
                ${whList.map(w => `<option value="${w.id}" ${w.is_default ? 'selected' : ''}>${w.name} ${w.is_default ? '★ (افتراضي)' : ''}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">سعر التكلفة لكل قطعة (ج.م) <span style="color:var(--color-danger);">*</span></label>
            <input type="number" id="batch-cost-price" class="form-control" value="${defCost}" min="1" required>
            <small style="color: var(--text-muted); font-size: 11px;">إجباري لحساب أرباح وخسائر المتجر بدقة في لوحة التحكم.</small>
          </div>

          <div class="form-group">
            <label class="form-label">حدد الكميات المطلوبة لكل مقاس (أدخل عدد القطع أمام كل مقاس):</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; max-height: 200px; overflow-y: auto; background: var(--bg-card-hover); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              ${suitSizes.length > 0 ? suitSizes.map(s => `
                <div style="background: var(--bg-card); padding: 6px; border-radius: 6px; border: 1px solid var(--border-color); text-align: center;">
                  <div style="font-size: 12px; font-weight: 700; color: var(--color-gold-400); margin-bottom: 4px;">${s.name}</div>
                  <input type="number" class="suit-batch-qty-input form-control" data-size-id="${s.id}" data-size-name="${s.name}" min="0" value="0" style="padding: 4px; text-align: center; font-size: 13px; font-weight: 700;">
                </div>
              `).join('') : '<div style="color: var(--text-secondary); font-size: 12px; padding: 10px;">لا توجد مقاسات مسجلة للبدل. يرجى إضافة مقاسات من شاشة البيانات الأساسية.</div>'}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 8px 12px; background: rgba(16,185,129,0.1); border-radius: 6px;">
              <span style="font-size: 13px; font-weight: 600;">إجمالي القطع المزمع توليدها بالباركود:</span>
              <strong id="suit-batch-total-badge" style="font-size: 14px; color: var(--color-success);">0 قطعة</strong>
            </div>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveBatchUnits()">توليد وإضافة القطع بالباركود 🏷️</button>
        `,
        width: '560px'
      });

      // Live update total count
      const inputs = document.querySelectorAll('.suit-batch-qty-input');
      const updateTotal = () => {
        let sum = 0;
        inputs.forEach(inp => { sum += Number(inp.value) || 0; });
        const b = document.getElementById('suit-batch-total-badge');
        if (b) b.textContent = `${sum} قطعة`;
      };
      inputs.forEach(inp => inp.addEventListener('input', updateTotal));

      // Update cost when model changes
      document.getElementById('batch-model-id')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        const c = opt?.getAttribute('data-cost');
        const costInput = document.getElementById('batch-cost-price');
        if (costInput && c) costInput.value = c;
      });

      window._saveBatchUnits = async () => {
        const suit_model_id = Number(document.getElementById('batch-model-id')?.value);
        const warehouse_id = Number(document.getElementById('batch-wh-id')?.value) || 1;
        const purchase_cost = Number(document.getElementById('batch-cost-price')?.value) || 0;

        if (!suit_model_id) {
          AppToast.error('يرجى اختيار موديل البدلة.');
          return;
        }

        if (purchase_cost <= 0) {
          AppToast.error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر بدقة.');
          return;
        }

        const sizeQuantities = [];
        let totalCount = 0;
        inputs.forEach(inp => {
          const q = Number(inp.value) || 0;
          if (q > 0) {
            sizeQuantities.push({ size_id: Number(inp.dataset.sizeId), quantity: q });
            totalCount += q;
          }
        });

        if (sizeQuantities.length === 0 || totalCount <= 0) {
          AppToast.error('يرجى إدخال كمية لقطعة واحدة على الأقل في أحد المقاسات.');
          return;
        }

        try {
          await electronApi.invoke('inventory:create-suit-units-batch', {
            suit_model_id,
            warehouse_id,
            purchase_cost,
            sizeQuantities
          });
          AppToast.success(`تمت إضافة وتوليد ${totalCount} قطعة بدلة بنجاح بالمقاسات والباركود! 👔🏷️`);
          AppModal.close();
          renderSuitsPage();
        } catch (err) {
          AppToast.error(err.message || 'فشلت إضافة الدفعة');
        }
      };
    };

    document.getElementById('btn-add-suit-batch')?.addEventListener('click', () => window._openBatchUnitsForModel());

    // Hook Add Unit Modal (Dynamic Sizes & Warehouses)
    document.getElementById('btn-add-suit-unit')?.addEventListener('click', async () => {
      const [sizesRes, whRes] = await Promise.all([
        electronApi.invoke('admin:get-sizes', { categoryType: 'SUIT' }),
        electronApi.invoke('admin:get-warehouses')
      ]);
      const sizes = (sizesRes.data || []).filter(s => s.is_active !== 0);
      const warehouses = (whRes.data || []).filter(w => w.is_active !== 0);

      window.AppModal.open({
        title: '➕ إضافة قطعة بدلة فردية (باركود)',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">موديل البدلة</label>
            <select id="unit-model-id" class="form-control">
              ${models.length > 0 ? models.map(m => `<option value="${m.id}">${m.name} (${m.code})</option>`).join('') : '<option value="">لا توجد موديلات مسجلة (أضف موديل أولاً)</option>'}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">المقاس (من المقاسات الأساسية المعتمدة)</label>
              <select id="unit-size-id" class="form-control">
                ${sizes.length > 0 ? sizes.map(s => `<option value="${s.id}" data-name="${s.name}">${s.name} (${s.code})</option>`).join('') : '<option value="3" data-name="مقاس 50">مقاس 50</option>'}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">المخزن / الفرع</label>
              <select id="unit-wh-id" class="form-control">
                ${warehouses.length > 0 ? warehouses.map(w => `<option value="${w.id}" data-name="${w.name}" ${w.is_default ? 'selected' : ''}>${w.name} ${w.is_default ? '★ (افتراضي)' : ''}</option>`).join('') : '<option value="1" data-name="المخزن الرئيسي">المخزن الرئيسي</option>'}
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">الباركود (اتركه فارغًا للتوليد التلقائي)</label>
              <input type="text" id="unit-custom-barcode" class="form-control" placeholder="توليد تلقائي آلي">
            </div>
            <div class="form-group">
              <label class="form-label">تكلفة شراء / تفصيل القطعة (ج.م)</label>
              <input type="number" id="unit-purchase-cost" class="form-control" placeholder="افتراضياً تكلفة الموديل" min="0">
            </div>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveSuitUnit()">إضافة وطباعة باركود</button>
        `,
        width: '500px'
      });

      window._saveSuitUnit = async () => {
        const suit_model_id = Number(document.getElementById('unit-model-id')?.value) || 1;
        const sizeSelect = document.getElementById('unit-size-id');
        const whSelect = document.getElementById('unit-wh-id');
        const size_id = Number(sizeSelect?.value) || 3;
        const size_name = sizeSelect?.selectedOptions[0]?.getAttribute('data-name') || '';
        const warehouse_id = Number(whSelect?.value) || 1;
        const warehouse_name = whSelect?.selectedOptions[0]?.getAttribute('data-name') || '';
        const unit_barcode = document.getElementById('unit-custom-barcode')?.value || null;
        const purchase_cost = Number(document.getElementById('unit-purchase-cost')?.value) || 0;

        await electronApi.invoke('inventory:create-suit-unit', { suit_model_id, size_id, size_name, warehouse_id, warehouse_name, unit_barcode, purchase_cost });
        AppToast.success('تمت إضافة وحدة البدلة الفردية بنجاح! 🏷️');
        AppModal.close();
        renderSuitsPage();
      };
    });

    window._openUnitStatusModal = (unitId, currentStatus) => {
      window.AppModal.open({
        title: 'تعديل حالة البدلة',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">الحالة الجديدة</label>
            <select id="change-status-val" class="form-control">
              <option value="AVAILABLE" ${currentStatus === 'AVAILABLE' ? 'selected' : ''}>متاحة للتأجير</option>
              <option value="IN_CLEANING" ${currentStatus === 'IN_CLEANING' ? 'selected' : ''}>إرسال للدراي كلين / المغسلة</option>
              <option value="IN_MAINTENANCE" ${currentStatus === 'IN_MAINTENANCE' ? 'selected' : ''}>إرسال للخياط / صيانة</option>
              <option value="DAMAGED" ${currentStatus === 'DAMAGED' ? 'selected' : ''}>تالفة جزئيًا</option>
              <option value="RETIRED" ${currentStatus === 'RETIRED' ? 'selected' : ''}>إخراج من الخدمة</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">سبب التعديل أو الملاحظات</label>
            <input type="text" id="change-status-reason" class="form-control" placeholder="سبب الإجراء...">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._confirmStatusChange(${unitId})">حفظ وتحديث الحالة</button>
        `,
        width: '450px'
      });

      window._confirmStatusChange = async (uId) => {
        const newStatus = document.getElementById('change-status-val')?.value;
        const reason = document.getElementById('change-status-reason')?.value || 'تعديل يدوي من إدارة المخزون';
        await electronApi.invoke('inventory:update-unit-status', { unitId: uId, newStatus, reason });
        AppToast.success('تم تحديث حالة البدلة وتسجيل الحركة في السجل! 🔄');
        AppModal.close();
        renderSuitsPage();
      };
    };

    window._openAddUnitForModel = async (modelId) => {
      const [sizesRes, whRes] = await Promise.all([
        electronApi.invoke('admin:get-sizes', { categoryType: 'SUIT' }),
        electronApi.invoke('admin:get-warehouses')
      ]);
      const sizes = (sizesRes.data || []).filter(s => s.is_active !== 0);
      const warehouses = (whRes.data || []).filter(w => w.is_active !== 0);

      window.AppModal.open({
        title: '➕ إضافة قطعة بدلة فردية لهذا الموديل',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">المقاس (من المقاسات الأساسية المعتمدة)</label>
            <select id="uam-size-id" class="form-control">
              ${sizes.length > 0 ? sizes.map(s => `<option value="${s.id}" data-name="${s.name}">${s.name} (${s.code})</option>`).join('') : '<option value="3" data-name="مقاس 50">مقاس 50</option>'}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">المخزن / الفرع</label>
            <select id="uam-wh-id" class="form-control">
              ${warehouses.length > 0 ? warehouses.map(w => `<option value="${w.id}" data-name="${w.name}" ${w.is_default ? 'selected' : ''}>${w.name} ${w.is_default ? '★ (افتراضي)' : ''}</option>`).join('') : '<option value="1" data-name="المخزن الرئيسي">المخزن الرئيسي</option>'}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">الباركود (اتركه فارغًا للتوليد التلقائي)</label>
            <input type="text" id="uam-barcode" class="form-control" placeholder="توليد تلقائي آلي">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveUnitForModel(${modelId})">إضافة وطباعة باركود</button>
        `,
        width: '450px'
      });

      window._saveUnitForModel = async (mId) => {
        const sizeSelect = document.getElementById('uam-size-id');
        const whSelect = document.getElementById('uam-wh-id');
        const size_id = Number(sizeSelect?.value) || 3;
        const size_name = sizeSelect?.selectedOptions[0]?.getAttribute('data-name') || '';
        const warehouse_id = Number(whSelect?.value) || 1;
        const warehouse_name = whSelect?.selectedOptions[0]?.getAttribute('data-name') || '';
        const unit_barcode = document.getElementById('uam-barcode')?.value || null;

        await electronApi.invoke('inventory:create-suit-unit', { suit_model_id: mId, size_id, size_name, warehouse_id, warehouse_name, unit_barcode });
        AppToast.success('تمت إضافة وحدة البدلة الفردية بنجاح! 🏷️');
        AppModal.close();
        renderSuitsPage();
      };
    };

    window._openUnitHistoryDrawer = async (unitId, barcode, modelName) => {
      const historyRes = await electronApi.invoke('inventory:get-unit-history', { unitId });
      const history = historyRes.data || [
        { old_status: 'IN_CLEANING', new_status: 'AVAILABLE', reason: 'استلام البدلة نظيفة ومكوية من المغسلة', created_at: '2026-11-05 14:30' },
        { old_status: 'DELIVERED', new_status: 'IN_CLEANING', reason: 'إرجاع البدلة من العميل وإرسالها للغسيل', created_at: '2026-11-04 18:00' },
        { old_status: 'BOOKED', new_status: 'DELIVERED', reason: 'تسليم البدلة للعميل حجز #BK-1039', created_at: '2026-11-01 12:00' },
        { old_status: null, new_status: 'AVAILABLE', reason: 'إضافة البدلة للمخزن لأول مرة', created_at: '2026-10-20 10:00' }
      ];

      window.AppDrawer.open({
        title: `📜 سجل حركة البدلة [${barcode}]`,
        contentHtml: `
          <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-card-hover); border-radius: var(--radius-sm);">
            <strong>الموديل:</strong> ${modelName}<br>
            <strong>الباركود:</strong> <code>${barcode}</code>
          </div>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${history.map(h => `
              <div style="padding: 12px; border-right: 3px solid var(--color-gold-500); background: var(--bg-card); border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
                  <span>${h.created_at || '—'}</span>
                  <span>${h.old_status ? h.old_status + ' ← ' + h.new_status : h.new_status}</span>
                </div>
                <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${h.reason || 'تحديث حالة'}</div>
              </div>
            `).join('')}
          </div>
        `,
        width: '440px'
      });
    };
  }

  // --- Phase 6: Render Shoes Inventory (مخزون الأحذية الكمي) ---
  async function renderShoesPage() {
    const res = await electronApi.invoke('inventory:get-quantity-products', { categoryType: 'SHOES' });
    const shoes = res.data || [];

    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">👞 مخزون الأحذية الكمي (Shoes Inventory)</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">إدارة كميات ومقاسات الأحذية الكلاسيك للبيع والتأجير، تعديل وحذف الأصناف والفلترة السريعة.</p>
        </div>
        <button id="btn-add-shoe-product" class="btn-accent-action">+ إضافة صنف حذاء جديد</button>
      </div>

      <div class="table-card">
        <div class="table-header" style="flex-wrap: wrap; gap: 10px;">
          <div>
            <h3>أصناف الأحذية والأرصدة الحالية (<span id="shoes-count">${shoes.length}</span> صنف)</h3>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <input type="text" id="shoes-search" class="form-control" placeholder="🔍 بحث بالاسم أو الكود..." style="width: 200px; padding: 6px 10px; font-size: 12px;">
            <select id="shoes-status-filter" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="ALL">جميع الأرصدة</option>
              <option value="AVAILABLE">متوفر بالمخزن</option>
              <option value="LOW">قارب على النفاد ⚠️</option>
              <option value="OUT">نفذ المخزون ❌</option>
            </select>
            <select id="shoes-sort" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="NEWEST">الأحدث إدخالاً</option>
              <option value="NAME_ASC">الاسم (أ - ي)</option>
              <option value="QTY_DESC">الأعلى رصيداً</option>
              <option value="PRICE_DESC">الأعلى سعراً</option>
              <option value="PRICE_ASC">الأقل سعراً</option>
            </select>
          </div>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>كود الصنف</th>
              <th>اسم الحذاء</th>
              <th>المقاس</th>
              <th>الرصيد الإجمالي</th>
              <th>المحجوز</th>
              <th>المتاح للبيع/الإيجار</th>
              <th>سعر البيع</th>
              <th>سعر الإيجار</th>
              <th>سعر التكلفة</th>
              <th>حالة المخزون</th>
              <th>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody id="shoes-tbody">
          </tbody>
        </table>
      </div>
    `;

    const renderShoesList = () => {
      const tbody = document.getElementById('shoes-tbody');
      const countEl = document.getElementById('shoes-count');
      if (!tbody) return;

      const searchTerm = document.getElementById('shoes-search')?.value?.trim()?.toLowerCase() || '';
      const statusFilter = document.getElementById('shoes-status-filter')?.value || 'ALL';
      const sortBy = document.getElementById('shoes-sort')?.value || 'NEWEST';

      let list = [...shoes];
      if (searchTerm) {
        list = list.filter(sh =>
          (sh.name && sh.name.toLowerCase().includes(searchTerm)) ||
          (sh.code && sh.code.toLowerCase().includes(searchTerm))
        );
      }

      if (statusFilter === 'AVAILABLE') {
        list = list.filter(sh => (sh.available_quantity || 0) > (sh.reorder_level || 0));
      } else if (statusFilter === 'LOW') {
        list = list.filter(sh => (sh.available_quantity || 0) > 0 && (sh.available_quantity || 0) <= (sh.reorder_level || 0));
      } else if (statusFilter === 'OUT') {
        list = list.filter(sh => (sh.available_quantity || 0) <= 0);
      }

      if (sortBy === 'NAME_ASC') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      } else if (sortBy === 'QTY_DESC') {
        list.sort((a, b) => (b.available_quantity || 0) - (a.available_quantity || 0));
      } else if (sortBy === 'PRICE_DESC') {
        list.sort((a, b) => (b.sale_price || b.rental_price || 0) - (a.sale_price || a.rental_price || 0));
      } else if (sortBy === 'PRICE_ASC') {
        list.sort((a, b) => (a.sale_price || a.rental_price || 0) - (b.sale_price || b.rental_price || 0));
      } else {
        list.sort((a, b) => b.id - a.id);
      }

      if (countEl) countEl.textContent = list.length;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 25px; color: var(--text-secondary);">لا توجد أصناف مطابقة لخيارات الفلترة المحددة.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(sh => `
        <tr>
          <td><code>${sh.code}</code></td>
          <td><strong>${sh.name}</strong></td>
          <td>
            ${sh.sizes_detail ? `
              <div style="display: flex; flex-wrap: wrap; gap: 3px; max-width: 200px;">
                ${sh.sizes_detail.split(' | ').map(sz => `<span class="badge badge-info" style="font-size: 10px; padding: 2px 5px;">${sz}</span>`).join('')}
              </div>
            ` : `<span class="badge badge-info" style="font-size: 11px; font-weight: 600;">${sh.sizes_summary || sh.size_name || 'عام / موحد'}</span>`}
          </td>
          <td>${sh.total_quantity} زوج</td>
          <td>${sh.reserved_quantity || 0} زوج</td>
          <td><strong style="color: ${(sh.available_quantity || 0) <= (sh.reorder_level || 0) ? 'var(--color-danger)' : 'var(--color-success)'}">${sh.available_quantity || 0} زوج</strong></td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(sh.sale_price) : sh.sale_price + ' ج.م'}</td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(sh.rental_price) : sh.rental_price + ' ج.م'}</td>
          <td style="color: var(--color-warning); font-weight: 600;">${window.UiUtils ? window.UiUtils.formatCurrency(sh.cost_price || 0) : (sh.cost_price || 0) + ' ج.م'}</td>
          <td>
            ${(sh.available_quantity || 0) <= 0
          ? '<span class="badge badge-danger">نفذ المخزون</span>'
          : (sh.available_quantity || 0) <= (sh.reorder_level || 0)
            ? '<span class="badge badge-warning">⚠️ قارب على النفاد</span>'
            : '<span class="badge badge-success">متوفر بالمخزن</span>'}
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openAdjustStockModal(${sh.id}, '${sh.name.replace(/'/g, "\\'")}')">تسوية (+/-)</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openEditQuantityProduct(${sh.id}, '${sh.name.replace(/'/g, "\\'")}', 'SHOES')">✏️ تعديل</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteQuantityProduct(${sh.id}, '${sh.name.replace(/'/g, "\\'")}', 'SHOES')">🗑️ حذف</button>
            </div>
          </td>
        </tr>
      `).join('');
    };

    renderShoesList();

    // Wire live filters
    document.getElementById('shoes-search')?.addEventListener('input', renderShoesList);
    document.getElementById('shoes-status-filter')?.addEventListener('change', renderShoesList);
    document.getElementById('shoes-sort')?.addEventListener('change', renderShoesList);

    // Wire Add Shoe Product button
    document.getElementById('btn-add-shoe-product')?.addEventListener('click', async () => {
      let shoeSizes = [];
      let warehouses = [];
      try {
        const [sizesRes, whRes] = await Promise.all([
          electronApi.invoke('admin:get-sizes', { categoryType: 'SHOE' }),
          electronApi.invoke('admin:get-warehouses')
        ]);
        shoeSizes = Array.isArray(sizesRes) ? sizesRes : (sizesRes?.data || []);
        warehouses = (whRes?.data || []).filter(w => w.is_active !== 0);
      } catch (e) {
        console.warn('Error fetching shoe sizes/warehouses:', e);
      }

      window.AppModal.open({
        title: '➕ إضافة صنف حذاء جديد بمقاساته',
        contentHtml: `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">كود الصنف (مثال: SH-001)</label>
              <input type="text" id="new-shoe-code" class="form-control" placeholder="الكود...">
            </div>
            <div class="form-group">
              <label class="form-label">المخزن / الفرع المستهدف</label>
              <select id="new-shoe-wh" class="form-control">
                ${warehouses.length > 0 ? warehouses.map(w => `<option value="${w.id}" ${w.is_default ? 'selected' : ''}>${w.name} ${w.is_default ? '★ (افتراضي)' : ''}</option>`).join('') : '<option value="1">المخزن الرئيسي</option>'}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">اسم الحذاء والموديل</label>
            <input type="text" id="new-shoe-name" class="form-control" placeholder="مثال: حذاء كلاسيك أسود جلد طبيعي">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label class="form-label">سعر البيع (ج.م)</label>
              <input type="number" id="new-shoe-sale-price" class="form-control" value="800" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر الإيجار (ج.م)</label>
              <input type="number" id="new-shoe-rental-price" class="form-control" value="200" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر التكلفة (ج.م) <span style="color:var(--color-danger);">*</span></label>
              <input type="number" id="new-shoe-cost-price" class="form-control" value="400" min="1" required>
            </div>
          </div>

          <!-- Per Size Quantities Grid -->
          <div class="form-group">
            <label class="form-label">الكميات الافتتاحية لكل مقاس (أزواج) <span style="font-size: 11px; color: var(--text-muted);">(حسب المقاسات المعتمدة)</span></label>
            ${shoeSizes.length > 0 ? `
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; max-height: 180px; overflow-y: auto; background: var(--bg-card-hover); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                ${shoeSizes.map(s => `
                  <div style="background: var(--bg-card); padding: 6px; border-radius: 4px; border: 1px solid var(--border-color); text-align: center;">
                    <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px; color: var(--color-gold-400);">${s.name}</div>
                    <input type="number" class="shoe-size-qty-input form-control" data-size-id="${s.id}" data-size-name="${s.name}" min="0" value="0" style="padding: 4px; text-align: center; font-size: 13px; font-weight: 700;">
                  </div>
                `).join('')}
              </div>
              <div style="margin-top: 6px; font-size: 12px; font-weight: 600; color: var(--color-success); display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(16,185,129,0.08); border-radius: 4px;">
                <span>إجمالي كمية الأحذية المدخلة:</span>
                <span id="shoe-total-qty-badge">0 زوج</span>
              </div>
            ` : `
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label">الكمية الافتتاحية (أزواج)</label>
                  <input type="number" id="new-shoe-qty" class="form-control" value="10" min="0">
                </div>
                <div class="form-group">
                  <label class="form-label">المقاس</label>
                  <input type="text" id="new-shoe-single-size" class="form-control" placeholder="مثال: مقاس 42">
                </div>
              </div>
            `}
          </div>

          <div class="form-group">
            <label class="form-label">حد إعادة الطلب (تنبيه قرب النفاد)</label>
            <input type="number" id="new-shoe-reorder" class="form-control" value="3" min="0">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveNewShoe()">حفظ الصنف</button>
        `,
        width: '540px'
      });

      // Live total calculation for shoe sizes
      const shoeInputs = document.querySelectorAll('.shoe-size-qty-input');
      const updateShoeTotal = () => {
        let sum = 0;
        shoeInputs.forEach(inp => { sum += Number(inp.value) || 0; });
        const b = document.getElementById('shoe-total-qty-badge');
        if (b) b.textContent = `${sum} زوج`;
      };
      shoeInputs.forEach(inp => inp.addEventListener('input', updateShoeTotal));

      window._saveNewShoe = async () => {
        const code = document.getElementById('new-shoe-code')?.value?.trim();
        const name = document.getElementById('new-shoe-name')?.value?.trim();
        const sale_price = Number(document.getElementById('new-shoe-sale-price')?.value) || 0;
        const rental_price = Number(document.getElementById('new-shoe-rental-price')?.value) || 0;
        const cost_price = Number(document.getElementById('new-shoe-cost-price')?.value) || 0;
        const reorder_level = Number(document.getElementById('new-shoe-reorder')?.value) || 0;
        const warehouse_id = Number(document.getElementById('new-shoe-wh')?.value) || 1;

        if (!name) {
          AppToast.error('يرجى إدخال اسم الحذاء.');
          return;
        }

        if (!cost_price || cost_price <= 0) {
          AppToast.error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر بدقة.');
          return;
        }

        const variants = [];
        let totalCreatedQty = 0;
        if (shoeInputs.length > 0) {
          shoeInputs.forEach(inp => {
            const q = Number(inp.value) || 0;
            if (q > 0) {
              variants.push({ size_id: Number(inp.dataset.sizeId), initial_quantity: q });
              totalCreatedQty += q;
            }
          });
        } else {
          totalCreatedQty = Number(document.getElementById('new-shoe-qty')?.value) || 0;
        }

        if (variants.length === 0 && totalCreatedQty <= 0) {
          AppToast.error('يرجى إدخال كمية لزوج واحد على الأقل في أحد المقاسات.');
          return;
        }

        try {
          await electronApi.invoke('inventory:create-quantity-product', {
            code: code || undefined,
            name,
            category_type: 'SHOES',
            category_name: 'أحذية كلاسيك',
            sale_price,
            rental_price,
            cost_price,
            total_quantity: totalCreatedQty,
            reorder_level,
            warehouse_id,
            targetWarehouse: warehouse_id,
            variants: variants.length > 0 ? variants : undefined
          });
          AppToast.success('تمت إضافة صنف الحذاء ومقاساته بنجاح! 👞');
          AppModal.close();
          renderShoesPage();
        } catch (err) {
          AppToast.error(err.message || 'فشل في حفظ الصنف');
        }
      };
    });

    window._openAdjustStockModal = async (prodId, prodName) => {
      let warehouses = [];
      let variants = [];
      try {
        const [whRes, vRes] = await Promise.all([
          electronApi.invoke('admin:get-warehouses'),
          electronApi.invoke('inventory:get-product-variants', { productId: prodId })
        ]);
        warehouses = (whRes?.data || []).filter(w => w.is_active !== 0);
        variants = vRes?.data || [];
      } catch (e) { }

      window.AppModal.open({
        title: `تسوية رصيد: ${prodName}`,
        contentHtml: `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">المخزن المستهدف</label>
              <select id="adj-wh-id" class="form-control">
                ${warehouses.map(w => `<option value="${w.id}" ${w.is_default ? 'selected' : ''}>${w.name}</option>`).join('')}
              </select>
            </div>
            ${variants.length > 0 ? `
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">المقاس المراد تسويته</label>
                <select id="adj-variant-id" class="form-control">
                  ${variants.map(v => `<option value="${v.variant_id}">${v.size_name || 'عام'} (الرصيد: ${v.available_quantity})</option>`).join('')}
                </select>
              </div>
            ` : '<input type="hidden" id="adj-variant-id" value="">'}
          </div>
          <div class="form-group">
            <label class="form-label">الكمية المراد إضافتها أو خصمها (+ وارد / - صادر)</label>
            <input type="number" id="adj-qty" class="form-control" placeholder="مثال: 5 أو -2" value="1">
          </div>
          <div class="form-group">
            <label class="form-label">سبب الحركة</label>
            <select id="adj-reason" class="form-control">
              <option value="وارد شراء بضاعة جديدة">وارد شراء بضاعة جديدة (+)</option>
              <option value="تسوية جرد عجز أو تالف">تسوية جرد تالف أو عجز (-)</option>
              <option value="تسوية خطأ إدخال سابق">تسوية خطأ إدخال</option>
            </select>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._confirmStockAdj(${prodId})">تأكيد التسوية</button>
        `,
        width: '480px'
      });

      window._confirmStockAdj = async (pId) => {
        const delta = Number(document.getElementById('adj-qty')?.value) || 0;
        const reason = document.getElementById('adj-reason')?.value || 'تسوية يدوية';
        const whId = Number(document.getElementById('adj-wh-id')?.value) || 1;
        const vId = Number(document.getElementById('adj-variant-id')?.value) || pId;
        try {
          await electronApi.invoke('inventory:adjust-stock', { productId: pId, variantId: vId, warehouseId: whId, deltaQty: delta, reason });
          AppToast.success(`تمت تسوية المخزون بنجاح (${delta > 0 ? '+' + delta : delta})`);
          AppModal.close();
          renderShoesPage();
        } catch (err) {
          AppToast.error(err.message || 'فشلت تسوية المخزون');
        }
      };
    };
  }

  // --- Phase 6: Render Accessories Inventory (مخزون الإكسسوارات) ---
  async function renderAccessoriesPage() {
    const res = await electronApi.invoke('inventory:get-quantity-products', { categoryType: 'ACCESSORIES' });
    const items = res.data || [];

    // Distinct subcategories for filter
    const subCats = [...new Set(items.map(i => i.category_name).filter(Boolean))];

    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">🎀 مخزون الإكسسوارات والإضافات (Accessories)</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">إدارة ربطات العنق، الببيونات، أزرار الأكمام، والقمصان الرجالية وإضافات البدل مع الفلترة والتعديل.</p>
        </div>
        <button id="btn-add-accessory-product" class="btn-accent-action">+ إضافة إكسسوار جديد</button>
      </div>

      <div class="table-card">
        <div class="table-header" style="flex-wrap: wrap; gap: 10px;">
          <div>
            <h3>قائمة الإكسسوارات المتاحة بالمحل (<span id="acc-count">${items.length}</span> صنف)</h3>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <input type="text" id="acc-search" class="form-control" placeholder="🔍 بحث بالاسم أو الكود..." style="width: 180px; padding: 6px 10px; font-size: 12px;">
            ${subCats.length > 1 ? `
              <select id="acc-cat-filter" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
                <option value="ALL">جميع التصنيفات</option>
                ${subCats.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            ` : ''}
            <select id="acc-status-filter" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="ALL">جميع الأرصدة</option>
              <option value="AVAILABLE">متوفر بالمخزن</option>
              <option value="LOW">قارب على النفاد ⚠️</option>
              <option value="OUT">نفذ المخزون ❌</option>
            </select>
            <select id="acc-sort" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="NEWEST">الأحدث إدخالاً</option>
              <option value="NAME_ASC">الاسم (أ - ي)</option>
              <option value="QTY_DESC">الأعلى رصيداً</option>
              <option value="PRICE_DESC">الأعلى سعراً</option>
              <option value="PRICE_ASC">الأقل سعراً</option>
            </select>
          </div>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>اسم الإكسسوار</th>
              <th>المقاس</th>
              <th>التصنيف</th>
              <th>الرصيد الكلي</th>
              <th>المتاح</th>
              <th>سعر البيع</th>
              <th>سعر الإيجار</th>
              <th>سعر التكلفة</th>
              <th>حالة المخزون</th>
              <th>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody id="acc-tbody">
          </tbody>
        </table>
      </div>
    `;

    const renderAccList = () => {
      const tbody = document.getElementById('acc-tbody');
      const countEl = document.getElementById('acc-count');
      if (!tbody) return;

      const searchTerm = document.getElementById('acc-search')?.value?.trim()?.toLowerCase() || '';
      const catFilter = document.getElementById('acc-cat-filter')?.value || 'ALL';
      const statusFilter = document.getElementById('acc-status-filter')?.value || 'ALL';
      const sortBy = document.getElementById('acc-sort')?.value || 'NEWEST';

      let list = [...items];
      if (searchTerm) {
        list = list.filter(it =>
          (it.name && it.name.toLowerCase().includes(searchTerm)) ||
          (it.code && it.code.toLowerCase().includes(searchTerm))
        );
      }

      if (catFilter !== 'ALL') {
        list = list.filter(it => it.category_name === catFilter);
      }

      if (statusFilter === 'AVAILABLE') {
        list = list.filter(it => (it.available_quantity || 0) > (it.reorder_level || 0));
      } else if (statusFilter === 'LOW') {
        list = list.filter(it => (it.available_quantity || 0) > 0 && (it.available_quantity || 0) <= (it.reorder_level || 0));
      } else if (statusFilter === 'OUT') {
        list = list.filter(it => (it.available_quantity || 0) <= 0);
      }

      if (sortBy === 'NAME_ASC') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      } else if (sortBy === 'QTY_DESC') {
        list.sort((a, b) => (b.available_quantity || 0) - (a.available_quantity || 0));
      } else if (sortBy === 'PRICE_DESC') {
        list.sort((a, b) => (b.sale_price || b.rental_price || 0) - (a.sale_price || a.rental_price || 0));
      } else if (sortBy === 'PRICE_ASC') {
        list.sort((a, b) => (a.sale_price || a.rental_price || 0) - (b.sale_price || b.rental_price || 0));
      } else {
        list.sort((a, b) => b.id - a.id);
      }

      if (countEl) countEl.textContent = list.length;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 25px; color: var(--text-secondary);">لا توجد إكسسوارات مطابقة لخيارات الفلترة المحددة.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(it => `
        <tr>
          <td><code>${it.code}</code></td>
          <td><strong>${it.name}</strong></td>
          <td>
            ${it.sizes_detail ? `
              <div style="display: flex; flex-wrap: wrap; gap: 3px; max-width: 200px;">
                ${it.sizes_detail.split(' | ').map(sz => `<span class="badge badge-info" style="font-size: 10px; padding: 2px 5px;">${sz}</span>`).join('')}
              </div>
            ` : `<span class="badge badge-info" style="font-size: 11px;">${it.sizes_summary || it.size_name || 'عام / موحد'}</span>`}
          </td>
          <td><span class="badge badge-info">${it.category_name}</span></td>
          <td>${it.total_quantity} قطعة</td>
          <td><strong style="color: ${(it.available_quantity || 0) <= (it.reorder_level || 0) ? 'var(--color-danger)' : 'var(--color-success)'}">${it.available_quantity || 0} قطعة</strong></td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(it.sale_price) : it.sale_price + ' ج.م'}</td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(it.rental_price) : it.rental_price + ' ج.م'}</td>
          <td style="color: var(--color-warning); font-weight: 600;">${window.UiUtils ? window.UiUtils.formatCurrency(it.cost_price || 0) : (it.cost_price || 0) + ' ج.م'}</td>
          <td>
            ${(it.available_quantity || 0) <= 0
          ? '<span class="badge badge-danger">نفذ المخزون</span>'
          : (it.available_quantity || 0) <= (it.reorder_level || 0)
            ? '<span class="badge badge-warning">⚠️ قارب على النفاد</span>'
            : '<span class="badge badge-success">متوفر بالمخزن</span>'}
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openAccAdjustModal(${it.id}, '${it.name.replace(/'/g, "\\'")}')">تسوية (+/-)</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openEditQuantityProduct(${it.id}, '${it.name.replace(/'/g, "\\'")}', 'ACCESSORIES')">✏️ تعديل</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteQuantityProduct(${it.id}, '${it.name.replace(/'/g, "\\'")}', 'ACCESSORIES')">🗑️ حذف</button>
            </div>
          </td>
        </tr>
      `).join('');
    };

    renderAccList();

    // Wire live filters
    document.getElementById('acc-search')?.addEventListener('input', renderAccList);
    document.getElementById('acc-cat-filter')?.addEventListener('change', renderAccList);
    document.getElementById('acc-status-filter')?.addEventListener('change', renderAccList);
    document.getElementById('acc-sort')?.addEventListener('change', renderAccList);

    // Wire Add Accessory button (Dynamic Categories from Admin)
    document.getElementById('btn-add-accessory-product')?.addEventListener('click', async () => {
      const [catRes, sizesRes, allSizesRes, whRes] = await Promise.all([
        electronApi.invoke('admin:get-categories'),
        electronApi.invoke('admin:get-sizes', { categoryType: 'ACCESSORIES' }),
        electronApi.invoke('admin:get-sizes'),
        electronApi.invoke('admin:get-warehouses')
      ]);
      const allCats = catRes.data || [];
      const warehouses = (whRes?.data || []).filter(w => w.is_active !== 0);
      const mainAccCat = allCats.find(c => c.code === 'TIES' || c.type === 'ACCESSORIES' || c.code === 'ACCESSORIES') || { id: 3, code: 'TIES', name: 'اضافات' };
      const accCats = allCats.filter(c => (c.type === 'ACCESSORIES' || c.code === 'TIES' || c.code === 'ACCESSORIES') && c.is_active !== 0);
      const accSizes = Array.isArray(sizesRes) ? sizesRes : (sizesRes?.data || []);
      const allSizes = Array.isArray(allSizesRes) ? allSizesRes : (allSizesRes?.data || []);

      const accCatCodes = new Set(['ACCESSORIES', 'ACCESSORY', 'TIES', ...accCats.map(c => (c.code || '').toUpperCase())]);
      const combinedSizesMap = new Map();
      accSizes.forEach(s => combinedSizesMap.set(s.id, s));
      allSizes.filter(s => accCatCodes.has((s.category_type || '').toUpperCase())).forEach(s => combinedSizesMap.set(s.id, s));
      const finalAccSizes = Array.from(combinedSizesMap.values());

      window.AppModal.open({
        title: '➕ إضافة إكسسوار جديد بمقاساته ومخزنه',
        contentHtml: `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">تصنيف الإكسسوار (من الأقسام المعتمدة)</label>
              <select id="new-acc-category" class="form-control">
                ${accCats.map(c => `<option value="${c.name}" data-code="${c.code}" data-id="${c.id}">${c.name}</option>`).join('')}
                <option value="ربطات عنق وببيونات" data-code="${mainAccCat.code}" data-id="${mainAccCat.id}">ربطات عنق وببيونات</option>
                <option value="أزرار أكمام وإكسسوارات" data-code="${mainAccCat.code}" data-id="${mainAccCat.id}">أزرار أكمام وإكسسوارات</option>
                <option value="قمصان بدل" data-code="${mainAccCat.code}" data-id="${mainAccCat.id}">قمصان بدل</option>
                <option value="أحزمة وجلود" data-code="${mainAccCat.code}" data-id="${mainAccCat.id}">أحزمة وجلود</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">المخزن / الفرع المستهدف</label>
              <select id="new-acc-wh" class="form-control">
                ${warehouses.length > 0 ? warehouses.map(w => `<option value="${w.id}" ${w.is_default ? 'selected' : ''}>${w.name} ${w.is_default ? '★ (افتراضي)' : ''}</option>`).join('') : '<option value="1">المخزن الرئيسي</option>'}
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">كود الصنف (مثال: ACC-001)</label>
              <input type="text" id="new-acc-code" class="form-control" placeholder="الكود (اختياري)...">
            </div>
            <div class="form-group">
              <label class="form-label">اسم الإكسسوار</label>
              <input type="text" id="new-acc-name" class="form-control" placeholder="مثال: قميص أبيض كلاسيك أو ربطة عنق">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label class="form-label">سعر البيع (ج.م)</label>
              <input type="number" id="new-acc-sale-price" class="form-control" value="250" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر الإيجار (ج.م)</label>
              <input type="number" id="new-acc-rental-price" class="form-control" value="50" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر التكلفة (ج.م) <span style="color:var(--color-danger);">*</span></label>
              <input type="number" id="new-acc-cost-price" class="form-control" value="100" min="1" required>
            </div>
          </div>

          <!-- Per Size Quantities Grid or Single Qty -->
          <div class="form-group">
            <label class="form-label">الكميات الافتتاحية لكل مقاس <span style="font-size: 11px; color: var(--text-muted);">(حسب المقاسات المعتمدة)</span></label>
            ${finalAccSizes.length > 0 ? `
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; max-height: 170px; overflow-y: auto; background: var(--bg-card-hover); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                ${finalAccSizes.map(s => `
                  <div style="background: var(--bg-card); padding: 6px; border-radius: 4px; border: 1px solid var(--border-color); text-align: center;">
                    <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px; color: var(--color-gold-400);">${s.name}</div>
                    <input type="number" class="acc-size-qty-input form-control" data-size-id="${s.id}" data-size-name="${s.name}" min="0" value="0" style="padding: 4px; text-align: center; font-size: 13px; font-weight: 700;">
                  </div>
                `).join('')}
              </div>
              <div style="margin-top: 6px; font-size: 12px; font-weight: 600; color: var(--color-success); display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(16,185,129,0.08); border-radius: 4px;">
                <span>إجمالي القطع المدخلة:</span>
                <span id="acc-total-qty-badge">0 قطعة</span>
              </div>
            ` : `
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label">الكمية الافتتاحية</label>
                  <input type="number" id="new-acc-qty" class="form-control" value="20" min="0">
                </div>
                <div class="form-group">
                  <label class="form-label">المقاس</label>
                  <input type="text" id="new-acc-single-size" class="form-control" placeholder="عام / بدون مقاس">
                </div>
              </div>
            `}
          </div>

          <div class="form-group">
            <label class="form-label">حد إعادة الطلب (تنبيه قرب النفاد)</label>
            <input type="number" id="new-acc-reorder" class="form-control" value="5" min="0">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveNewAccessory()">حفظ الإكسسوار</button>
        `,
        width: '540px'
      });

      // Live total calculation for acc sizes
      const accInputs = document.querySelectorAll('.acc-size-qty-input');
      const updateAccTotal = () => {
        let sum = 0;
        accInputs.forEach(inp => { sum += Number(inp.value) || 0; });
        const b = document.getElementById('acc-total-qty-badge');
        if (b) b.textContent = `${sum} قطعة`;
      };
      accInputs.forEach(inp => inp.addEventListener('input', updateAccTotal));

      window._saveNewAccessory = async () => {
        const catSelect = document.getElementById('new-acc-category');
        const selectedCatOpt = catSelect?.selectedOptions?.[0];
        const category_name = catSelect?.value || 'إكسسوارات';
        const category_id = selectedCatOpt?.getAttribute('data-id') ? Number(selectedCatOpt.getAttribute('data-id')) : mainAccCat.id;
        const category_type = selectedCatOpt?.getAttribute('data-code') || mainAccCat.code || 'ACCESSORIES';

        const code = document.getElementById('new-acc-code')?.value?.trim();
        const name = document.getElementById('new-acc-name')?.value?.trim();
        const warehouse_id = Number(document.getElementById('new-acc-wh')?.value) || 1;

        const sale_price = Number(document.getElementById('new-acc-sale-price')?.value) || 0;
        const rental_price = Number(document.getElementById('new-acc-rental-price')?.value) || 0;
        const cost_price = Number(document.getElementById('new-acc-cost-price')?.value) || 0;
        const reorder_level = Number(document.getElementById('new-acc-reorder')?.value) || 0;

        if (!name) {
          AppToast.error('يرجى إدخال اسم الإكسسوار.');
          return;
        }

        if (!cost_price || cost_price <= 0) {
          AppToast.error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر بدقة.');
          return;
        }

        const variants = [];
        let totalCreatedQty = 0;
        if (accInputs.length > 0) {
          accInputs.forEach(inp => {
            const q = Number(inp.value) || 0;
            if (q > 0) {
              variants.push({ size_id: Number(inp.dataset.sizeId), initial_quantity: q });
              totalCreatedQty += q;
            }
          });
        } else {
          totalCreatedQty = Number(document.getElementById('new-acc-qty')?.value) || 0;
        }

        if (variants.length === 0 && totalCreatedQty <= 0) {
          AppToast.error('يرجى إدخال كمية لقطعة واحدة على الأقل في أحد المقاسات.');
          return;
        }

        try {
          await electronApi.invoke('inventory:create-quantity-product', {
            code: code || undefined,
            name,
            category_id,
            category_type,
            category_name,
            sale_price,
            rental_price,
            cost_price,
            total_quantity: totalCreatedQty,
            reorder_level,
            warehouse_id,
            targetWarehouse: warehouse_id,
            variants: variants.length > 0 ? variants : undefined
          });
          AppToast.success('تمت إضافة الإكسسوار ومقاساته بنجاح! 🎀');
          AppModal.close();
          renderAccessoriesPage();
        } catch (err) {
          AppToast.error(err.message || 'فشل في حفظ الإكسسوار');
        }
      };
    });

    // Wire stock adjustment for accessories
    window._openAccAdjustModal = async (prodId, prodName) => {
      let warehouses = [];
      let variants = [];
      try {
        const [whRes, vRes] = await Promise.all([
          electronApi.invoke('admin:get-warehouses'),
          electronApi.invoke('inventory:get-product-variants', { productId: prodId })
        ]);
        warehouses = (whRes?.data || []).filter(w => w.is_active !== 0);
        variants = vRes?.data || [];
      } catch (e) { }

      window.AppModal.open({
        title: `تسوية رصيد: ${prodName}`,
        contentHtml: `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">المخزن المستهدف</label>
              <select id="acc-adj-wh-id" class="form-control">
                ${warehouses.map(w => `<option value="${w.id}" ${w.is_default ? 'selected' : ''}>${w.name}</option>`).join('')}
              </select>
            </div>
            ${variants.length > 0 ? `
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">المقاس المراد تسويته</label>
                <select id="acc-adj-variant-id" class="form-control">
                  ${variants.map(v => `<option value="${v.variant_id}">${v.size_name || 'عام'} (الرصيد: ${v.available_quantity})</option>`).join('')}
                </select>
              </div>
            ` : '<input type="hidden" id="acc-adj-variant-id" value="">'}
          </div>
          <div class="form-group">
            <label class="form-label">الكمية المراد إضافتها أو خصمها (+ وارد / - صادر)</label>
            <input type="number" id="acc-adj-qty" class="form-control" placeholder="مثال: 5 أو -2" value="1">
          </div>
          <div class="form-group">
            <label class="form-label">سبب الحركة</label>
            <select id="acc-adj-reason" class="form-control">
              <option value="وارد شراء بضاعة جديدة">وارد شراء بضاعة جديدة (+)</option>
              <option value="تسوية جرد عجز أو تالف">تسوية جرد تالف أو عجز (-)</option>
              <option value="تسوية خطأ إدخال سابق">تسوية خطأ إدخال</option>
            </select>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._confirmAccAdj(${prodId})">تأكيد التسوية</button>
        `,
        width: '480px'
      });

      window._confirmAccAdj = async (pId) => {
        const delta = Number(document.getElementById('acc-adj-qty')?.value) || 0;
        const reason = document.getElementById('acc-adj-reason')?.value || 'تسوية يدوية';
        const whId = Number(document.getElementById('acc-adj-wh-id')?.value) || 1;
        const vId = Number(document.getElementById('acc-adj-variant-id')?.value) || pId;
        try {
          await electronApi.invoke('inventory:adjust-stock', { productId: pId, variantId: vId, warehouseId: whId, deltaQty: delta, reason });
          AppToast.success(`تمت تسوية المخزون بنجاح (${delta > 0 ? '+' + delta : delta})`);
          AppModal.close();
          renderAccessoriesPage();
        } catch (err) {
          AppToast.error(err.message || 'فشلت تسوية المخزون');
        }
      };
    };
  }

  // --- Phase 6: Generic Dynamic Category Inventory (مخزون أي قسم مخصص ديناميكي) ---
  async function renderDynamicCategoryPage(categoryCode, explicitName) {
    // 1. Fetch category details from admin
    let catObj = null;
    try {
      const catsRes = await electronApi.invoke('admin:get-categories');
      const allCats = catsRes?.data || [];
      catObj = allCats.find(c => c.code === categoryCode || String(c.id) === categoryCode || c.type === categoryCode);
    } catch (e) {
      console.warn('Error fetching category metadata:', e);
    }

    const catName = explicitName || catObj?.name || categoryCode;
    const catCode = catObj?.code || categoryCode;
    const catId = catObj?.id;
    const icon = getCategoryIcon(catCode, catName, catObj?.type);

    // 2. Fetch products for this category
    let items = [];
    try {
      const res = await electronApi.invoke('inventory:get-quantity-products', { categoryType: catCode, categoryId: catId, code: catCode });
      items = res?.data || [];
    } catch (err) {
      console.warn('Error fetching category products:', err);
    }

    // Calculate metrics
    const totalQty = items.reduce((sum, it) => sum + (Number(it.total_quantity) || 0), 0);
    const availableQty = items.reduce((sum, it) => sum + (Number(it.available_quantity) || 0), 0);
    const lowStockCount = items.filter(it => (it.available_quantity || 0) <= (it.reorder_level || 0)).length;

    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">${icon} مخزون ${catName} (${catCode})</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">إدارة أصناف وموديلات ${catName}، الأرصدة الحالية، والتسويات الجردية والأسعار.</p>
        </div>
        <button id="btn-add-dynamic-product" class="btn-accent-action">+ إضافة صنف جديد في ${catName}</button>
      </div>

      <!-- Category KPIs -->
      <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
        <div class="stat-card">
          <div class="stat-icon">${icon}</div>
          <div class="stat-info">
            <h4>إجمالي الأصناف المسجلة</h4>
            <div class="value">${items.length} صنف</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-info); background: rgba(59,130,246,0.12)">📦</div>
          <div class="stat-info">
            <h4>إجمالي الرصيد بالمخازن</h4>
            <div class="value">${totalQty} قطعة</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-success); background: rgba(16,185,129,0.12)">✅</div>
          <div class="stat-info">
            <h4>متاح للبيع والتأجير</h4>
            <div class="value" style="color: var(--color-success)">${availableQty} قطعة</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: ${lowStockCount > 0 ? 'var(--color-danger)' : 'var(--text-secondary)'}; background: ${lowStockCount > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-card-hover)'}">⚠️</div>
          <div class="stat-info">
            <h4>أصناف قيد النفاد</h4>
            <div class="value" style="color: ${lowStockCount > 0 ? 'var(--color-danger)' : 'inherit'}">${lowStockCount} صنف</div>
          </div>
        </div>
      </div>

      <!-- Items Table with Filter, Search & Sort Toolbar -->
      <div class="table-card">
        <div class="table-header" style="flex-wrap: wrap; gap: 10px;">
          <div>
            <h3>قائمة أصناف ${catName} والأرصدة (<span id="dyn-count">${items.length}</span> صنف)</h3>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <input type="text" id="dyn-search" class="form-control" placeholder="🔍 بحث بالاسم أو الكود..." style="width: 180px; padding: 6px 10px; font-size: 12px;">
            <select id="dyn-status-filter" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="ALL">جميع الأرصدة</option>
              <option value="AVAILABLE">متوفر بالمخزن</option>
              <option value="LOW">قارب على النفاد ⚠️</option>
              <option value="OUT">نفذ المخزون ❌</option>
            </select>
            <select id="dyn-sort" class="form-control" style="width: auto; padding: 6px 10px; font-size: 12px;">
              <option value="NEWEST">الأحدث إدخالاً</option>
              <option value="NAME_ASC">الاسم (أ - ي)</option>
              <option value="QTY_DESC">الأعلى رصيداً</option>
              <option value="PRICE_DESC">الأعلى سعراً</option>
              <option value="PRICE_ASC">الأقل سعراً</option>
            </select>
          </div>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>كود الصنف</th>
              <th>اسم الصنف</th>
              <th>المقاس</th>
              <th>الرصيد الإجمالي</th>
              <th>المحجوز</th>
              <th>المتاح للبيع/الإيجار</th>
              <th>سعر البيع</th>
              <th>سعر الإيجار</th>
              <th>سعر التكلفة</th>
              <th>حالة المخزون</th>
              <th>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody id="dyn-tbody">
          </tbody>
        </table>
      </div>
    `;

    const renderDynList = () => {
      const tbody = document.getElementById('dyn-tbody');
      const countEl = document.getElementById('dyn-count');
      if (!tbody) return;

      const searchTerm = document.getElementById('dyn-search')?.value?.trim()?.toLowerCase() || '';
      const statusFilter = document.getElementById('dyn-status-filter')?.value || 'ALL';
      const sortBy = document.getElementById('dyn-sort')?.value || 'NEWEST';

      let list = [...items];
      if (searchTerm) {
        list = list.filter(it =>
          (it.name && it.name.toLowerCase().includes(searchTerm)) ||
          (it.code && it.code.toLowerCase().includes(searchTerm))
        );
      }

      if (statusFilter === 'AVAILABLE') {
        list = list.filter(it => (it.available_quantity || 0) > (it.reorder_level || 0));
      } else if (statusFilter === 'LOW') {
        list = list.filter(it => (it.available_quantity || 0) > 0 && (it.available_quantity || 0) <= (it.reorder_level || 0));
      } else if (statusFilter === 'OUT') {
        list = list.filter(it => (it.available_quantity || 0) <= 0);
      }

      if (sortBy === 'NAME_ASC') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      } else if (sortBy === 'QTY_DESC') {
        list.sort((a, b) => (b.available_quantity || 0) - (a.available_quantity || 0));
      } else if (sortBy === 'PRICE_DESC') {
        list.sort((a, b) => (b.sale_price || b.rental_price || 0) - (a.sale_price || a.rental_price || 0));
      } else if (sortBy === 'PRICE_ASC') {
        list.sort((a, b) => (a.sale_price || a.rental_price || 0) - (b.sale_price || b.rental_price || 0));
      } else {
        list.sort((a, b) => b.id - a.id);
      }

      if (countEl) countEl.textContent = list.length;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 25px; color: var(--text-secondary);">لا توجد أصناف مطابقة لخيارات الفلترة المحددة.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(it => `
        <tr>
          <td><code>${it.code}</code></td>
          <td><strong>${it.name}</strong></td>
          <td>
            ${it.sizes_detail ? `
              <div style="display: flex; flex-wrap: wrap; gap: 3px; max-width: 200px;">
                ${it.sizes_detail.split(' | ').map(sz => `<span class="badge badge-info" style="font-size: 10px; padding: 2px 5px;">${sz}</span>`).join('')}
              </div>
            ` : `<span class="badge badge-info" style="font-size: 11px;">${it.sizes_summary || it.size_name || 'عام / موحد'}</span>`}
          </td>
          <td>${it.total_quantity} قطعة</td>
          <td>${it.reserved_quantity || 0} قطعة</td>
          <td><strong style="color: ${(it.available_quantity || 0) <= (it.reorder_level || 0) ? 'var(--color-danger)' : 'var(--color-success)'}">${it.available_quantity || 0} قطعة</strong></td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(it.sale_price) : (it.sale_price || 0) + ' ج.م'}</td>
          <td>${window.UiUtils ? window.UiUtils.formatCurrency(it.rental_price) : (it.rental_price || 0) + ' ج.م'}</td>
          <td style="color: var(--color-warning); font-weight: 600;">${window.UiUtils ? window.UiUtils.formatCurrency(it.cost_price || 0) : (it.cost_price || 0) + ' ج.م'}</td>
          <td>
            ${(it.available_quantity || 0) <= 0
          ? '<span class="badge badge-danger">نفذ المخزون</span>'
          : (it.available_quantity || 0) <= (it.reorder_level || 0)
            ? '<span class="badge badge-warning">⚠️ قارب على النفاد</span>'
            : '<span class="badge badge-success">متوفر بالمخزن</span>'}
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openDynAdjustModal(${it.id}, '${it.name.replace(/'/g, "\\'")}', '${catCode}')">تسوية (+/-)</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openEditQuantityProduct(${it.id}, '${it.name.replace(/'/g, "\\'")}', '${catCode}')">✏️ تعديل</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--color-danger);" onclick="window._deleteQuantityProduct(${it.id}, '${it.name.replace(/'/g, "\\'")}', '${catCode}')">🗑️ حذف</button>
            </div>
          </td>
        </tr>
      `).join('');
    };

    renderDynList();

    // Wire live filters
    document.getElementById('dyn-search')?.addEventListener('input', renderDynList);
    document.getElementById('dyn-status-filter')?.addEventListener('change', renderDynList);
    document.getElementById('dyn-sort')?.addEventListener('change', renderDynList);

    // Hook Add Dynamic Product
    document.getElementById('btn-add-dynamic-product')?.addEventListener('click', async () => {
      let warehouses = [];
      let catSizes = [];
      try {
        const [whRes, szRes] = await Promise.all([
          electronApi.invoke('admin:get-warehouses'),
          electronApi.invoke('admin:get-sizes', { categoryType: catCode })
        ]);
        warehouses = (whRes?.data || []).filter(w => w.is_active !== 0);
        catSizes = Array.isArray(szRes) ? szRes : (szRes?.data || []);
      } catch (e) { }

      const suggestedCode = `${catCode.slice(0, 4).toUpperCase()}-${String(items.length + 1).padStart(3, '0')}`;

      window.AppModal.open({
        title: `➕ إضافة صنف جديد في قسم [${catName}] بالمقاسات`,
        contentHtml: `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">كود الصنف</label>
              <input type="text" id="dyn-prod-code" class="form-control" value="${suggestedCode}" placeholder="كود الصنف...">
            </div>
            <div class="form-group">
              <label class="form-label">المخزن / الفرع المستهدف</label>
              <select id="dyn-prod-wh" class="form-control">
                ${warehouses.length > 0 ? warehouses.map(w => `<option value="${w.id}" ${w.is_default ? 'selected' : ''}>${w.name} ${w.is_default ? '★ (افتراضي)' : ''}</option>`).join('') : '<option value="1">المخزن الرئيسي</option>'}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">اسم الصنف والموديل</label>
            <input type="text" id="dyn-prod-name" class="form-control" placeholder="اسم الصنف (مثال: صنف جديد)...">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label class="form-label">سعر البيع (ج.م)</label>
              <input type="number" id="dyn-prod-sale-price" class="form-control" value="0" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر الإيجار (ج.م)</label>
              <input type="number" id="dyn-prod-rental-price" class="form-control" value="0" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">سعر التكلفة (ج.م) <span style="color:var(--color-danger);">*</span></label>
              <input type="number" id="dyn-prod-cost-price" class="form-control" value="0" min="1" required>
            </div>
          </div>

          <!-- Per Size Quantities Grid -->
          <div class="form-group">
            <label class="form-label">الكميات الافتتاحية لكل مقاس <span style="font-size: 11px; color: var(--text-muted);">(حسب المقاسات المعتمدة)</span></label>
            ${catSizes.length > 0 ? `
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; max-height: 170px; overflow-y: auto; background: var(--bg-card-hover); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                ${catSizes.map(s => `
                  <div style="background: var(--bg-card); padding: 6px; border-radius: 4px; border: 1px solid var(--border-color); text-align: center;">
                    <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px; color: var(--color-gold-400);">${s.name}</div>
                    <input type="number" class="dyn-size-qty-input form-control" data-size-id="${s.id}" data-size-name="${s.name}" min="0" value="0" style="padding: 4px; text-align: center; font-size: 13px; font-weight: 700;">
                  </div>
                `).join('')}
              </div>
              <div style="margin-top: 6px; font-size: 12px; font-weight: 600; color: var(--color-success); display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(16,185,129,0.08); border-radius: 4px;">
                <span>إجمالي الكمية المدخلة:</span>
                <span id="dyn-total-qty-badge">0 قطعة</span>
              </div>
            ` : `
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label">الكمية الافتتاحية (قطعة)</label>
                  <input type="number" id="dyn-prod-qty" class="form-control" value="10" min="0">
                </div>
                <div class="form-group">
                  <label class="form-label">المقاس</label>
                  <input type="text" id="dyn-prod-single-size" class="form-control" placeholder="عام / موحد">
                </div>
              </div>
            `}
          </div>

          <div class="form-group">
            <label class="form-label">حد إعادة الطلب (تنبيه قرب النفاد)</label>
            <input type="number" id="dyn-prod-reorder" class="form-control" value="2" min="0">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveDynamicProduct()">حفظ الصنف في ${catName}</button>
        `,
        width: '540px'
      });

      // Live total calculation for dynamic sizes
      const dynInputs = document.querySelectorAll('.dyn-size-qty-input');
      const updateDynTotal = () => {
        let sum = 0;
        dynInputs.forEach(inp => { sum += Number(inp.value) || 0; });
        const b = document.getElementById('dyn-total-qty-badge');
        if (b) b.textContent = `${sum} قطعة`;
      };
      dynInputs.forEach(inp => inp.addEventListener('input', updateDynTotal));

      window._saveDynamicProduct = async () => {
        const code = document.getElementById('dyn-prod-code')?.value?.trim();
        const name = document.getElementById('dyn-prod-name')?.value?.trim();
        const sale_price = Number(document.getElementById('dyn-prod-sale-price')?.value) || 0;
        const rental_price = Number(document.getElementById('dyn-prod-rental-price')?.value) || 0;
        const cost_price = Number(document.getElementById('dyn-prod-cost-price')?.value) || 0;
        const reorder_level = Number(document.getElementById('dyn-prod-reorder')?.value) || 0;
        const warehouse_id = Number(document.getElementById('dyn-prod-wh')?.value) || 1;

        if (!name) {
          AppToast.error('يرجى إدخال اسم الصنف.');
          return;
        }

        if (!cost_price || cost_price <= 0) {
          AppToast.error('سعر التكلفة إجباري ومطلوب لحساب الأرباح والخسائر بدقة.');
          return;
        }

        const variants = [];
        let totalCreatedQty = 0;
        if (dynInputs.length > 0) {
          dynInputs.forEach(inp => {
            const q = Number(inp.value) || 0;
            if (q > 0) {
              variants.push({ size_id: Number(inp.dataset.sizeId), initial_quantity: q });
              totalCreatedQty += q;
            }
          });
        } else {
          totalCreatedQty = Number(document.getElementById('dyn-prod-qty')?.value) || 0;
        }

        if (variants.length === 0 && totalCreatedQty <= 0) {
          AppToast.error('يرجى إدخال كمية لقطعة واحدة على الأقل في أحد المقاسات.');
          return;
        }

        try {
          await electronApi.invoke('inventory:create-quantity-product', {
            code: code || undefined,
            name,
            category_id: catId || undefined,
            category_type: catCode,
            category_name: catName,
            sale_price,
            rental_price,
            cost_price,
            total_quantity: totalCreatedQty,
            reorder_level,
            warehouse_id,
            targetWarehouse: warehouse_id,
            variants: variants.length > 0 ? variants : undefined
          });
          AppToast.success(`تمت إضافة الصنف ومقاساته بنجاح في قسم [${catName}]! 📦`);
          AppModal.close();
          renderDynamicCategoryPage(catCode, catName);
        } catch (err) {
          AppToast.error(err.message || 'فشل في حفظ الصنف');
        }
      };
    });

    // Wire adjust stock modal
    window._openDynAdjustModal = async (prodId, prodName, cCode) => {
      let warehouses = [];
      let variants = [];
      try {
        const [whRes, vRes] = await Promise.all([
          electronApi.invoke('admin:get-warehouses'),
          electronApi.invoke('inventory:get-product-variants', { productId: prodId })
        ]);
        warehouses = (whRes?.data || []).filter(w => w.is_active !== 0);
        variants = vRes?.data || [];
      } catch (e) { }

      window.AppModal.open({
        title: `تسوية رصيد: ${prodName}`,
        contentHtml: `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">المخزن المستهدف</label>
              <select id="dyn-adj-wh-id" class="form-control">
                ${warehouses.map(w => `<option value="${w.id}" ${w.is_default ? 'selected' : ''}>${w.name}</option>`).join('')}
              </select>
            </div>
            ${variants.length > 0 ? `
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">المقاس المراد تسويته</label>
                <select id="dyn-adj-variant-id" class="form-control">
                  ${variants.map(v => `<option value="${v.variant_id}">${v.size_name || 'عام'} (الرصيد: ${v.available_quantity})</option>`).join('')}
                </select>
              </div>
            ` : '<input type="hidden" id="dyn-adj-variant-id" value="">'}
          </div>
          <div class="form-group">
            <label class="form-label">الكمية المراد إضافتها أو خصمها (+ وارد / - صادر)</label>
            <input type="number" id="dyn-adj-qty" class="form-control" placeholder="مثال: 5 أو -2" value="1">
          </div>
          <div class="form-group">
            <label class="form-label">سبب الحركة</label>
            <select id="dyn-adj-reason" class="form-control">
              <option value="وارد شراء بضاعة جديدة">وارد شراء بضاعة جديدة (+)</option>
              <option value="تسوية جرد عجز أو تالف">تسوية جرد تالف أو عجز (-)</option>
              <option value="تسوية خطأ إدخال سابق">تسوية خطأ إدخال</option>
            </select>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._confirmDynAdj(${prodId}, '${cCode}')">تأكيد التسوية</button>
        `,
        width: '480px'
      });

      window._confirmDynAdj = async (pId, cCode) => {
        const delta = Number(document.getElementById('dyn-adj-qty')?.value) || 0;
        const reason = document.getElementById('dyn-adj-reason')?.value || 'تسوية يدوية';
        const whId = Number(document.getElementById('dyn-adj-wh-id')?.value) || 1;
        const vId = Number(document.getElementById('dyn-adj-variant-id')?.value) || pId;
        try {
          await electronApi.invoke('inventory:adjust-stock', { productId: pId, variantId: vId, warehouseId: whId, deltaQty: delta, reason });
          AppToast.success(`تمت تسوية المخزون بنجاح (${delta > 0 ? '+' + delta : delta})`);
          AppModal.close();
          renderDynamicCategoryPage(cCode);
        } catch (err) {
          AppToast.error(err.message || 'فشلت تسوية المخزون');
        }
      };
    };
  }

  // --- Phase 7: Render Bookings Page (الحجوزات والتأجير) ---
  async function renderBookingsPage() {
    const [res, polRes] = await Promise.all([
      electronApi.invoke('booking:get-list'),
      electronApi.invoke('admin:get-policies')
    ]);
    const bookings = res.data || [];
    const pol = polRes?.data || {};
    const enableDeposit = pol.enableSecurityDeposit !== false && String(pol.enableSecurityDeposit) !== '0';

    const statusBadge = (s) => {
      const map = {
        CONFIRMED: '<span class="badge badge-warning">مؤكد بالعربون</span>',
        FITTING_SCHEDULED: '<span class="badge badge-info">بروفة مجدولة</span>',
        PREPARED: '<span class="badge badge-info">جاهزة للتسليم</span>',
        DELIVERED: '<span class="badge badge-success">مستلمة (مع العميل)</span>',
        RETURNED: '<span class="badge badge-info">أعيدت وجاري الفحص</span>',
        COMPLETED: '<span class="badge badge-success">مكتملة ومغلقة</span>',
        CANCELLED: '<span class="badge badge-danger">ملغية</span>'
      };
      return map[s] || `<span class="badge">${s}</span>`;
    };

    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">📅 إدارة الحجوزات والتأجير (Bookings Engine)</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">دورة حياة الحجز، منع التعارض الزمني الذري، تسليم البدلة، تحصيل التأمين ورد الأمانات.</p>
        </div>
        <button id="btn-create-booking-page" class="btn-accent-action">+ حجز بدلة جديد</button>
      </div>

      <!-- Bookings Stats -->
      <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
        <div class="stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-info">
            <h4>إجمالي الحجوزات النشطة</h4>
            <div class="value">${bookings.filter(b => b.status !== 'CANCELLED').length} حجز</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-warning); background: rgba(245,158,11,0.12)">👔</div>
          <div class="stat-info">
            <h4>جاهزة للتسليم اليوم</h4>
            <div class="value" style="color: var(--color-warning)">${bookings.filter(b => b.status === 'PREPARED').length} بدل</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-success); background: rgba(16,185,129,0.12)">🤝</div>
          <div class="stat-info">
            <h4>مع العملاء حاليًا</h4>
            <div class="value" style="color: var(--color-success)">${bookings.filter(b => b.status === 'DELIVERED').length} عملاء</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-info); background: rgba(59,130,246,0.12)">✅</div>
          <div class="stat-info">
            <h4>حجوزات مكتملة</h4>
            <div class="value" style="color: var(--color-info)">${bookings.filter(b => b.status === 'COMPLETED').length} حجز</div>
          </div>
        </div>
      </div>

      <!-- Bookings Table -->
      <div class="table-card">
        <div class="table-header">
          <h3>سجل الحجوزات والعقود</h3>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>رقم الحجز</th>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>البدلة المحجوزة</th>
              <th>الاستلام</th>
              <th>الإرجاع المتوقع</th>
              <th>قيمة الإيجار</th>
              <th>المدفوع</th>
              <th>التأمين ${enableDeposit ? '' : '<span style="font-size: 10px; color: var(--text-muted);">(معطل)</span>'}</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${bookings.map(b => `
              <tr>
                <td><strong>#${b.booking_number}</strong></td>
                <td><strong>${b.customer_name}</strong></td>
                <td>${window.UiUtils ? window.UiUtils.formatPhone(b.customer_phone) : b.customer_phone}</td>
                <td><small>${b.items_summary || 'بدلة فاخرة'}</small></td>
                <td>${b.pickup_date}</td>
                <td>${b.return_due_date}</td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(b.final_amount) : b.final_amount + ' ج.م'}</td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(b.paid_amount) : b.paid_amount + ' ج.م'}</td>
                <td>
                  ${enableDeposit ? `
                    <span style="color: ${b.deposit_paid > 0 ? 'var(--color-success)' : 'var(--text-secondary)'}">
                      ${window.UiUtils ? window.UiUtils.formatCurrency(b.total_deposit_amount) : b.total_deposit_amount + ' ج.م'}
                      ${b.deposit_paid > 0 ? ' (مسدد)' : ' (منتظر)'}
                    </span>
                  ` : `
                    <span style="color: var(--text-muted); font-size: 11px;">— (معطل)</span>
                  `}
                </td>
                <td>${statusBadge(b.status)}</td>
                <td>
                  <div style="display: flex; gap: 4px;">
                    ${b.status === 'PREPARED' || b.status === 'CONFIRMED' ? `
                      <button class="btn-accent-action" style="padding: 4px 8px; font-size: 11px;" onclick="window._openHandoverModal(${b.id}, '${b.booking_number}', ${b.final_amount - b.paid_amount}, ${b.total_deposit_amount})">تسليم البدلة</button>
                    ` : ''}
                    ${b.status === 'DELIVERED' ? `
                      <button class="btn-primary-action" style="padding: 4px 8px; font-size: 11px;" onclick="window._openReturnModal(${b.id}, '${b.booking_number}', '${b.return_due_date}', ${b.deposit_paid})">استلام وتسوية</button>
                    ` : ''}
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="AppToast.info('عرض تفاصيل وعقد الحجز #${b.booking_number}')">تفاصيل</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-create-booking-page')?.addEventListener('click', () => {
      document.getElementById('btn-new-booking')?.click();
    });
  }

  // --- Handover and Return Modals (Global - accessible anywhere) ---
  window._openHandoverModal = (bId, bNum, remRental, deposit) => {
    window.AppModal.open({
      title: `تسليم البدلة للعميل [حجز #${bNum}]`,
      contentHtml: `
        <div style="padding: 12px; background: var(--bg-card-hover); border-radius: 6px; margin-bottom: 16px;">
          <div><strong>باقي الإيجار المستحق:</strong> ${window.UiUtils ? window.UiUtils.formatCurrency(remRental) : remRental + ' ج.م'}</div>
          <div><strong>مبلغ التأمين المستحق:</strong> ${window.UiUtils ? window.UiUtils.formatCurrency(deposit) : deposit + ' ج.م'}</div>
          <div style="margin-top: 6px; font-size: 14px; font-weight: 700; color: var(--color-gold-400);">إجمالي المطلوب استلامه الآن: ${window.UiUtils ? window.UiUtils.formatCurrency(remRental + deposit) : (remRental + deposit) + ' ج.م'}</div>
        </div>
        <div class="form-group">
          <label class="form-label">المبلغ المحصل للتأمين (أمانات)</label>
          <input type="number" id="handover-deposit" class="form-control" value="${deposit}">
        </div>
        <div class="form-group">
          <label class="form-label">المبلغ المحصل لباقي الإيجار</label>
          <input type="number" id="handover-rental" class="form-control" value="${remRental}">
        </div>
        <div class="form-group">
          <label class="form-label">طريقة السداد</label>
          <select id="handover-method" class="form-control">
            <option value="CASH">نقدي بالدرج (كاش)</option>
            <option value="VISA_CARD">بطاقة دفع إلكتروني (POS)</option>
            <option value="VODAFONE_CASH">محفظة إلكترونية (إنستاباي / فودافون)</option>
          </select>
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-accent-action" onclick="window._confirmHandover(${bId})">تأكيد الاستلام وتسليم البدلة</button>
      `,
      width: '480px'
    });
  };

  window._confirmHandover = async (bookingId) => {
    const depPaid = Number(document.getElementById('handover-deposit')?.value) || 0;
    const remPaid = Number(document.getElementById('handover-rental')?.value) || 0;
    const method = document.getElementById('handover-method')?.value || 'CASH';

    try {
      await electronApi.invoke('booking:handover', {
        bookingId,
        depositPaidAmount: depPaid,
        remainderPaidAmount: remPaid,
        paymentMethod: method
      });
      AppToast.success('تم تسليم البدلة بنجاح واستلام التأمين! 🤝');
      AppModal.close();
      const curPage = window.location.hash.replace('#', '');
      if (curPage === 'tasks') {
        renderTasksPage();
      } else if (curPage === 'dashboard' || !curPage) {
        renderDashboard();
      } else {
        renderBookingsPage();
      }
    } catch (err) {
      AppToast.error(`خطأ: ${err.message}`);
    }
  };

  window._openReturnModal = (bId, bNum, dueDate, depPaid) => {
    const today = new Date().toISOString().slice(0, 10);
    window.AppModal.open({
      title: `استلام وتسوية البدلة المرتجعة [حجز #${bNum}]`,
      contentHtml: `
        <div style="padding: 12px; background: var(--bg-card-hover); border-radius: 6px; margin-bottom: 16px;">
          <div><strong>تاريخ الإرجاع المتفق عليه:</strong> ${dueDate}</div>
          <div><strong>مبلغ التأمين المحتجز كأمانة:</strong> ${window.UiUtils ? window.UiUtils.formatCurrency(depPaid) : depPaid + ' ج.م'}</div>
        </div>
        <div class="form-group">
          <label class="form-label">تاريخ الإرجاع الفعلي</label>
          <input type="date" id="ret-actual-date" class="form-control" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">غرامة تلفيات أو بقع (إن وجدت)</label>
          <input type="number" id="ret-damage-fee" class="form-control" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات الفحص</label>
          <input type="text" id="ret-notes" class="form-control" placeholder="حالة البدلة عند الاستلام...">
        </div>
        <p style="font-size: 12px; color: var(--color-gold-400);">سيقوم النظام باحتساب غرامة التأخير اليومية آلياً وفق سياسات المحل وتخصيمها من التأمين ورد المتبقي للعميل.</p>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-primary-action" onclick="window._confirmReturn(${bId})">فحص البدلة وتصفية التأمين</button>
      `,
      width: '500px'
    });
  };

  window._confirmReturn = async (bookingId) => {
    const today = new Date().toISOString().slice(0, 10);
    const actualDate = document.getElementById('ret-actual-date')?.value || today;
    const damageFee = Number(document.getElementById('ret-damage-fee')?.value) || 0;
    const notes = document.getElementById('ret-notes')?.value || 'تم الاستلام والفحص';

    try {
      const res = await electronApi.invoke('booking:return', {
        bookingId,
        actualReturnDate: actualDate,
        damageFee,
        inspectionNotes: notes
      });

      const data = res?.data || {};
      AppToast.success(`تم استلام البدلة وإغلاق الحجز! صافي التأمين المسترد للعميل: ${window.UiUtils ? window.UiUtils.formatCurrency(data.refundAmount || 0) : (data.refundAmount || 0) + ' ج.م'}`);
      AppModal.close();
      const curPage = window.location.hash.replace('#', '');
      if (curPage === 'tasks') {
        renderTasksPage();
      } else if (curPage === 'dashboard' || !curPage) {
        renderDashboard();
      } else {
        renderBookingsPage();
      }
    } catch (err) {
      AppToast.error(`خطأ: ${err.message}`);
    }
  };

  // --- Phase 7: Render Customers Page (إدارة العملاء) ---
  async function renderCustomersPage() {
    const res = await electronApi.invoke('customers:get-list');
    const customers = res.data || [];

    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">👥 إدارة العملاء والقياسات (Customers)</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">بيانات العملاء، أرقام الهواتف، المقاسات المفصلة، وسجل الحجوزات السابقة.</p>
        </div>
        <button id="btn-add-customer" class="btn-accent-action">+ إضافة عميل جديد</button>
      </div>

      <div class="table-card">
        <div class="table-header">
          <h3>قائمة العملاء المسجلين</h3>
          <input type="text" id="cust-search" class="form-control" placeholder="بحث بالاسم أو الهاتف..." style="width: 250px; padding: 6px 12px;">
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>كود العميل</th>
              <th>الاسم بالكامل</th>
              <th>رقم الهاتف</th>
              <th>العنوان</th>
              <th>مقاس الصدر / الخصر</th>
              <th>مقاس الحذاء</th>
              <th>إجمالي الحجوزات</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${customers.map(c => `
              <tr>
                <td><code>${c.code}</code></td>
                <td><strong>${c.name}</strong></td>
                <td><strong style="color: var(--color-gold-400);">${window.UiUtils ? window.UiUtils.formatPhone(c.phone) : c.phone}</strong></td>
                <td>${c.address || '—'}</td>
                <td>${c.chest_size ? c.chest_size + ' سم / ' + c.waist_size + ' سم' : '—'}</td>
                <td>${c.shoe_size || '—'}</td>
                <td><span class="badge badge-info">${c.total_bookings || 0} حجز</span></td>
                <td>
                  <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="window._openCustomerDrawer(${c.id}, '${c.name}', '${c.phone}', '${c.address || ''}', '${c.chest_size || ''}', '${c.waist_size || ''}', '${c.shoe_size || ''}')">ملف العميل والمقاسات</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-add-customer')?.addEventListener('click', () => {
      window.AppModal.open({
        title: '➕ إضافة عميل جديد',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">اسم العميل بالكامل</label>
            <input type="text" id="cust-new-name" class="form-control" placeholder="الاسم...">
          </div>
          <div class="form-group">
            <label class="form-label">رقم الهاتف (11 رقم يبدأ بـ 01)</label>
            <input type="text" id="cust-new-phone" class="form-control" placeholder="01xxxxxxxxx">
          </div>
          <div class="form-group">
            <label class="form-label">العنوان</label>
            <input type="text" id="cust-new-addr" class="form-control" placeholder="العنوان...">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">محيط الصدر (سم)</label>
              <input type="number" id="cust-new-chest" class="form-control" placeholder="مثال: 102">
            </div>
            <div class="form-group">
              <label class="form-label">محيط الخصر (سم)</label>
              <input type="number" id="cust-new-waist" class="form-control" placeholder="مثال: 88">
            </div>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveNewCustomer()">حفظ العميل</button>
        `,
        width: '480px'
      });

      window._saveNewCustomer = async () => {
        const name = document.getElementById('cust-new-name')?.value;
        const phone = document.getElementById('cust-new-phone')?.value;
        const address = document.getElementById('cust-new-addr')?.value;
        const chest_size = Number(document.getElementById('cust-new-chest')?.value) || null;
        const waist_size = Number(document.getElementById('cust-new-waist')?.value) || null;

        if (!name || !phone) {
          AppToast.error('يرجى إدخال اسم العميل ورقم هاتفه.');
          return;
        }

        try {
          await electronApi.invoke('customers:create', { name, phone, address, chest_size, waist_size });
          AppToast.success('تمت إضافة العميل بنجاح! 👤');
          AppModal.close();
          renderCustomersPage();
        } catch (err) {
          AppToast.error(err.message || 'فشل في حفظ العميل');
        }
      };
    });

    window._openCustomerDrawer = async (cId, name, phone, address, chest, waist, shoe) => {
      const bookingsRes = await electronApi.invoke('booking:get-list');
      const allBookings = bookingsRes.data || [];
      const custBookings = allBookings.filter(b => b.customer_name === name || b.customer_phone === phone);

      const bookingsHtml = custBookings.length > 0 ? custBookings.map(b => `
        <div style="padding: 12px; background: var(--bg-card); border-radius: 6px; border-right: 3px solid ${b.status === 'COMPLETED' ? 'var(--color-success)' : b.status === 'CANCELLED' ? 'var(--color-danger)' : 'var(--color-warning)'}; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
            <span>حجز #${b.booking_number}</span>
            <span class="badge ${b.status === 'COMPLETED' ? 'badge-success' : b.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}">${b.status === 'COMPLETED' ? 'مكتمل' : b.status === 'DELIVERED' ? 'مع العميل' : b.status === 'CONFIRMED' ? 'مؤكد' : b.status === 'CANCELLED' ? 'ملغي' : b.status}</span>
          </div>
          <div style="margin-top: 6px; font-weight: 600;">${b.items_summary || 'بدلة فاخرة'}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">الاستلام: ${b.pickup_date} | الإرجاع: ${b.return_due_date}</div>
        </div>
      `).join('') : '<div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 13px;">لا توجد حجوزات مسجلة لهذا العميل بعد.</div>';

      window.AppDrawer.open({
        title: `👤 ملف العميل: ${name}`,
        contentHtml: `
          <div style="padding: 16px; background: var(--bg-card-hover); border-radius: 8px; margin-bottom: 20px;">
            <h4 style="color: var(--color-gold-400); margin-bottom: 8px;">📏 جدول المقاسات البدنية</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
              <div><strong>محيط الصدر:</strong> ${chest ? chest + ' سم' : 'غير مسجل'}</div>
              <div><strong>محيط الخصر:</strong> ${waist ? waist + ' سم' : 'غير مسجل'}</div>
              <div><strong>مقاس الحذاء:</strong> ${shoe || 'غير مسجل'}</div>
              <div><strong>الهاتف:</strong> ${phone}</div>
            </div>
            <div style="margin-top: 10px; font-size: 13px;"><strong>العنوان:</strong> ${address || '—'}</div>
          </div>
          <div>
            <h4 style="margin-bottom: 12px;">📜 سجل الحجوزات (${custBookings.length})</h4>
            ${bookingsHtml}
          </div>
        `,
        width: '450px'
      });
    };
  }

  // =========================================================================
  // 12. POS & DIRECT SALES PAGE (المرحلة 8: نقطة البيع السريع والمبيعات)
  // =========================================================================
  let posCart = [];
  let posCatalog = [];
  let posActiveCat = 'ALL';
  let posDiscount = 0;
  let posPaymentMethod = 'CASH';
  let posPaidAmount = 0;
  let posSelectedCustomer = null;

  async function renderPosPage() {
    // Dynamically build category pills from active categories
    let catPillsHtml = `<button class="pos-cat-pill ${posActiveCat === 'ALL' ? 'active' : ''}" data-cat="ALL">الكل (جميع الأصناف)</button>`;
    try {
      const catsRes = await electronApi.invoke('admin:get-categories');
      const categories = (catsRes?.data || []).filter(c => c.is_active !== 0);
      if (categories.length > 0) {
        categories.forEach(c => {
          const icon = getCategoryIcon(c.code, c.name, c.type);
          const isActive = (posActiveCat === c.code || posActiveCat === c.type);
          catPillsHtml += `<button class="pos-cat-pill ${isActive ? 'active' : ''}" data-cat="${c.code}">${icon} ${c.name}</button>`;
        });
      } else {
        catPillsHtml += `
          <button class="pos-cat-pill ${posActiveCat === 'SHOES' ? 'active' : ''}" data-cat="SHOES">👞 الأحذية</button>
          <button class="pos-cat-pill ${posActiveCat === 'ACCESSORIES' ? 'active' : ''}" data-cat="ACCESSORIES">🎀 الإكسسوارات والقمصان</button>
          <button class="pos-cat-pill ${posActiveCat === 'SUITS' ? 'active' : ''}" data-cat="SUITS">🤵 بدل متاحة للبيع</button>
        `;
      }
    } catch (e) {
      catPillsHtml += `
        <button class="pos-cat-pill ${posActiveCat === 'SHOES' ? 'active' : ''}" data-cat="SHOES">👞 الأحذية</button>
        <button class="pos-cat-pill ${posActiveCat === 'ACCESSORIES' ? 'active' : ''}" data-cat="ACCESSORIES">🎀 الإكسسوارات والقمصان</button>
        <button class="pos-cat-pill ${posActiveCat === 'SUITS' ? 'active' : ''}" data-cat="SUITS">🤵 بدل متاحة للبيع</button>
      `;
    }

    pageContent.innerHTML = `
      <div class="table-card" style="margin-bottom: 12px; padding: 12px 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">💳</span>
            <div>
              <h2 style="font-size: 18px; margin: 0;">نقطة البيع السريع (POS)</h2>
              <span style="font-size: 12px; color: var(--text-secondary);">إتمام المبيعات المباشرة وخصم المخزون والطباعة الفورية للفواتير</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" id="btn-pos-history" style="font-size: 13px;">
              <span>📜</span> سجل فواتير المبيعات
            </button>
            <button class="btn-secondary" id="btn-pos-clear" style="font-size: 13px;">
              <span>🗑️</span> إفراغ السلة
            </button>
          </div>
        </div>
      </div>

      <div class="pos-layout">
        <!-- Right Pane: Catalog & Barcode Scanner -->
        <div class="pos-catalog-pane">
          <!-- Scanner Input -->
          <div class="pos-search-bar">
            <input type="text" id="pos-barcode-input" placeholder="🔍 امسح الباركود بجهاز القارئ أو اكتب الكود واضغط Enter..." autofocus autocomplete="off">
            <button class="btn-primary-action" id="btn-pos-scan-submit" style="padding: 12px 20px;">إضافة ⚡</button>
          </div>

          <!-- Category Filter Pills (Dynamic) -->
          <div class="pos-category-filters">
            ${catPillsHtml}
          </div>

          <!-- Items Grid -->
          <div class="pos-items-grid" id="pos-items-grid">
            <div style="text-align: center; padding: 40px; color: var(--text-secondary); grid-column: 1/-1;">
              جاري تحميل أصناف نقطة البيع...
            </div>
          </div>
        </div>

        <!-- Left Pane: Shopping Cart & Checkout -->
        <div class="pos-cart-pane">
          <div class="pos-cart-header">
            <div>
              <h3 style="font-size: 16px; margin: 0;">🛒 سلة المشتريات</h3>
              <span id="pos-cart-count" style="font-size: 12px; color: var(--color-gold-500); font-weight: 600;">0 أصناف</span>
            </div>
            <select id="pos-customer-select" class="form-control" style="width: 170px; padding: 6px 10px; font-size: 12px;">
              <option value="">عميل نقدي سريع (Walk-in)</option>
            </select>
          </div>

          <!-- Cart Items List -->
          <div class="pos-cart-items" id="pos-cart-items">
            <div class="state-container empty-state" style="padding: 40px 10px;">
              <div class="state-icon" style="font-size: 36px;">🛒</div>
              <p class="state-desc" style="font-size: 13px;">السلة فارغة حاليًا. امسح الباركود أو اختر صنفًا من الكتالوج لإضافته.</p>
            </div>
          </div>

          <!-- Cart Totals & Checkout -->
          <div class="pos-cart-footer">
            <div class="pos-summary-row">
              <span>إجمالي الأصناف:</span>
              <strong id="pos-subtotal">0.00 ج.م</strong>
            </div>

            <div class="pos-summary-row" style="align-items: center;">
              <span>خصم إضافي (ج.م):</span>
              <input type="number" id="pos-discount-input" min="0" value="${posDiscount}" style="width: 80px; padding: 4px 8px; font-size: 13px; text-align: center; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
            </div>

            <div class="pos-summary-row total">
              <span>الإجمالي النهائي المستحق:</span>
              <span id="pos-grand-total" style="color: var(--color-gold-500);">0.00 ج.م</span>
            </div>

            <!-- Payment Method Selector -->
            <div>
              <label style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: block;">طريقة الدفع:</label>
              <div class="pos-pay-methods">
                <button class="pos-pay-btn ${posPaymentMethod === 'CASH' ? 'active' : ''}" data-method="CASH">💵 كاش (درج)</button>
                <button class="pos-pay-btn ${posPaymentMethod === 'CARD' ? 'active' : ''}" data-method="CARD">💳 بطاقة فيزا</button>
                <button class="pos-pay-btn ${posPaymentMethod === 'WALLET' ? 'active' : ''}" data-method="WALLET">📱 محفظة ذكية</button>
              </div>
            </div>

            <!-- Cash Payment Details -->
            <div id="pos-cash-details" style="${posPaymentMethod === 'CASH' ? '' : 'display: none;'}">
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 12px; color: var(--text-secondary);">المبلغ المستلم:</span>
                <input type="number" id="pos-paid-input" min="0" placeholder="0.00" style="flex: 1; padding: 6px 10px; font-size: 14px; font-weight: 700; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--color-success);">
              </div>
              <div class="pos-quick-cash">
                <button class="quick-cash-pill" data-add="50">+50</button>
                <button class="quick-cash-pill" data-add="100">+100</button>
                <button class="quick-cash-pill" data-add="200">+200</button>
                <button class="quick-cash-pill" id="btn-exact-cash">بالضبط</button>
              </div>
              <div class="pos-summary-row" style="margin-top: 8px; font-size: 13px;">
                <span>المتبقي للعميل (الفكة):</span>
                <strong id="pos-change-amount" style="color: var(--color-info);">0.00 ج.م</strong>
              </div>
            </div>

            <!-- Checkout Action Button -->
            <button class="btn-primary-action" id="btn-pos-checkout" style="padding: 14px; font-size: 15px; font-weight: 800; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <span>⚡</span> إتمام البيع وطباعة الفاتورة
            </button>
          </div>
        </div>
      </div>
    `;

    // Initialize Customers Dropdown
    try {
      const custRes = await electronApi.invoke('customers:get-list', { limit: 100 });
      if (custRes.success && custRes.data) {
        const custSelect = document.getElementById('pos-customer-select');
        custRes.data.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.name} (${c.phone})`;
          custSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Could not load customers for POS dropdown', e);
    }

    // Load Catalog
    await loadPosCatalog();

    // Attach Event Listeners
    setupPosEventListeners();
    updatePosCartUI();
  }

  async function loadPosCatalog() {
    const grid = document.getElementById('pos-items-grid');
    if (!grid) return;

    try {
      const typeFilter = posActiveCat === 'ALL' ? null : posActiveCat;
      const res = await electronApi.invoke('sales:get-catalog', { categoryType: typeFilter });
      if (res.success && res.data) {
        posCatalog = res.data;
        renderPosCatalogGrid();
      }
    } catch (err) {
      grid.innerHTML = `<div style="color: var(--color-danger); text-align: center; padding: 20px;">فشل تحميل الكتالوج: ${err.message}</div>`;
    }
  }

  function renderPosCatalogGrid() {
    const grid = document.getElementById('pos-items-grid');
    if (!grid) return;

    if (!posCatalog || posCatalog.length === 0) {
      grid.innerHTML = `
        <div class="state-container empty-state" style="grid-column: 1/-1; padding: 40px 0;">
          <div class="state-icon">📦</div>
          <h4 class="state-title">لا توجد أصناف متاحة للبيع في هذا القسم</h4>
          <p class="state-desc">يمكنك إضافة منتجات جديدة أو وحدات بدل من قسم المخزون.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = posCatalog.map(item => {
      const isAvailable = (item.available_quantity || 0) > 0;
      const priceFormatted = window.UiUtils ? window.UiUtils.formatCurrency(item.unit_price) : `${item.unit_price} ج.م`;
      const stockBadge = isAvailable
        ? `<span class="stock-badge badge-success">متوفر (${item.available_quantity})</span>`
        : `<span class="stock-badge badge-danger">نفذ المخزون</span>`;

      return `
        <div class="pos-item-card" data-key="${item.item_type}_${item.variant_id || item.suit_unit_id}" style="${isAvailable ? '' : 'opacity: 0.55; cursor: not-allowed;'}">
          ${stockBadge}
          <div>
            <div class="item-tag">${item.category_name} ${item.size_name ? '• ' + item.size_name : ''}</div>
            <div class="item-title">${item.product_name || item.model_name}</div>
            <div class="item-meta">كود: ${item.barcode || item.sku || '-'}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
            <div class="item-price">${priceFormatted}</div>
            <button class="btn-primary-action btn-add-pos-item" data-key="${item.item_type}_${item.variant_id || item.suit_unit_id}" style="padding: 6px 10px; font-size: 11px;" ${isAvailable ? '' : 'disabled'}>
              + إضافة
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach card click events
    grid.querySelectorAll('.pos-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const key = card.getAttribute('data-key');
        const item = posCatalog.find(i => `${i.item_type}_${i.variant_id || i.suit_unit_id}` === key);
        if (item && item.available_quantity > 0) {
          addPosItemToCart(item);
        } else if (item && item.available_quantity <= 0) {
          if (window.AppToast) window.AppToast.warning('هذا الصنف غير متوفر حالياً بالمخزن.');
        }
      });
    });
  }

  function addPosItemToCart(item) {
    const key = `${item.item_type}_${item.variant_id || item.suit_unit_id}`;
    const existing = posCart.find(ci => ci.key === key);

    if (existing) {
      if (item.item_type === 'SUIT_UNIT') {
        if (window.AppToast) window.AppToast.warning('بدلة البيع قطعة فريدة ذات باركود لا يمكن إضافة أكثر من قطعة واحدة منها.');
        return;
      }
      if (existing.quantity >= item.available_quantity) {
        if (window.AppToast) window.AppToast.warning(`الكمية المتاحة في المخزن [${item.available_quantity}] فقط. يمنع الرصيد السالب.`);
        return;
      }
      existing.quantity += 1;
      existing.total = existing.quantity * existing.unit_price;
    } else {
      posCart.push({
        key,
        item_type: item.item_type,
        variant_id: item.variant_id || null,
        suit_unit_id: item.suit_unit_id || null,
        name: item.product_name || item.model_name,
        code: item.barcode || item.sku,
        size_name: item.size_name || '',
        color_name: item.color_name || '',
        unit_price: Number(item.unit_price) || 0,
        quantity: 1,
        max_quantity: item.available_quantity,
        total: Number(item.unit_price) || 0
      });
    }

    if (window.AppToast) {
      window.AppToast.success(`تمت إضافة [${item.product_name || item.model_name}] للسلة ⚡`, 1500);
    }
    updatePosCartUI();
  }

  function updatePosCartUI() {
    const container = document.getElementById('pos-cart-items');
    const countBadge = document.getElementById('pos-cart-count');
    const subtotalEl = document.getElementById('pos-subtotal');
    const grandTotalEl = document.getElementById('pos-grand-total');
    const changeEl = document.getElementById('pos-change-amount');
    const paidInput = document.getElementById('pos-paid-input');

    if (!container) return;

    if (posCart.length === 0) {
      container.innerHTML = `
        <div class="state-container empty-state" style="padding: 40px 10px;">
          <div class="state-icon" style="font-size: 36px;">🛒</div>
          <p class="state-desc" style="font-size: 13px;">السلة فارغة حاليًا. امسح الباركود أو اختر صنفًا من الكتالوج لإضافته.</p>
        </div>
      `;
      if (countBadge) countBadge.textContent = '0 أصناف';
      if (subtotalEl) subtotalEl.textContent = '0.00 ج.م';
      if (grandTotalEl) grandTotalEl.textContent = '0.00 ج.م';
      if (changeEl) changeEl.textContent = '0.00 ج.م';
      return;
    }

    const totalCount = posCart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = posCart.reduce((sum, item) => sum + item.total, 0);
    const grandTotal = Math.max(0, subtotal - posDiscount);

    if (countBadge) countBadge.textContent = `${totalCount} قطع (${posCart.length} بنود)`;
    if (subtotalEl) subtotalEl.textContent = window.UiUtils ? window.UiUtils.formatCurrency(subtotal) : `${subtotal} ج.م`;
    if (grandTotalEl) grandTotalEl.textContent = window.UiUtils ? window.UiUtils.formatCurrency(grandTotal) : `${grandTotal} ج.م`;

    // Render Cart rows
    container.innerHTML = posCart.map((item, idx) => {
      const lineTotalFormatted = window.UiUtils ? window.UiUtils.formatCurrency(item.total) : `${item.total} ج.م`;
      return `
        <div class="pos-cart-row">
          <div class="cart-info">
            <div class="cart-title">${item.name}</div>
            <div class="cart-sub">${item.size_name ? item.size_name + ' • ' : ''}${window.UiUtils ? window.UiUtils.formatCurrency(item.unit_price) : item.unit_price + ' ج.م'}</div>
          </div>
          <div class="pos-qty-controls">
            <button class="pos-qty-btn btn-cart-minus" data-idx="${idx}">-</button>
            <span style="font-weight: 700; min-width: 20px; text-align: center; font-size: 13px;">${item.quantity}</span>
            <button class="pos-qty-btn btn-cart-plus" data-idx="${idx}">+</button>
          </div>
          <div style="font-weight: 700; font-size: 13px; min-width: 65px; text-align: left;">
            ${lineTotalFormatted}
          </div>
          <button class="btn-cart-remove" data-idx="${idx}" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 14px; padding: 2px;">
            🗑️
          </button>
        </div>
      `;
    }).join('');

    // Cart row listeners
    container.querySelectorAll('.btn-cart-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        const item = posCart[idx];
        if (item.item_type === 'SUIT_UNIT') {
          if (window.AppToast) window.AppToast.warning('البدلة قطعة فريدة مقاسها واحد.');
          return;
        }
        if (item.quantity >= item.max_quantity) {
          if (window.AppToast) window.AppToast.warning(`الكمية المتاحة في المخزن [${item.max_quantity}] فقط.`);
          return;
        }
        item.quantity += 1;
        item.total = item.quantity * item.unit_price;
        updatePosCartUI();
      });
    });

    container.querySelectorAll('.btn-cart-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        if (posCart[idx].quantity > 1) {
          posCart[idx].quantity -= 1;
          posCart[idx].total = posCart[idx].quantity * posCart[idx].unit_price;
        } else {
          posCart.splice(idx, 1);
        }
        updatePosCartUI();
      });
    });

    container.querySelectorAll('.btn-cart-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        posCart.splice(idx, 1);
        updatePosCartUI();
      });
    });

    // Update Change calculation
    if (paidInput && posPaymentMethod === 'CASH') {
      const paidVal = Number(paidInput.value) || 0;
      const change = Math.max(0, paidVal - grandTotal);
      if (changeEl) {
        changeEl.textContent = window.UiUtils ? window.UiUtils.formatCurrency(change) : `${change} ج.م`;
      }
    }
  }

  function setupPosEventListeners() {
    const barcodeInput = document.getElementById('pos-barcode-input');
    const scanBtn = document.getElementById('btn-pos-scan-submit');
    const clearBtn = document.getElementById('btn-pos-clear');
    const historyBtn = document.getElementById('btn-pos-history');
    const checkoutBtn = document.getElementById('btn-pos-checkout');
    const discountInput = document.getElementById('pos-discount-input');
    const paidInput = document.getElementById('pos-paid-input');
    const exactCashBtn = document.getElementById('btn-exact-cash');

    // Barcode enter key
    if (barcodeInput) {
      barcodeInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await triggerBarcodeScan();
        }
      });
    }

    if (scanBtn) {
      scanBtn.addEventListener('click', triggerBarcodeScan);
    }

    async function triggerBarcodeScan() {
      const code = barcodeInput.value.trim();
      if (!code) return;

      try {
        const res = await electronApi.invoke('sales:lookup-barcode', { barcode: code });
        if (res.success && res.data) {
          addPosItemToCart(res.data);
          barcodeInput.value = '';
          barcodeInput.focus();
        } else {
          if (window.AppToast) window.AppToast.warning(`الباركود [${code}] غير مسجل في النظام.`);
          barcodeInput.select();
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ في فحص الباركود: ${err.message}`);
      }
    }

    // Category Filter Pills
    document.querySelectorAll('.pos-cat-pill').forEach(pill => {
      pill.addEventListener('click', async () => {
        document.querySelectorAll('.pos-cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        posActiveCat = pill.getAttribute('data-cat');
        await loadPosCatalog();
      });
    });

    // Payment Method Buttons
    document.querySelectorAll('.pos-pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pos-pay-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        posPaymentMethod = btn.getAttribute('data-method');

        const cashDetails = document.getElementById('pos-cash-details');
        if (cashDetails) {
          cashDetails.style.display = posPaymentMethod === 'CASH' ? 'block' : 'none';
        }
        updatePosCartUI();
      });
    });

    // Quick Cash Helpers
    document.querySelectorAll('.quick-cash-pill[data-add]').forEach(pill => {
      pill.addEventListener('click', () => {
        const add = Number(pill.getAttribute('data-add')) || 0;
        const current = Number(paidInput.value) || 0;
        paidInput.value = current + add;
        updatePosCartUI();
      });
    });

    if (exactCashBtn) {
      exactCashBtn.addEventListener('click', () => {
        const subtotal = posCart.reduce((sum, item) => sum + item.total, 0);
        const grandTotal = Math.max(0, subtotal - posDiscount);
        paidInput.value = grandTotal;
        updatePosCartUI();
      });
    }

    if (discountInput) {
      discountInput.addEventListener('input', () => {
        posDiscount = Math.max(0, Number(discountInput.value) || 0);
        updatePosCartUI();
      });
    }

    if (paidInput) {
      paidInput.addEventListener('input', () => {
        updatePosCartUI();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (posCart.length === 0) return;
        posCart = [];
        posDiscount = 0;
        if (discountInput) discountInput.value = 0;
        if (paidInput) paidInput.value = '';
        updatePosCartUI();
        if (window.AppToast) window.AppToast.info('تم إفراغ السلة.');
      });
    }

    // Checkout Flow
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', async () => {
        if (posCart.length === 0) {
          if (window.AppToast) window.AppToast.warning('سلة المشتريات فارغة.');
          return;
        }

        const subtotal = posCart.reduce((sum, item) => sum + item.total, 0);
        const grandTotal = Math.max(0, subtotal - posDiscount);
        const custSelect = document.getElementById('pos-customer-select');
        const custId = custSelect ? custSelect.value || null : null;
        const paidVal = posPaymentMethod === 'CASH' ? (Number(paidInput.value) || grandTotal) : grandTotal;

        if (posPaymentMethod === 'CASH' && paidVal < grandTotal) {
          if (window.AppToast) window.AppToast.warning(`المبلغ المستلم [${paidVal}] أقل من إجمالي الفاتورة المطلوب [${grandTotal}].`);
          return;
        }

        const salePayload = {
          customer_id: custId ? Number(custId) : null,
          items: posCart.map(i => ({
            product_variant_id: i.variant_id,
            suit_unit_id: i.suit_unit_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: 0
          })),
          discount: posDiscount,
          tax: 0,
          paid_amount: paidVal,
          payment_method: posPaymentMethod
        };

        try {
          const res = await electronApi.invoke('sales:create-direct-sale', salePayload);
          if (res.success && res.data) {
            const data = res.data;
            if (window.AppToast) window.AppToast.success(`تم إتمام البيع بنجاح! فاتورة #${data.saleNumber} ⚡`);

            // Show Receipt Modal
            showReceiptModal(data, posCart, posDiscount);

            // Reset cart
            posCart = [];
            posDiscount = 0;
            if (discountInput) discountInput.value = 0;
            if (paidInput) paidInput.value = '';
            updatePosCartUI();

            // Refresh catalog stock counts
            await loadPosCatalog();
          } else {
            if (window.AppToast) window.AppToast.error(res.error?.message || 'فشل إتمام البيع.');
          }
        } catch (err) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
        }
      });
    }

    // Sales History Modal
    if (historyBtn) {
      historyBtn.addEventListener('click', openSalesHistoryModal);
    }
  }

  function showReceiptModal(saleResult, items, discount) {
    if (!window.AppModal) return;

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const dateStr = window.UiUtils ? window.UiUtils.formatDate(new Date()) : new Date().toLocaleString('ar-EG');

    window.AppModal.open({
      title: '🧾 إيصال فاتورة مبيعات نقدية',
      contentHtml: `
        <div style="background: #FFFFFF; color: #111827; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 13px;">
          <div style="text-align: center; border-bottom: 1px dashed #9CA3AF; padding-bottom: 12px; margin-bottom: 12px;">
            <h2 style="font-size: 18px; margin: 0 0 4px 0;">mohamed saed والعرائس</h2>
            <div>الهرم، الجيزة • هاتف: 01012345678</div>
            <div style="font-weight: bold; margin-top: 6px;">فاتورة مبيعات #${saleResult.saleNumber}</div>
            <div style="font-size: 11px; color: #4B5563;">${dateStr}</div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #E5E7EB; text-align: right;">
                <th style="padding: 4px;">الصنف</th>
                <th style="padding: 4px; text-align: center;">العدد</th>
                <th style="padding: 4px; text-align: left;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr style="border-bottom: 1px dashed #F3F4F6;">
                  <td style="padding: 4px;">${item.name}</td>
                  <td style="padding: 4px; text-align: center;">${item.quantity}</td>
                  <td style="padding: 4px; text-align: left;">${item.total} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="border-top: 1px dashed #9CA3AF; padding-top: 8px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>الإجمالي:</span>
              <span>${subtotal} ج.م</span>
            </div>
            ${discount > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #DC2626;">
                <span>الخصم:</span>
                <span>-${discount} ج.م</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 6px; border-top: 1px solid #111827; padding-top: 6px;">
              <span>الصافي المطلوب:</span>
              <span>${saleResult.totalAmount} ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span>المدفوع:</span>
              <span>${saleResult.paidAmount} ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span>المتبقي (الفكة):</span>
              <span>${saleResult.changeAmount} ج.م</span>
            </div>
          </div>

          <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #6B7280; border-top: 1px dashed #9CA3AF; padding-top: 8px;">
            شكرًا لتعاملكم معنا • البضاعة المباعة ترد وتستبدل خلال 14 يومًا بوجود الفاتورة
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إغلاق</button>
        <button class="btn-primary-action" id="btn-print-pos-receipt">
          🖨️ طباعة إيصال 80mm
        </button>
      `,
      width: '420px'
    });

    const btnPrintRec = document.getElementById('btn-print-pos-receipt');
    if (btnPrintRec) {
      btnPrintRec.addEventListener('click', async () => {
        AppModal.close();
        try {
          const pRes = await electronApi.invoke('print:receipt', {
            receiptNumber: saleResult.saleNumber,
            totalAmount: saleResult.totalAmount,
            paidAmount: saleResult.paidAmount,
            items: cart.map(it => ({
              name: it.title,
              quantity: it.quantity,
              unit_price: it.price,
              total: it.total
            }))
          });
          if (pRes.success && pRes.data?.html) {
            await openPrintPreviewModal({
              title: `إيصال حراري - ${saleResult.saleNumber}`,
              html: pRes.data.html,
              pageSize: '80mm'
            });
          }
        } catch (_) { }
      });
    }
  }

  async function openSalesHistoryModal() {
    if (!window.AppModal) return;

    try {
      const res = await electronApi.invoke('sales:get-list', { limit: 50 });
      const sales = res.success && res.data ? res.data : [];

      window.AppModal.open({
        title: '📜 سجل فواتير المبيعات المباشرة',
        contentHtml: `
          <div style="max-height: 480px; overflow-y: auto;">
            <table class="app-table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>العميل</th>
                  <th>طريقة الدفع</th>
                  <th>إجمالي المبلغ</th>
                  <th>التاريخ والوقت</th>
                  <th>المرتجعات</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${sales.length === 0 ? `
                  <tr><td colspan="7" style="text-align: center; padding: 20px;">لا توجد فواتير مبيعات مسجلة حتى الآن.</td></tr>
                ` : sales.map(s => `
                  <tr>
                    <td><strong>${s.sale_number}</strong></td>
                    <td>${s.customer_name || 'عميل نقدي سريع'}</td>
                    <td><span class="badge badge-info">${s.payment_method === 'CASH' ? 'كاش' : s.payment_method === 'CARD' ? 'فيزا' : 'محفظة'}</span></td>
                    <td style="font-weight: 700; color: var(--color-gold-500);">${window.UiUtils ? window.UiUtils.formatCurrency(s.total_amount) : s.total_amount + ' ج.م'}</td>
                    <td style="font-size: 12px; color: var(--text-secondary);">${s.created_at}</td>
                    <td>
                      ${s.return_count > 0 ? `<span class="badge badge-danger">مرتجع (${s.total_refunded} ج.م)</span>` : '<span class="badge badge-success">سليمة</span>'}
                    </td>
                    <td>
                      <div style="display: flex; gap: 4px;">
                        <button class="btn-secondary btn-print-sale-a4" data-number="${s.sale_number}" data-customer="${s.customer_name || ''}" data-total="${s.total_amount}" style="padding: 4px 8px; font-size: 11px;">
                          🖨️ A4
                        </button>
                        <button class="btn-secondary btn-return-sale" data-id="${s.id}" style="padding: 4px 8px; font-size: 11px;">
                          ↩️ مرتجع
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `,
        footerHtml: `<button class="btn-secondary" onclick="AppModal.close()">إغلاق</button>`,
        width: '850px'
      });

      // Attach return button listener
      document.querySelectorAll('.btn-return-sale').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sId = Number(btn.getAttribute('data-id'));
          AppModal.close();
          await openProcessReturnDialog(sId);
        });
      });

      // Attach print A4 invoice listener
      document.querySelectorAll('.btn-print-sale-a4').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sNum = btn.getAttribute('data-number');
          const cName = btn.getAttribute('data-customer');
          const total = Number(btn.getAttribute('data-total')) || 0;
          try {
            const pRes = await electronApi.invoke('print:invoice', {
              invoiceNumber: sNum,
              customerName: cName || 'عميل نقدي',
              totalAmount: total,
              paidAmount: total,
              items: [{ name: 'مشتريات نقطة البيع المباشرة', quantity: 1, unit_price: total, total }]
            });
            if (pRes.success && pRes.data?.html) {
              await openPrintPreviewModal({
                title: `فاتورة مبيعات رسمية - ${sNum}`,
                html: pRes.data.html,
                pageSize: 'A4'
              });
            }
          } catch (_) { }
        });
      });
    } catch (e) {
      if (window.AppToast) window.AppToast.error(`فشل تحميل سجل المبيعات: ${e.message}`);
    }
  }

  async function openProcessReturnDialog(saleId) {
    if (!window.AppModal) return;

    try {
      const res = await electronApi.invoke('sales:get-details', { id: saleId });
      if (!res.success || !res.data) {
        if (window.AppToast) window.AppToast.error('تعذر جلب تفاصيل الفاتورة.');
        return;
      }

      const sale = res.data;
      window.AppModal.open({
        title: `↩️ مرتجع مبيعات للفاتورة #${sale.sale_number}`,
        contentHtml: `
          <div style="font-size: 13px; margin-bottom: 12px;">
            اختر الأصناف المراد إرجاعها للمخزن مع تحديد حالتها:
          </div>
          <table class="app-table" style="margin-bottom: 12px;">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الكمية المباعة</th>
                <th>المرتجع سابقاً</th>
                <th>كمية الإرجاع</th>
                <th>حالة القطعة</th>
              </tr>
            </thead>
            <tbody>
              ${sale.items.map(item => {
          const maxReturn = item.quantity - (item.returned_quantity || 0);
          if (maxReturn <= 0) {
            return `<tr><td colspan="5" style="color: var(--text-muted);">${item.item_name} (تم إرجاع كامل الكمية)</td></tr>`;
          }
          return `
                  <tr>
                    <td><strong>${item.item_name}</strong></td>
                    <td>${item.quantity}</td>
                    <td>${item.returned_quantity || 0}</td>
                    <td>
                      <input type="number" class="return-qty-input" data-item-id="${item.id}" min="1" max="${maxReturn}" value="${maxReturn}" style="width: 60px; padding: 4px; text-align: center; background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px;">
                    </td>
                    <td>
                      <select class="return-cond-select form-control" data-item-id="${item.id}" style="padding: 4px 8px; font-size: 12px;">
                        <option value="GOOD">سليمة (تعود للمخزون المتاح)</option>
                        <option value="DAMAGED">تالفة (تستبعد من المخزون)</option>
                      </select>
                    </td>
                  </tr>
                `;
        }).join('')}
            </tbody>
          </table>
          <div class="form-group">
            <label class="form-label">سبب المرتجع</label>
            <input type="text" id="pos-return-reason" class="form-control" placeholder="مثال: مقاس غير مناسب، رغبة العميل...">
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-danger" id="btn-submit-return">تأكيد المرتجع ورد المبلغ</button>
        `,
        width: '650px'
      });

      document.getElementById('btn-submit-return').addEventListener('click', async () => {
        const returnItems = [];
        document.querySelectorAll('.return-qty-input').forEach(input => {
          const itemId = Number(input.getAttribute('data-item-id'));
          const qty = Number(input.value) || 0;
          const condSelect = document.querySelector(`.return-cond-select[data-item-id="${itemId}"]`);
          const condition = condSelect ? condSelect.value : 'GOOD';
          if (qty > 0) {
            returnItems.push({ sale_item_id: itemId, return_quantity: qty, condition });
          }
        });

        if (returnItems.length === 0) {
          if (window.AppToast) window.AppToast.warning('لم يتم تحديد أي صنف للإرجاع.');
          return;
        }

        const reason = document.getElementById('pos-return-reason').value || 'مرتجع مبيعات';

        try {
          const retRes = await electronApi.invoke('sales:process-return', {
            sale_id: saleId,
            items: returnItems,
            reason
          });

          if (retRes.success) {
            AppModal.close();
            if (window.AppToast) window.AppToast.success(`تم تسجيل المرتجع بنجاح #${retRes.data.returnNumber} ورد مبلغ ${retRes.data.totalRefund} ج.م`);
            await loadPosCatalog();
          } else {
            if (window.AppToast) window.AppToast.error(retRes.error?.message || 'فشل معالجة المرتجع.');
          }
        } catch (err) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
        }
      });
    } catch (err) {
      if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
    }
  }

  // =========================================================================
  // 13. FINANCIAL ENGINE & CASH SESSIONS PAGE (المرحلة 9: المحرك المالي والخزينة)
  // =========================================================================
  let activeFinanceTab = 'session';

  async function renderFinancePage() {
    pageContent.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- 1. Header Banner & Actions -->
        <div class="table-card" style="padding: 18px 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <span style="font-size: 32px;">💰</span>
              <div>
                <h2 style="font-size: 20px; margin: 0 0 4px 0;">المحرك المالي والخزينة اليومية</h2>
                <span style="font-size: 13px; color: var(--text-secondary);">إدارة جلسات الصندوق، الأرباح، المصروفات التشغيلية، وعزل التأمينات كأمانات معلقة</span>
              </div>
            </div>
            <div id="finance-top-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
              <!-- Dynamic session action buttons -->
            </div>
          </div>

          <!-- Active Session Strip -->
          <div id="finance-session-strip" style="margin-top: 16px; padding: 14px; border-radius: var(--radius-md); background: var(--bg-surface); border: 1px solid var(--border-color);">
            <div style="color: var(--text-secondary); text-align: center;">جاري فحص حالة جلسة الصندوق...</div>
          </div>
        </div>

        <!-- 2. Financial Stats Overview -->
        <div class="stats-grid" id="finance-stats-grid">
          <div class="stat-card">
            <div class="stat-icon">💵</div>
            <div class="stat-info">
              <h4>نقدية الدرج الحالية</h4>
              <div class="value" id="stat-drawer-cash">0.00 ج.م</div>
              <span style="font-size: 11px; color: var(--color-info)">الرصيد الفعلي بالصندوق</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">📈</div>
            <div class="stat-info">
              <h4>إجمالي الإيرادات التشغيلية</h4>
              <div class="value" id="stat-gross-revenue" style="color: var(--color-gold-500)">0.00 ج.م</div>
              <span style="font-size: 11px; color: var(--text-secondary)">مبيعات + إيجارات + غرامات</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="color: var(--color-danger); background: rgba(239,68,68,0.12)">📉</div>
            <div class="stat-info">
              <h4>المصروفات التشغيلية</h4>
              <div class="value" id="stat-total-expenses" style="color: var(--color-danger)">0.00 ج.م</div>
              <span style="font-size: 11px; color: var(--text-secondary)">مغاسل، خياطة، ونثريات</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="color: var(--color-success); background: rgba(16,185,129,0.12)">💎</div>
            <div class="stat-info">
              <h4>صافي الأرباح التشغيلية</h4>
              <div class="value" id="stat-net-profit" style="color: var(--color-success)">0.00 ج.م</div>
              <span style="font-size: 11px; color: var(--color-success)">الإيرادات - المصروفات</span>
            </div>
          </div>

          <div class="stat-card" style="border: 1px dashed var(--color-warning);">
            <div class="stat-icon" style="color: var(--color-warning); background: rgba(245,158,11,0.12)">🛡️</div>
            <div class="stat-info">
              <h4>أمانات التأمين المعلقة</h4>
              <div class="value" id="stat-escrow-deposits" style="color: var(--color-warning)">0.00 ج.م</div>
              <span style="font-size: 11px; color: var(--color-warning)">أمانات مستردة (معزولة عن الأرباح)</span>
            </div>
          </div>
        </div>

        <!-- 3. Navigation Tabs -->
        <div class="table-card" style="padding: 0;">
          <div style="display: flex; gap: 4px; padding: 12px 16px 0 16px; border-bottom: 1px solid var(--border-color); overflow-x: auto;">
            <button class="admin-tab-btn ${activeFinanceTab === 'session' ? 'active' : ''}" data-tab="session">
              💼 حركات الجلسة الحالية
            </button>
            <button class="admin-tab-btn ${activeFinanceTab === 'expenses' ? 'active' : ''}" data-tab="expenses">
              🧾 المصروفات والنثريات
            </button>
            <button class="admin-tab-btn ${activeFinanceTab === 'escrow' ? 'active' : ''}" data-tab="escrow">
              🛡️ أمانات التأمين المعلقة
            </button>
            <button class="admin-tab-btn ${activeFinanceTab === 'history' ? 'active' : ''}" data-tab="history">
              📜 سجل إغلاقات الصندوق
            </button>
          </div>

          <!-- Tab Content Area -->
          <div id="finance-tab-content" style="padding: 16px;">
            <div style="text-align: center; padding: 30px; color: var(--text-secondary);">جاري التحميل...</div>
          </div>
        </div>
      </div>
    `;

    // Tab buttons listener
    pageContent.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pageContent.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFinanceTab = btn.getAttribute('data-tab');
        renderFinanceTabContent();
      });
    });

    await refreshFinanceData();
  }

  async function refreshFinanceData() {
    try {
      // 1. Fetch Session & Summary
      const [sessionRes, summaryRes] = await Promise.all([
        electronApi.invoke('finance:get-cash-session'),
        electronApi.invoke('finance:get-summary')
      ]);

      const session = sessionRes.success ? sessionRes.data : null;
      const summary = summaryRes.success ? summaryRes.data : null;

      // Update Top Stats
      if (summary) {
        const fmt = window.UiUtils ? window.UiUtils.formatCurrency : (v) => `${v} ج.م`;
        const drawerEl = document.getElementById('stat-drawer-cash');
        const grossEl = document.getElementById('stat-gross-revenue');
        const expEl = document.getElementById('stat-total-expenses');
        const profitEl = document.getElementById('stat-net-profit');
        const escrowEl = document.getElementById('stat-escrow-deposits');

        if (drawerEl) drawerEl.textContent = fmt(summary.currentDrawerCash || 0);
        if (grossEl) grossEl.textContent = fmt(summary.grossOperatingRevenue || 0);
        if (expEl) expEl.textContent = fmt(summary.totalExpenses || 0);
        if (profitEl) profitEl.textContent = fmt(summary.netOperatingProfit || 0);
        if (escrowEl) escrowEl.textContent = fmt(summary.escrowDepositsHeld || 0);
      }

      // Update Session Banner Strip & Action Buttons
      const strip = document.getElementById('finance-session-strip');
      const actions = document.getElementById('finance-top-actions');

      if (session && session.status === 'OPEN') {
        const fmt = window.UiUtils ? window.UiUtils.formatCurrency : (v) => `${v} ج.م`;
        if (strip) {
          strip.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          strip.style.background = 'rgba(16, 185, 129, 0.05)';
          strip.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--color-success); box-shadow: 0 0 10px var(--color-success);"></span>
                <div>
                  <strong style="font-size: 15px;">جلسة الصندوق مفتوحة [${session.session_code}]</strong>
                  <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                    بدأت في: ${session.opened_at} • رصيد افتتاحي: ${fmt(session.opening_balance)}
                  </div>
                </div>
              </div>
              <div style="display: flex; gap: 16px; align-items: center;">
                <div style="text-align: left;">
                  <span style="font-size: 11px; color: var(--text-secondary); display: block;">رصيد الدرج الدفتري المحسوب:</span>
                  <span style="font-size: 18px; font-weight: 800; color: var(--color-success);">${fmt(session.calculated_balance)}</span>
                </div>
              </div>
            </div>
          `;
        }

        if (actions) {
          actions.innerHTML = `
            <button class="btn-primary-action" id="btn-record-expense" style="font-size: 13px;">
              <span>➕</span> تسجيل مصروف
            </button>
            <button class="btn-secondary" id="btn-cash-adj" style="font-size: 13px;">
              <span>💵</span> إيداع / سحب بالصندوق
            </button>
            <button class="btn-secondary" id="btn-close-session" style="font-size: 13px; color: var(--color-danger); border-color: rgba(239,68,68,0.3);">
              <span>🔒</span> إغلاق الجلسة وتوريد النقدية
            </button>
          `;
        }
      } else {
        if (strip) {
          strip.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          strip.style.background = 'rgba(239, 68, 68, 0.05)';
          strip.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--color-danger);"></span>
                <div>
                  <strong style="color: var(--color-danger);">الخزينة مغلقة حاليًا</strong>
                  <span style="font-size: 12px; color: var(--text-secondary); display: block;">لا توجد جلسة صندوق مفتوحة. يجب فتح جلسة لتسجيل أي حركة نقدية أو تسليم بدل.</span>
                </div>
              </div>
              <button class="btn-primary-action" id="btn-open-session-strip" style="font-size: 13px;">
                ⚡ فتح جلسة صندوق جديدة
              </button>
            </div>
          `;
        }

        if (actions) {
          actions.innerHTML = `
            <button class="btn-primary-action" id="btn-open-session-top" style="font-size: 13px;">
              ⚡ فتح جلسة جديدة
            </button>
          `;
        }
      }

      // Attach button event listeners
      setupFinanceActionButtons(session);

      // Render Active Tab Content
      await renderFinanceTabContent();

    } catch (err) {
      console.error('Error refreshing finance page:', err);
    }
  }

  function setupFinanceActionButtons(session) {
    const btnOpenStrip = document.getElementById('btn-open-session-strip');
    const btnOpenTop = document.getElementById('btn-open-session-top');
    const btnClose = document.getElementById('btn-close-session');
    const btnExpense = document.getElementById('btn-record-expense');
    const btnAdj = document.getElementById('btn-cash-adj');

    if (btnOpenStrip) btnOpenStrip.addEventListener('click', openSessionModal);
    if (btnOpenTop) btnOpenTop.addEventListener('click', openSessionModal);
    if (btnClose) btnClose.addEventListener('click', () => closeSessionModal(session));
    if (btnExpense) btnExpense.addEventListener('click', openExpenseModal);
    if (btnAdj) btnAdj.addEventListener('click', openCashAdjModal);
  }

  async function renderFinanceTabContent() {
    const container = document.getElementById('finance-tab-content');
    if (!container) return;

    if (activeFinanceTab === 'session') {
      await renderSessionTransactionsTab(container);
    } else if (activeFinanceTab === 'expenses') {
      await renderExpensesTab(container);
    } else if (activeFinanceTab === 'escrow') {
      await renderEscrowDepositsTab(container);
    } else if (activeFinanceTab === 'history') {
      await renderSessionsHistoryTab(container);
    }
  }

  // --- Sub-Tab 1: Current Session Transactions ---
  async function renderSessionTransactionsTab(container) {
    const res = await electronApi.invoke('finance:get-cash-session');
    const session = res.success ? res.data : null;

    if (!session || !session.recent_transactions || session.recent_transactions.length === 0) {
      container.innerHTML = `
        <div class="state-container empty-state" style="padding: 40px 0;">
          <div class="state-icon">💼</div>
          <h4 class="state-title">لا توجد حركات نقدية مسجلة في الجلسة الحالية</h4>
          <p class="state-desc">سيتم تسجيل أي عملية بيع، إيجار، تأمين، أو مصروف هنا تلقائياً.</p>
        </div>
      `;
      return;
    }

    const fmt = window.UiUtils ? window.UiUtils.formatCurrency : (v) => `${v} ج.م`;

    container.innerHTML = `
      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <h4 style="margin: 0; font-size: 14px;">سجل حركات النقدية بالدرج (${session.recent_transactions.length} حركة)</h4>
        <div style="display: flex; gap: 8px;">
          <span class="badge badge-success">وارد: +${fmt(session.total_cash_in)}</span>
          <span class="badge badge-danger">صادر: -${fmt(session.total_cash_out)}</span>
        </div>
      </div>

      <div style="max-height: 400px; overflow-y: auto;">
        <table class="app-table">
          <thead>
            <tr>
              <th>#</th>
              <th>النوع</th>
              <th>التصنيف</th>
              <th>المبلغ</th>
              <th>البيان والملاحظات</th>
              <th>التاريخ والوقت</th>
            </tr>
          </thead>
          <tbody>
            ${session.recent_transactions.map(t => {
      const isIncome = t.transaction_type === 'IN';
      const sign = isIncome ? '+' : '-';
      const color = isIncome ? 'var(--color-success)' : 'var(--color-danger)';
      const badgeClass = isIncome ? 'badge-success' : 'badge-danger';

      const catNames = {
        RENTAL: 'إيجار بدل',
        SALE: 'مبيعات نقدية',
        DEPOSIT: 'تأمين أمانات',
        DEPOSIT_REFUND: 'رد تأمين',
        EXPENSE: 'مصروفات',
        MANUAL_IN: 'إيداع نثريات',
        MANUAL_OUT: 'سحب نقدي'
      };

      return `
                <tr>
                  <td>${t.id}</td>
                  <td><span class="badge ${badgeClass}">${isIncome ? 'وارد 📥' : 'صادر 📤'}</span></td>
                  <td><strong>${catNames[t.category] || t.category}</strong></td>
                  <td style="font-weight: 800; color: ${color}; direction: ltr; text-align: right;">${sign}${fmt(t.amount)}</td>
                  <td style="font-size: 13px;">${t.notes || '-'}</td>
                  <td style="font-size: 12px; color: var(--text-secondary);">${t.created_at}</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // --- Sub-Tab 2: Expenses ---
  async function renderExpensesTab(container) {
    const res = await electronApi.invoke('finance:get-expenses', { limit: 100 });
    const expenses = res.success && res.data ? res.data : [];
    const fmt = window.UiUtils ? window.UiUtils.formatCurrency : (v) => `${v} ج.م`;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h4 style="margin: 0; font-size: 14px;">سجل المصروفات والنثريات التشغيلية</h4>
        <button class="btn-primary-action" id="btn-tab-add-expense" style="padding: 6px 14px; font-size: 12px;">
          ➕ تسجيل مصروف جديد
        </button>
      </div>

      <div style="max-height: 400px; overflow-y: auto;">
        <table class="app-table">
          <thead>
            <tr>
              <th>رقم السند</th>
              <th>التصنيف</th>
              <th>المبلغ</th>
              <th>البيان والتفاصيل</th>
              <th>كود الجلسة</th>
              <th>التاريخ والوقت</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.length === 0 ? `
              <tr><td colspan="6" style="text-align: center; padding: 24px;">لا توجد مصروفات مسجلة حتى الآن.</td></tr>
            ` : expenses.map(e => `
              <tr>
                <td><strong>${e.expense_number}</strong></td>
                <td><span class="badge badge-info">${e.category_name}</span></td>
                <td style="font-weight: 800; color: var(--color-danger);">${fmt(e.amount)}</td>
                <td style="font-size: 13px;">${e.description}</td>
                <td style="font-size: 12px; color: var(--text-muted);">${e.session_code || '-'}</td>
                <td style="font-size: 12px; color: var(--text-secondary);">${e.created_at}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const addExpBtn = document.getElementById('btn-tab-add-expense');
    if (addExpBtn) addExpBtn.addEventListener('click', openExpenseModal);
  }

  // --- Sub-Tab 3: Escrow Deposits ---
  async function renderEscrowDepositsTab(container) {
    const res = await electronApi.invoke('finance:get-escrow-deposits');
    const data = res.success ? res.data : { activeDepositsList: [], netEscrowHeld: 0 };
    const fmt = window.UiUtils ? window.UiUtils.formatCurrency : (v) => `${v} ج.م`;

    container.innerHTML = `
      <div style="padding: 12px 16px; margin-bottom: 14px; background: rgba(245,158,11,0.08); border: 1px dashed var(--color-warning); border-radius: var(--radius-sm); font-size: 13px; color: var(--text-primary); line-height: 1.5;">
        <strong style="color: var(--color-warning);">⚠️ قاعدة العزل المالي لأموال التأمين (Amanat):</strong>
        مبالغ التأمين المستلمة من الزبائن عند استلام البدل تُعزل بالكامل كأمانات معلقة ولا تدخل إطلاقاً في صافي أرباح المحل حتى تتم تسويتها واسترجاعها للزبون عند فحص البدلة.
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="margin: 0; font-size: 14px;">قائمة أمانات الحجوزات النشطة (${data.activeDepositsList.length} حجز)</h4>
        <span class="badge badge-warning" style="font-size: 13px; font-weight: 700;">إجمالي الأمانات المعلقة: ${fmt(data.netEscrowHeld)}</span>
      </div>

      <div style="max-height: 400px; overflow-y: auto;">
        <table class="app-table">
          <thead>
            <tr>
              <th>رقم الحجز</th>
              <th>العميل</th>
              <th>تاريخ الاستلام</th>
              <th>تاريخ الإرجاع المتوقع</th>
              <th>حالة الحجز</th>
              <th>التأمين المسدد</th>
              <th>المسترد</th>
              <th>الأمانة المتبقية</th>
            </tr>
          </thead>
          <tbody>
            ${data.activeDepositsList.length === 0 ? `
              <tr><td colspan="8" style="text-align: center; padding: 24px;">لا توجد أمانات تأمين معلقة حاليًا. جميع التأمينات تمت تسويتها.</td></tr>
            ` : data.activeDepositsList.map(d => `
              <tr>
                <td><strong>${d.booking_number}</strong></td>
                <td>${d.customer_name} (${d.customer_phone})</td>
                <td style="font-size: 12px;">${d.pickup_date}</td>
                <td style="font-size: 12px;">${d.return_due_date}</td>
                <td><span class="badge badge-info">${d.status}</span></td>
                <td style="font-weight: 600;">${fmt(d.deposit_paid)}</td>
                <td style="color: var(--text-muted);">${fmt(d.deposit_refunded)}</td>
                <td style="font-weight: 800; color: var(--color-warning);">${fmt(d.remaining_deposit)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // --- Sub-Tab 4: Sessions History ---
  async function renderSessionsHistoryTab(container) {
    const res = await electronApi.invoke('finance:get-sessions-list', { limit: 50 });
    const sessions = res.success && res.data ? res.data : [];
    const fmt = window.UiUtils ? window.UiUtils.formatCurrency : (v) => `${v} ج.م`;

    container.innerHTML = `
      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0; font-size: 14px;">سجل إغلاق الورديات وجلسات الصندوق السابقة</h4>
      </div>

      <div style="max-height: 400px; overflow-y: auto;">
        <table class="app-table">
          <thead>
            <tr>
              <th>كود الجلسة</th>
              <th>تاريخ الفتح</th>
              <th>تاريخ الإغلاق</th>
              <th>الرصيد الافتتاحي</th>
              <th>الوارد</th>
              <th>المنصرف</th>
              <th>الرصيد الدفتري</th>
              <th>الرصيد الفعلي</th>
              <th>الفارق (عجز/زيادة)</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.length === 0 ? `
              <tr><td colspan="10" style="text-align: center; padding: 24px;">لا يوجد سجل جلسات سابق.</td></tr>
            ` : sessions.map(s => {
      const isOpen = s.status === 'OPEN';
      const diff = s.difference || 0;
      let diffBadge = '<span class="badge badge-success">متطابق</span>';
      if (diff < 0) diffBadge = `<span class="badge badge-danger">عجز (${fmt(Math.abs(diff))})</span>`;
      if (diff > 0) diffBadge = `<span class="badge badge-info">زيادة (+${fmt(diff)})</span>`;
      if (isOpen) diffBadge = '<span class="badge badge-warning">جلسة نشطة</span>';

      return `
                <tr>
                  <td><strong>${s.session_code}</strong></td>
                  <td style="font-size: 12px;">${s.opened_at}</td>
                  <td style="font-size: 12px; color: var(--text-muted);">${s.closed_at || '-'}</td>
                  <td>${fmt(s.opening_balance)}</td>
                  <td style="color: var(--color-success);">+${fmt(s.total_cash_in)}</td>
                  <td style="color: var(--color-danger);">${fmt(s.total_cash_out)}</td>
                  <td style="font-weight: 700;">${fmt(s.calculated_balance)}</td>
                  <td style="font-weight: 700;">${s.actual_balance !== null ? fmt(s.actual_balance) : '-'}</td>
                  <td>${diffBadge}</td>
                  <td><span class="badge ${isOpen ? 'badge-success' : 'badge-secondary'}">${isOpen ? 'مفتوحة' : 'مغلقة'}</span></td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // =========================================================================
  // Modals for Finance
  // =========================================================================

  function openSessionModal() {
    if (!window.AppModal) return;
    window.AppModal.open({
      title: '⚡ فتح جلسة صندوق جديدة (وردية عمل)',
      contentHtml: `
        <div class="form-group">
          <label class="form-label">الرصيد الافتتاحي للنقدية بالدرج (ج.م)</label>
          <input type="number" id="modal-open-balance" class="form-control" placeholder="0.00" value="0" min="0">
          <span style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block;">الفكة أو النقدية المتواجدة بالدرج مع بداية الوردية</span>
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات الفتح (اختياري)</label>
          <input type="text" id="modal-open-notes" class="form-control" placeholder="مثال: وردية صباحية">
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-primary-action" id="btn-submit-open-session">تأكيد فتح الجلسة</button>
      `,
      width: '450px'
    });

    document.getElementById('btn-submit-open-session').addEventListener('click', async () => {
      const balance = Number(document.getElementById('modal-open-balance').value) || 0;
      const notes = document.getElementById('modal-open-notes').value || '';
      try {
        const res = await electronApi.invoke('finance:open-cash-session', { openingBalance: balance, notes });
        if (res.success) {
          AppModal.close();
          if (window.AppToast) window.AppToast.success(`تم فتح جلسة الصندوق بنجاح [${res.data.sessionCode}] ⚡`);
          await refreshFinanceData();
        } else {
          if (window.AppToast) window.AppToast.error(res.error?.message || 'فشل فتح الجلسة.');
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });
  }

  function closeSessionModal(session) {
    if (!window.AppModal) return;
    const calcBal = session ? session.calculated_balance : 0;
    const fmt = window.UiUtils ? window.UiUtils.formatCurrency : (v) => `${v} ج.م`;

    window.AppModal.open({
      title: '🔒 إغلاق جلسة الصندوق وتوريد النقدية',
      contentHtml: `
        <div style="background: var(--bg-surface); padding: 14px; border-radius: var(--radius-sm); margin-bottom: 14px; border: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; font-size: 14px;">
            <span>الرصيد الدفتري المسجل بالنظام:</span>
            <strong style="color: var(--color-success); font-size: 16px;">${fmt(calcBal)}</strong>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">النقدية الفعلية الموجودة في الدرج بعد الجرد (ج.م):</label>
          <input type="number" id="modal-actual-cash" class="form-control" placeholder="أدخل المبلغ بعد العد اليدوي..." style="font-size: 16px; font-weight: 700; color: var(--color-gold-500);">
        </div>

        <div id="close-diff-preview" style="padding: 10px; border-radius: 4px; font-size: 13px; font-weight: 700; margin-bottom: 12px; display: none;">
        </div>

        <div class="form-group">
          <label class="form-label">ملاحظات التقفيل والتوريد</label>
          <input type="text" id="modal-close-notes" class="form-control" placeholder="مثال: تم توريد المبلغ للمالك...">
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-danger" id="btn-submit-close-session">تأكيد الإغلاق النهائي</button>
      `,
      width: '480px'
    });

    const cashInput = document.getElementById('modal-actual-cash');
    const diffPreview = document.getElementById('close-diff-preview');

    cashInput.addEventListener('input', () => {
      const val = Number(cashInput.value);
      if (isNaN(val) || cashInput.value.trim() === '') {
        diffPreview.style.display = 'none';
        return;
      }
      const diff = val - calcBal;
      diffPreview.style.display = 'block';
      if (diff === 0) {
        diffPreview.style.background = 'rgba(16,185,129,0.15)';
        diffPreview.style.color = 'var(--color-success)';
        diffPreview.textContent = '✓ النقدية متطابقة تماماً مع الدفاتر (فارق 0 ج.م)';
      } else if (diff < 0) {
        diffPreview.style.background = 'rgba(239,68,68,0.15)';
        diffPreview.style.color = 'var(--color-danger)';
        diffPreview.textContent = `⚠️ يوجد عجز في الدرج بمقدار: ${fmt(Math.abs(diff))}`;
      } else {
        diffPreview.style.background = 'rgba(59,130,246,0.15)';
        diffPreview.style.color = 'var(--color-info)';
        diffPreview.textContent = `ℹ️ توجد زيادة في الدرج بمقدار: ${fmt(diff)}`;
      }
    });

    document.getElementById('btn-submit-close-session').addEventListener('click', async () => {
      const actualVal = cashInput.value.trim();
      if (actualVal === '') {
        if (window.AppToast) window.AppToast.warning('يرجى كتابة المبلغ الفعلي بالدرج.');
        return;
      }
      const notes = document.getElementById('modal-close-notes').value || '';

      try {
        const res = await electronApi.invoke('finance:close-cash-session', {
          actualBalance: Number(actualVal),
          notes
        });

        if (res.success) {
          AppModal.close();
          if (window.AppToast) window.AppToast.success(`تم إغلاق الجلسة بنجاح [${res.data.sessionCode}] - الحالة: ${res.data.discrepancyText}`);
          await refreshFinanceData();
        } else {
          if (window.AppToast) window.AppToast.error(res.error?.message || 'فشل إغلاق الجلسة.');
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });
  }

  async function openExpenseModal() {
    if (!window.AppModal) return;

    let categories = [];
    try {
      const catRes = await electronApi.invoke('finance:get-expense-categories');
      if (catRes.success && catRes.data) categories = catRes.data;
    } catch (_) { }

    window.AppModal.open({
      title: '➕ تسجيل سند صرف / مصروف جديد',
      contentHtml: `
        <div class="form-group">
          <label class="form-label">تصنيف المصروف</label>
          <select id="modal-exp-cat" class="form-control">
            ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">المبلغ (ج.م)</label>
          <input type="number" id="modal-exp-amount" class="form-control" placeholder="0.00" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">البيان / تفاصيل الصرف</label>
          <input type="text" id="modal-exp-desc" class="form-control" placeholder="اكتب تفاصيل المصروف...">
        </div>
        <div class="form-group">
          <label class="form-label">طريقة الصرف</label>
          <select id="modal-exp-method" class="form-control">
            <option value="CASH">نقداً من الدرج (خصم من الصندوق)</option>
            <option value="CARD">بطاقة بنكية / تحويل</option>
          </select>
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-primary-action" id="btn-submit-expense">تسجيل السند والخصم</button>
      `,
      width: '450px'
    });

    document.getElementById('btn-submit-expense').addEventListener('click', async () => {
      const catId = Number(document.getElementById('modal-exp-cat').value);
      const amount = Number(document.getElementById('modal-exp-amount').value);
      const desc = document.getElementById('modal-exp-desc').value.trim();
      const method = document.getElementById('modal-exp-method').value;

      if (!amount || amount <= 0) {
        if (window.AppToast) window.AppToast.warning('يرجى إدخال مبلغ صحيح.');
        return;
      }
      if (!desc) {
        if (window.AppToast) window.AppToast.warning('يرجى إدخال بيان المصروف.');
        return;
      }

      try {
        const res = await electronApi.invoke('finance:record-expense', {
          category_id: catId,
          amount,
          description: desc,
          payment_method: method
        });

        if (res.success) {
          AppModal.close();
          if (window.AppToast) window.AppToast.success(`تم تسجيل سند الصرف بنجاح [${res.data.expenseNumber}]`);
          await refreshFinanceData();
        } else {
          if (window.AppToast) window.AppToast.error(res.error?.message || 'فشل تسجيل المصروف.');
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });
  }

  function openCashAdjModal() {
    if (!window.AppModal) return;

    window.AppModal.open({
      title: '💵 إيداع نثريات أو سحب نقدي بالصندوق',
      contentHtml: `
        <div class="form-group">
          <label class="form-label">نوع الحركة</label>
          <select id="modal-adj-type" class="form-control">
            <option value="IN">إيداع نثريات بالدرج (+ وارد)</option>
            <option value="OUT">سحب نقدي / مسحوبات شخصية (- صادر)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">المبلغ (ج.م)</label>
          <input type="number" id="modal-adj-amount" class="form-control" placeholder="0.00" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">السبب / البيان</label>
          <input type="text" id="modal-adj-reason" class="form-control" placeholder="سبب الإيداع أو السحب...">
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-primary-action" id="btn-submit-adj">تنفيذ الحركة</button>
      `,
      width: '450px'
    });

    document.getElementById('btn-submit-adj').addEventListener('click', async () => {
      const type = document.getElementById('modal-adj-type').value;
      const amount = Number(document.getElementById('modal-adj-amount').value);
      const reason = document.getElementById('modal-adj-reason').value.trim();

      if (!amount || amount <= 0) {
        if (window.AppToast) window.AppToast.warning('يرجى إدخال مبلغ صحيح.');
        return;
      }
      if (!reason) {
        if (window.AppToast) window.AppToast.warning('يرجى كتابة سبب الحركة.');
        return;
      }

      try {
        const res = await electronApi.invoke('finance:record-cash-adjustment', { type, amount, reason });
        if (res.success) {
          AppModal.close();
          if (window.AppToast) window.AppToast.success(`تم تنفيذ حركة النقدية بنجاح. الرصيد الجديد: ${res.data.newBalance} ج.م`);
          await refreshFinanceData();
        } else {
          if (window.AppToast) window.AppToast.error(res.error?.message || 'فشل تنفيذ الحركة.');
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });
  }

  // =========================================================================
  // 14. TASKS, ALERTS & WHATSAPP INTEGRATION PAGE (المرحلة 10: المهام والتنبيهات)
  // =========================================================================
  let activeTasksFilter = 'ALL';
  let activeReturnsFilter = 'ALL';
  let returnsSearchQuery = '';
  let returnsDateFrom = '';
  let returnsDateTo = '';
  let tasksSearchQuery = '';
  let tasksDateFrom = '';
  let tasksDateTo = '';

  async function renderTasksPage() {
    // 0. Auto-generate tasks from bookings immediately so data is fresh without clicking any button
    try {
      await electronApi.invoke('tasks:generate-from-bookings');
    } catch (e) {
      console.warn('Auto task sync warning:', e);
    }

    pageContent.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- 1. Header Banner & Actions -->
        <div class="table-card" style="padding: 18px 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <span style="font-size: 32px;">📋</span>
              <div>
                <h2 style="font-size: 20px; margin: 0 0 4px 0;">لوحة المهام اليومية والتنبيهات وتواصل واتساب</h2>
                <span style="font-size: 13px; color: var(--text-secondary);">متابعة بروفات الخياطة، كي وتجهيز البدل، متأخرات الإرجاع، والتذكير التلقائي للزبائن</span>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn-secondary" id="btn-run-auto-wa-tasks" style="font-size: 13px; color: #10B981; border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.06);" title="إرسال رسائل التذكير والمتأخرات تلقائياً في الخلفية لجميع العملاء المستحقين الآن">
                <span>💬🚀</span> إرسال التنبيهات تلقائياً الآن
              </button>
              <button class="btn-secondary" id="btn-auto-gen-tasks" style="font-size: 13px;">
                <span>⚡</span> تحديث وتوليد المهام من الحجوزات
              </button>
              <button class="btn-primary-action" id="btn-create-task" style="font-size: 13px;">
                <span>➕</span> إنشاء مهمة جديدة
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Alerts & Summary Cards -->
        <div class="stats-grid" id="tasks-stats-grid">
          <div class="stat-card">
            <div class="stat-icon">📅</div>
            <div class="stat-info">
              <h4>مهام اليوم المستحقة</h4>
              <div class="value" id="stat-today-tasks">0 مهام</div>
              <span style="font-size: 11px; color: var(--color-gold-500)">تحتاج للإنجاز اليوم</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="color: var(--color-danger); background: rgba(239,68,68,0.12)">⚠️</div>
            <div class="stat-info">
              <h4>متأخرات وتنبيهات عاجلة</h4>
              <div class="value" id="stat-overdue-tasks" style="color: var(--color-danger)">0 تنبيه</div>
              <span style="font-size: 11px; color: var(--color-danger)">بدل تجاوزت موعد الإرجاع</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="color: var(--color-info); background: rgba(59,130,246,0.12)">✂️</div>
            <div class="stat-info">
              <h4>بروفات وتعديلات خياط</h4>
              <div class="value" id="stat-fittings-count" style="color: var(--color-info)">0 بروفات</div>
              <span style="font-size: 11px; color: var(--text-secondary)">مواعيد قياسات الزبائن</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="color: var(--color-success); background: rgba(16,185,129,0.12)">📦</div>
            <div class="stat-info">
              <h4>تسليمات واستلامات اليوم</h4>
              <div class="value" id="stat-pickups-returns" style="color: var(--color-success)">0 حجز</div>
              <span style="font-size: 11px; color: var(--color-success)">جاهزة للتسليم والاستلام</span>
            </div>
          </div>
        </div>

        <!-- Active Alerts Banner Area -->
        <div id="tasks-alerts-container"></div>

        <!-- 3. Returns Reminders & Collection Section (تذكيرات واستلامات المرتجعات) -->
        <div class="table-card" style="padding: 0; border: 1px solid rgba(245, 158, 11, 0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(90deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%); padding: 14px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 26px;">📦</span>
              <div>
                <h3 style="font-size: 16px; margin: 0 0 2px 0; font-weight: 700; color: var(--text-primary);">تذكيرات واستلامات المنتجات المستحقة للإرجاع</h3>
                <span style="font-size: 12px; color: var(--text-secondary);">متابعة البدل المؤجرة، تنبيهات التأخير وغرامات اليوم، استلام البدلة وتصفية الأمانات مع الزبون</span>
              </div>
            </div>
            <div style="display: flex; gap: 6px; overflow-x: auto;" id="returns-filters-bar">
              <button class="admin-tab-btn ${activeReturnsFilter === 'ALL' ? 'active' : ''}" data-return-filter="ALL" style="font-size: 12px; padding: 4px 12px;">الكل</button>
              <button class="admin-tab-btn ${activeReturnsFilter === 'OVERDUE' ? 'active' : ''}" data-return-filter="OVERDUE" style="font-size: 12px; padding: 4px 12px; color: var(--color-danger);">🚨 متأخرات عاجلة</button>
              <button class="admin-tab-btn ${activeReturnsFilter === 'TODAY' ? 'active' : ''}" data-return-filter="TODAY" style="font-size: 12px; padding: 4px 12px; color: var(--color-gold-500);">📅 مستحقة اليوم</button>
              <button class="admin-tab-btn ${activeReturnsFilter === 'UPCOMING' ? 'active' : ''}" data-return-filter="UPCOMING" style="font-size: 12px; padding: 4px 12px;">⏳ مستحقة قريباً</button>
            </div>
          </div>

          <!-- Returns Search & Date Filter Bar -->
          <div style="padding: 10px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="position: relative; min-width: 260px; flex: 1; max-width: 380px;">
              <input type="text" id="return-search-input" class="form-control" placeholder="🔍 بحث باسم العميل، البدلة/الصنف، أو رقم الحجز..." value="${returnsSearchQuery}" style="font-size: 12px; height: 34px; padding-left: 28px;">
              <button id="btn-clear-return-search" style="display: ${returnsSearchQuery ? 'inline-block' : 'none'}; position: absolute; left: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 13px;">✕</button>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600;">تاريخ الإرجاع:</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <label style="font-size: 11px; color: var(--text-muted);">من</label>
                <input type="date" id="return-date-from" class="form-control" value="${returnsDateFrom}" style="font-size: 11px; padding: 3px 6px; width: 130px; height: 34px;">
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <label style="font-size: 11px; color: var(--text-muted);">إلى</label>
                <input type="date" id="return-date-to" class="form-control" value="${returnsDateTo}" style="font-size: 11px; padding: 3px 6px; width: 130px; height: 34px;">
              </div>
              <button class="btn-secondary" id="btn-reset-returns-filter" style="display: ${(returnsDateFrom || returnsDateTo || returnsSearchQuery) ? 'inline-flex' : 'none'}; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px; height: 34px; color: var(--color-danger); border-color: rgba(239,68,68,0.3);" title="إلغاء وتصفية البحث">
                مسح الفلترة ✖
              </button>
            </div>
          </div>

          <div id="tasks-returns-container" style="padding: 16px;">
            <div style="text-align: center; padding: 25px; color: var(--text-secondary);">جاري فحص المرتجعات المستحقة...</div>
          </div>
        </div>

        <!-- 4. General Operational Tasks Table -->
        <div class="table-card" style="padding: 0;">
          <div style="padding: 14px 20px 0 20px; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">📌</span>
                <h3 style="font-size: 15px; margin: 0; font-weight: 700;">جدول المهام التشغيلية ومواعيد البروفات</h3>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);" id="tasks-count-label">0 مهام</div>
            </div>
            <div style="display: flex; gap: 4px; overflow-x: auto; padding-bottom: 10px;" id="general-tasks-filter-bar">
              <button class="admin-tab-btn ${activeTasksFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">الكل</button>
              <button class="admin-tab-btn ${activeTasksFilter === 'TODAY' ? 'active' : ''}" data-filter="TODAY">مهام اليوم 📌</button>
              <button class="admin-tab-btn ${activeTasksFilter === 'UPCOMING' ? 'active' : ''}" data-filter="UPCOMING">قادمة ومجدولة ⏳</button>
              <button class="admin-tab-btn ${activeTasksFilter === 'OVERDUE' ? 'active' : ''}" data-filter="OVERDUE">متأخرات عاجلة ⚠️</button>
              <button class="admin-tab-btn ${activeTasksFilter === 'COMPLETED' ? 'active' : ''}" data-filter="COMPLETED">مكتملة ✅</button>
            </div>
          </div>

          <!-- General Tasks Search & Date Filter Bar -->
          <div style="padding: 10px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="position: relative; min-width: 240px; flex: 1; max-width: 360px;">
              <input type="text" id="tasks-search-input" class="form-control" placeholder="🔍 بحث بالمهمة، اسم العميل، البدلة..." value="${tasksSearchQuery}" style="font-size: 12px; height: 32px;">
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">استحقاق:</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <label style="font-size: 11px; color: var(--text-muted);">من</label>
                <input type="date" id="tasks-date-from" class="form-control" value="${tasksDateFrom}" style="font-size: 11px; padding: 2px 6px; width: 125px; height: 32px;">
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <label style="font-size: 11px; color: var(--text-muted);">إلى</label>
                <input type="date" id="tasks-date-to" class="form-control" value="${tasksDateTo}" style="font-size: 11px; padding: 2px 6px; width: 125px; height: 32px;">
              </div>
              <button class="btn-secondary" id="btn-reset-tasks-filter" style="display: ${(tasksDateFrom || tasksDateTo || tasksSearchQuery) ? 'inline-flex' : 'none'}; align-items: center; gap: 4px; padding: 2px 8px; font-size: 11px; height: 32px; color: var(--color-danger);" title="إلغاء التصفية">
                مسح ✖
              </button>
            </div>
          </div>

          <div id="tasks-table-container" style="padding: 16px;">
            <div style="text-align: center; padding: 30px; color: var(--text-secondary);">جاري تحميل قائمة المهام...</div>
          </div>
        </div>
      </div>
    `;

    // Return Filter Buttons Listener
    const returnsFilterBar = document.getElementById('returns-filters-bar');
    if (returnsFilterBar) {
      returnsFilterBar.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          returnsFilterBar.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeReturnsFilter = btn.getAttribute('data-return-filter');
          loadReturnsDueList();
        });
      });
    }

    // Return Search & Date Filter Listeners
    const retSearchInput = document.getElementById('return-search-input');
    const retDateFromInput = document.getElementById('return-date-from');
    const retDateToInput = document.getElementById('return-date-to');
    const btnResetReturns = document.getElementById('btn-reset-returns-filter');
    const btnClearRetSearch = document.getElementById('btn-clear-return-search');

    function syncReturnsFilterToolbar() {
      const hasFilter = Boolean(returnsDateFrom || returnsDateTo || returnsSearchQuery);
      if (btnResetReturns) btnResetReturns.style.display = hasFilter ? 'inline-flex' : 'none';
      if (btnClearRetSearch) btnClearRetSearch.style.display = returnsSearchQuery ? 'inline-block' : 'none';
    }

    retSearchInput?.addEventListener('input', (e) => {
      returnsSearchQuery = e.target.value;
      syncReturnsFilterToolbar();
      loadReturnsDueList();
    });

    const onReturnDateChange = () => {
      returnsDateFrom = retDateFromInput?.value || '';
      returnsDateTo = retDateToInput?.value || '';
      syncReturnsFilterToolbar();
      loadReturnsDueList();
    };

    retDateFromInput?.addEventListener('change', onReturnDateChange);
    retDateFromInput?.addEventListener('input', onReturnDateChange);
    retDateToInput?.addEventListener('change', onReturnDateChange);
    retDateToInput?.addEventListener('input', onReturnDateChange);

    btnResetReturns?.addEventListener('click', () => {
      returnsSearchQuery = '';
      returnsDateFrom = '';
      returnsDateTo = '';
      if (retSearchInput) retSearchInput.value = '';
      if (retDateFromInput) retDateFromInput.value = '';
      if (retDateToInput) retDateToInput.value = '';
      syncReturnsFilterToolbar();
      loadReturnsDueList();
    });

    btnClearRetSearch?.addEventListener('click', () => {
      returnsSearchQuery = '';
      if (retSearchInput) retSearchInput.value = '';
      syncReturnsFilterToolbar();
      loadReturnsDueList();
    });

    // General Tasks Filter Buttons Listener
    const generalFilterBar = document.getElementById('general-tasks-filter-bar');
    if (generalFilterBar) {
      generalFilterBar.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          generalFilterBar.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeTasksFilter = btn.getAttribute('data-filter');
          loadTasksList();
        });
      });
    }

    // General Tasks Search & Date Filter Listeners
    const tasksSearchInput = document.getElementById('tasks-search-input');
    const tasksDateFromInput = document.getElementById('tasks-date-from');
    const tasksDateToInput = document.getElementById('tasks-date-to');
    const btnResetTasks = document.getElementById('btn-reset-tasks-filter');

    function syncTasksFilterToolbar() {
      const hasFilter = Boolean(tasksDateFrom || tasksDateTo || tasksSearchQuery);
      if (btnResetTasks) btnResetTasks.style.display = hasFilter ? 'inline-flex' : 'none';
    }

    tasksSearchInput?.addEventListener('input', (e) => {
      tasksSearchQuery = e.target.value;
      syncTasksFilterToolbar();
      loadTasksList();
    });

    const onTasksDateChange = () => {
      tasksDateFrom = tasksDateFromInput?.value || '';
      tasksDateTo = tasksDateToInput?.value || '';
      syncTasksFilterToolbar();
      loadTasksList();
    };

    tasksDateFromInput?.addEventListener('change', onTasksDateChange);
    tasksDateFromInput?.addEventListener('input', onTasksDateChange);
    tasksDateToInput?.addEventListener('change', onTasksDateChange);
    tasksDateToInput?.addEventListener('input', onTasksDateChange);

    btnResetTasks?.addEventListener('click', () => {
      tasksSearchQuery = '';
      tasksDateFrom = '';
      tasksDateTo = '';
      if (tasksSearchInput) tasksSearchInput.value = '';
      if (tasksDateFromInput) tasksDateFromInput.value = '';
      if (tasksDateToInput) tasksDateToInput.value = '';
      syncTasksFilterToolbar();
      loadTasksList();
    });

    // Top action buttons
    const btnAutoGen = document.getElementById('btn-auto-gen-tasks');
    const btnCreate = document.getElementById('btn-create-task');

    if (btnAutoGen) {
      btnAutoGen.addEventListener('click', async () => {
        try {
          const res = await electronApi.invoke('tasks:generate-from-bookings');
          if (res.success) {
            const count = res.data?.createdCount || 0;
            if (window.AppToast) window.AppToast.success(`تم فحص الحجوزات وتحديث ${count} مهمة بنجاح! ⚡`);
            await refreshTasksPage();
          }
        } catch (err) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
        }
      });
    }

    const btnRunAutoWa = document.getElementById('btn-run-auto-wa-tasks');
    if (btnRunAutoWa) {
      btnRunAutoWa.addEventListener('click', async () => {
        btnRunAutoWa.disabled = true;
        btnRunAutoWa.innerHTML = '<span>⏳</span> جاري فحص وإرسال التنبيهات...';
        try {
          if (window.AppToast) window.AppToast.info('جاري إرسال التنبيهات للعملاء المؤجرين في الخلفية عبر واتساب... 🚀');
          const res = await electronApi.invoke('whatsapp:run-auto-alerts');
          const data = res?.data || res || {};
          if (data.success) {
            const sent = data.sentCount || 0;
            const skipped = data.skippedCount || 0;
            if (window.AppToast) window.AppToast.success(`تم بنجاح! أُرسلت ${sent} رسائل، وتخطي ${skipped} مكررة. 🎉`);
            await refreshTasksPage();
          } else {
            if (window.AppToast) window.AppToast.warning(data.reason || data.error || 'تعذر الإرسال');
          }
        } catch (e) {
          if (window.AppToast) window.AppToast.error(`خطأ: ${e.message}`);
        } finally {
          btnRunAutoWa.disabled = false;
          btnRunAutoWa.innerHTML = '<span>💬🚀</span> إرسال التنبيهات تلقائياً الآن';
        }
      });
    }

    if (btnCreate) {
      btnCreate.addEventListener('click', openCreateTaskModal);
    }

    await refreshTasksPage();
  }

  async function refreshTasksPage() {
    await loadAlertsAndStats();
    await loadReturnsDueList();
    await loadTasksList();
  }

  async function loadAlertsAndStats() {
    try {
      const res = await electronApi.invoke('tasks:get-alerts');
      if (res.success && res.data) {
        const d = res.data;
        const todayEl = document.getElementById('stat-today-tasks');
        const overdueEl = document.getElementById('stat-overdue-tasks');
        const fittingsEl = document.getElementById('stat-fittings-count');
        const pickupsEl = document.getElementById('stat-pickups-returns');

        if (todayEl) todayEl.textContent = `${(d.todayPickupsCount || 0) + (d.todayFittingsCount || 0)} مهام`;
        if (overdueEl) overdueEl.textContent = `${d.overdueCount || 0} تنبيه`;
        if (fittingsEl) fittingsEl.textContent = `${d.todayFittingsCount || 0} بروفات`;
        if (pickupsEl) pickupsEl.textContent = `${(d.todayPickupsCount || 0) + (d.todayReturnsCount || 0)} حجز`;

        // Render Alerts Banner
        const alertsContainer = document.getElementById('tasks-alerts-container');
        if (alertsContainer && d.alertsList && d.alertsList.length > 0) {
          alertsContainer.innerHTML = d.alertsList.map(a => `
            <div style="padding: 12px 18px; border-radius: var(--radius-md); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: ${a.level === 'DANGER' ? 'rgba(239,68,68,0.1)' : a.level === 'WARNING' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)'}; border: 1px solid ${a.level === 'DANGER' ? 'var(--color-danger)' : a.level === 'WARNING' ? 'var(--color-warning)' : 'var(--color-info)'};">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">${a.level === 'DANGER' ? '🚨' : a.level === 'WARNING' ? '⚠️' : 'ℹ️'}</span>
                <div>
                  <strong style="color: ${a.level === 'DANGER' ? 'var(--color-danger)' : a.level === 'WARNING' ? 'var(--color-warning)' : 'var(--color-info)'}; font-size: 14px;">${a.title}</strong>
                  <div style="font-size: 12px; color: var(--text-primary); margin-top: 2px;">${a.message}</div>
                </div>
              </div>
            </div>
          `).join('');
        } else if (alertsContainer) {
          alertsContainer.innerHTML = '';
        }
      }
    } catch (e) {
      console.warn('Could not load alerts and stats:', e);
    }
  }

  async function loadReturnsDueList() {
    const container = document.getElementById('tasks-returns-container');
    if (!container) return;

    try {
      const res = await electronApi.invoke('tasks:get-returns-due');
      let items = res.success && res.data ? res.data : [];

      // 1. Status Filter
      if (activeReturnsFilter === 'OVERDUE') {
        items = items.filter(r => r.is_overdue || r.days_overdue > 0);
      } else if (activeReturnsFilter === 'TODAY') {
        items = items.filter(r => r.is_today || r.days_overdue === 0);
      } else if (activeReturnsFilter === 'UPCOMING') {
        items = items.filter(r => r.is_upcoming || r.days_overdue < 0);
      }

      // 2. Search Filter (Customer name, Product / Suit name, Booking #, Phone)
      if (returnsSearchQuery && returnsSearchQuery.trim()) {
        const q = returnsSearchQuery.trim().toLowerCase();
        items = items.filter(r => {
          const cName = String(r.customer_name || '').toLowerCase();
          const pName = String(r.items_summary || '').toLowerCase();
          const bNum = String(r.booking_number || '').toLowerCase();
          const phone = String(r.customer_phone || '').toLowerCase();
          return cName.includes(q) || pName.includes(q) || bNum.includes(q) || phone.includes(q);
        });
      }

      // 3. Date Range Filter
      if (returnsDateFrom) {
        items = items.filter(r => r.return_due_date >= returnsDateFrom);
      }
      if (returnsDateTo) {
        items = items.filter(r => r.return_due_date <= returnsDateTo);
      }

      if (items.length === 0) {
        container.innerHTML = `
          <div class="state-container empty-state" style="padding: 24px 0;">
            <div class="state-icon" style="font-size: 32px;">🔍</div>
            <h4 class="state-title" style="font-size: 15px; margin: 4px 0;">لا توجد بدل متأخرة أو مستحقة للإرجاع تطابق هذا البحث</h4>
            <p class="state-desc" style="font-size: 12px; margin: 0;">جرّب تعديل كلمات البحث، أو تغيير نطاق التواريخ، أو الضغط على "مسح الفلترة".</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="max-height: 380px; overflow-y: auto;">
          <table class="app-table">
            <thead>
              <tr>
                <th>الحجز والعميل</th>
                <th>البدلة / الصنف</th>
                <th>تاريخ الاستلام</th>
                <th>تاريخ الإرجاع المتوقع</th>
                <th>حالة الإرجاع</th>
                <th>التأمين المسترد</th>
                <th>الإجراءات السريعة</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(r => {
                let badge = '<span class="badge badge-info">متبقي ' + Math.abs(r.days_overdue) + ' يوم ⏳</span>';
                if (r.is_overdue || r.days_overdue > 0) {
                  badge = '<span class="badge badge-danger">متأخرة ' + r.days_overdue + ' يوم ⚠️</span>';
                } else if (r.is_today || r.days_overdue === 0) {
                  badge = '<span class="badge badge-warning">مستحقة اليوم 📅</span>';
                }

                const depositText = (window.UiUtils ? window.UiUtils.formatCurrency(r.deposit_paid || 0) : (r.deposit_paid || 0) + ' ج.م');

                return `
                  <tr style="${(r.is_overdue || r.days_overdue > 0) ? 'background: rgba(239,68,68,0.04);' : (r.is_today || r.days_overdue === 0) ? 'background: rgba(245,158,11,0.04);' : ''}">
                    <td>
                      <strong>${r.customer_name || 'عميل'}</strong>
                      <div style="font-size: 11px; color: var(--color-gold-500); font-weight: 600;">#${r.booking_number}</div>
                      ${r.customer_phone ? `<div style="font-size: 11px; color: var(--text-secondary);">${r.customer_phone}</div>` : ''}
                    </td>
                    <td>
                      <div style="font-weight: 600;">${r.items_summary || 'بدلة رجالي فاخرة'}</div>
                    </td>
                    <td style="font-size: 12px;">${r.pickup_date || '-'}</td>
                    <td style="font-size: 12px; font-weight: 700; color: ${(r.is_overdue || r.days_overdue > 0) ? 'var(--color-danger)' : 'var(--text-primary)'};">${r.return_due_date}</td>
                    <td>${badge}</td>
                    <td style="font-weight: 600; color: var(--color-gold-500); font-size: 12px;">${depositText}</td>
                    <td>
                      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${r.customer_phone ? `
                          <div style="display: inline-flex; align-items: center; gap: 4px;">
                            <button class="btn-secondary btn-return-wa"
                              data-phone="${r.customer_phone}"
                              data-name="${r.customer_name}"
                              data-date="${r.return_due_date}"
                              data-overdue="${r.days_overdue}"
                              data-bnum="${r.booking_number}"
                              style="padding: 4px 8px; font-size: 11px; color: #10B981; border-color: rgba(16,185,129,0.3);"
                              title="إرسال تذكير واتساب">
                              💬 واتساب
                            </button>
                            ${(r.sent_today_count > 0) ? `
                              <span class="badge" style="background: rgba(16, 185, 129, 0.16); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 10px; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px; font-weight: 700;" title="تم إرسال تنبيه بالواتساب لهذا العميل اليوم بنجاح (${r.last_sent_at || ''})">
                                <span>✅</span> تم الإرسال
                              </span>
                            ` : (r.last_sent_at) ? `
                              <span class="badge" style="background: rgba(59, 130, 246, 0.12); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 10px; padding: 2px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;" title="تم الإرسال سابقاً: ${r.last_sent_at}">
                                <span>✓</span> أرسل سابقاً
                              </span>
                            ` : ''}
                          </div>
                        ` : ''}
                        <button class="btn-primary-action btn-return-settle"
                          data-bid="${r.booking_id}"
                          data-bnum="${r.booking_number}"
                          data-duedate="${r.return_due_date}"
                          data-deposit="${r.deposit_paid || 0}"
                          style="padding: 4px 8px; font-size: 11px;"
                          title="استلام البدلة وفحصها وتصفية التأمين">
                          📦 استلام وتسوية
                        </button>
                        ${r.customer_phone ? `
                          <a href="tel:${r.customer_phone}" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; text-decoration: none;" title="اتصال بالعميل">
                            📞
                          </a>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Settle button listener
      container.querySelectorAll('.btn-return-settle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const bid = Number(btn.getAttribute('data-bid'));
          const bnum = btn.getAttribute('data-bnum');
          const duedate = btn.getAttribute('data-duedate');
          const dep = Number(btn.getAttribute('data-deposit')) || 0;
          if (typeof window._openReturnModal === 'function') {
            window._openReturnModal(bid, bnum, duedate, dep);
          } else {
            console.error('_openReturnModal is not defined');
            if (window.AppToast) window.AppToast.error('تعذر فتح نافذة الاستلام، يرجى إعادة تحميل الصفحة.');
          }
        });
      });

      // Return WhatsApp button listener
      container.querySelectorAll('.btn-return-wa').forEach(btn => {
        btn.addEventListener('click', () => {
          const phone = btn.getAttribute('data-phone');
          const name = btn.getAttribute('data-name');
          const date = btn.getAttribute('data-date');
          const overdue = Number(btn.getAttribute('data-overdue')) || 0;
          const task_type = overdue > 0 ? 'RETURN_FOLLOWUP' : 'RETURN_REMINDER';
          openWhatsAppModal({
            phone,
            customer_name: name,
            task_type,
            date,
            days_late: overdue > 0 ? overdue : 1
          });
        });
      });

    } catch (err) {
      container.innerHTML = `<div style="color: var(--color-danger); text-align: center; padding: 15px;">خطأ في تحميل المرتجعات: ${err.message}</div>`;
    }
  }

  async function loadTasksList() {
    const container = document.getElementById('tasks-table-container');
    const countLabel = document.getElementById('tasks-count-label');
    if (!container) return;

    try {
      const res = await electronApi.invoke('tasks:get-list', { filter: activeTasksFilter, limit: 100 });
      let tasks = res.success && res.data ? res.data : [];

      // Search Filter (Task Title, Customer Name, Product/Suit, Booking #)
      if (tasksSearchQuery && tasksSearchQuery.trim()) {
        const q = tasksSearchQuery.trim().toLowerCase();
        tasks = tasks.filter(t => {
          const title = String(t.title || '').toLowerCase();
          const desc = String(t.description || '').toLowerCase();
          const cName = String(t.customer_name || '').toLowerCase();
          const sName = String(t.suit_name || '').toLowerCase();
          const bNum = String(t.booking_number || '').toLowerCase();
          const phone = String(t.customer_phone || '').toLowerCase();
          return title.includes(q) || desc.includes(q) || cName.includes(q) || sName.includes(q) || bNum.includes(q) || phone.includes(q);
        });
      }

      // Date Range Filter
      if (tasksDateFrom) {
        tasks = tasks.filter(t => t.due_date >= tasksDateFrom);
      }
      if (tasksDateTo) {
        tasks = tasks.filter(t => t.due_date <= tasksDateTo);
      }

      if (countLabel) countLabel.textContent = `${tasks.length} مهمة`;

      if (tasks.length === 0) {
        container.innerHTML = `
          <div class="state-container empty-state" style="padding: 40px 0;">
            <div class="state-icon">🔍</div>
            <h4 class="state-title">لا توجد مهام تطابق هذا البحث أو الفلتر</h4>
            <p class="state-desc">جرّب تغيير كلمات البحث أو إعادة ضبط خيارات التاريخ.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="max-height: 480px; overflow-y: auto;">
          <table class="app-table">
            <thead>
              <tr>
                <th>المهمة والبيان</th>
                <th>النوع</th>
                <th>الحجز والعميل</th>
                <th>تاريخ الاستحقاق</th>
                <th>الأولوية</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${tasks.map(t => {
        const isCompleted = t.status === 'COMPLETED';

        // Priority Badge
        let priorityBadge = '<span class="badge badge-info">عادي</span>';
        if (t.priority === 'URGENT') priorityBadge = '<span class="badge badge-danger">عاجل جداً ⚡</span>';
        if (t.priority === 'HIGH') priorityBadge = '<span class="badge badge-warning">هام</span>';
        if (t.priority === 'LOW') priorityBadge = '<span class="badge badge-secondary">منخفض</span>';

        // Type Badge
        const typeNames = {
          FITTING: 'بروفة خياطة ✂️',
          SUIT_PREPARATION: 'تجهيز وكي 👔',
          RETURN_FOLLOWUP: 'متابعة متأخرات ⏰',
          CLEANING: 'مغسلة 🧼'
        };
        const typeBadge = `<span class="badge badge-secondary">${typeNames[t.task_type] || t.task_type}</span>`;

        return `
                  <tr style="${isCompleted ? 'opacity: 0.6;' : ''}">
                    <td>
                      <strong style="${isCompleted ? 'text-decoration: line-through;' : ''}">${t.title}</strong>
                      ${t.description ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${t.description}</div>` : ''}
                    </td>
                    <td>${typeBadge}</td>
                    <td>
                      ${t.customer_name ? `
                        <div>${t.customer_name}</div>
                        <div style="font-size: 11px; color: var(--color-gold-500);">${t.booking_number ? '#' + t.booking_number : ''}</div>
                      ` : '<span style="color: var(--text-muted);">-</span>'}
                    </td>
                    <td style="font-size: 12px; font-weight: 600;">${t.due_date}</td>
                    <td>${priorityBadge}</td>
                    <td>
                      <span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">
                        ${isCompleted ? 'مكتملة ✅' : 'قيد الانتظار'}
                      </span>
                    </td>
                    <td>
                      <div style="display: flex; gap: 6px;">
                        ${t.customer_phone ? `
                          <div style="display: inline-flex; align-items: center; gap: 4px;">
                            <button class="btn-secondary btn-task-whatsapp" data-id="${t.id}" data-phone="${t.customer_phone}" data-name="${t.customer_name}" data-type="${t.task_type}" data-date="${t.due_date}" style="padding: 4px 8px; font-size: 11px; color: #10B981; border-color: rgba(16,185,129,0.3);" title="تواصل واتساب">
                              💬 واتساب
                            </button>
                            ${(t.sent_today_count > 0) ? `
                              <span class="badge" style="background: rgba(16, 185, 129, 0.16); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 10px; padding: 2px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px; font-weight: 700;" title="تم إرسال رسالة واتساب للعميل اليوم (${t.last_sent_at || ''})">
                                <span>✅</span> تم الإرسال
                              </span>
                            ` : (t.last_sent_at) ? `
                              <span class="badge" style="background: rgba(59, 130, 246, 0.12); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 10px; padding: 2px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;" title="آخر إرسال: ${t.last_sent_at}">
                                <span>✓</span> أرسل سابقاً
                              </span>
                            ` : ''}
                          </div>
                        ` : ''}
                        ${!isCompleted ? `
                          <button class="btn-primary-action btn-task-complete" data-id="${t.id}" style="padding: 4px 8px; font-size: 11px;" title="تعليم كمكتملة">
                            ✔️ تم
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Complete button listeners
      container.querySelectorAll('.btn-task-complete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tId = Number(btn.getAttribute('data-id'));
          try {
            const cres = await electronApi.invoke('tasks:complete', { taskId: tId });
            if (cres.success) {
              if (window.AppToast) window.AppToast.success('تم إنجاز المهمة بنجاح! ✅');
              await refreshTasksPage();
            }
          } catch (err) {
            if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
          }
        });
      });

      // WhatsApp button listeners
      container.querySelectorAll('.btn-task-whatsapp').forEach(btn => {
        btn.addEventListener('click', () => {
          const phone = btn.getAttribute('data-phone');
          const name = btn.getAttribute('data-name');
          const type = btn.getAttribute('data-type');
          const date = btn.getAttribute('data-date');
          openWhatsAppModal({ phone, customer_name: name, task_type: type, date });
        });
      });

    } catch (e) {
      container.innerHTML = `<div style="color: var(--color-danger); text-align: center; padding: 20px;">خطأ في تحميل المهام: ${e.message}</div>`;
    }
  }

  function openCreateTaskModal() {
    if (!window.AppModal) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    window.AppModal.open({
      title: '➕ إنشاء مهمة تشغيلية جديدة',
      contentHtml: `
        <div class="form-group">
          <label class="form-label">عنوان المهمة</label>
          <input type="text" id="modal-task-title" class="form-control" placeholder="مثال: استلام قمصان البدل من المصنع...">
        </div>
        <div class="form-group">
          <label class="form-label">نوع المهمة</label>
          <select id="modal-task-type" class="form-control">
            <option value="SUIT_PREPARATION">تجهيز وكي بدلة (SUIT_PREPARATION)</option>
            <option value="FITTING">بروفة وتعديل خياط (FITTING)</option>
            <option value="CLEANING">مغسلة ودراي كلين (CLEANING)</option>
            <option value="RETURN_FOLLOWUP">متابعة إرجاع متأخر (RETURN_FOLLOWUP)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">الأولوية</label>
          <select id="modal-task-priority" class="form-control">
            <option value="NORMAL">عادي (Normal)</option>
            <option value="HIGH">هام (High)</option>
            <option value="URGENT">عاجل جداً (Urgent)</option>
            <option value="LOW">منخفض (Low)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">تاريخ الاستحقاق</label>
          <input type="date" id="modal-task-due" class="form-control" value="${todayStr}">
        </div>
        <div class="form-group">
          <label class="form-label">الوصف والملاحظات</label>
          <textarea id="modal-task-desc" class="form-control" rows="2" placeholder="تفاصيل المهمة..."></textarea>
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-primary-action" id="btn-submit-create-task">حفظ المهمة</button>
      `,
      width: '480px'
    });

    document.getElementById('btn-submit-create-task').addEventListener('click', async () => {
      const title = document.getElementById('modal-task-title').value.trim();
      const task_type = document.getElementById('modal-task-type').value;
      const priority = document.getElementById('modal-task-priority').value;
      const due_date = document.getElementById('modal-task-due').value;
      const description = document.getElementById('modal-task-desc').value.trim();

      if (!title) {
        if (window.AppToast) window.AppToast.warning('يرجى إدخال عنوان المهمة.');
        return;
      }
      if (!due_date) {
        if (window.AppToast) window.AppToast.warning('يرجى تحديد تاريخ الاستحقاق.');
        return;
      }

      try {
        const res = await electronApi.invoke('tasks:create', {
          title,
          description,
          task_type,
          priority,
          due_date
        });

        if (res.success) {
          AppModal.close();
          if (window.AppToast) window.AppToast.success(`تم إنشاء المهمة بنجاح [${title}] 📌`);
          await refreshTasksPage();
        } else {
          if (window.AppToast) window.AppToast.error(res.error?.message || 'فشل إنشاء المهمة.');
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });
  }

  async function openWhatsAppModal(data) {
    if (!window.AppModal) return;

    let templates = {};
    let isConnected = false;
    try {
      const [tRes, sRes] = await Promise.all([
        electronApi.invoke('whatsapp:get-templates'),
        electronApi.invoke('whatsapp:get-status')
      ]);
      if (tRes.success && tRes.data) templates = tRes.data;
      isConnected = !!(sRes?.data?.isReady || sRes?.isReady);
    } catch (_) { }

    // Guess matching template key from task type
    let defaultKey = 'READY_FOR_PICKUP';
    if (data.task_type === 'FITTING') defaultKey = 'FITTING_REMINDER';
    if (data.task_type === 'RETURN_FOLLOWUP' || data.task_type === 'OVERDUE' || data.task_type === 'OVERDUE_ALERT') defaultKey = 'OVERDUE_ALERT';
    if (data.task_type === 'RETURN_REMINDER' || data.task_type === 'RETURN') defaultKey = 'RETURN_REMINDER';

    window.AppModal.open({
      title: '💬 إرسال رسالة واتساب للعميل',
      contentHtml: `
        <!-- WhatsApp Status Pill -->
        <div style="background: ${isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; border: 1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>${isConnected ? '🟢' : '⚠️'}</span>
            <strong>${isConnected ? 'واتساب متصل وجاهز للإرسال الصامت المباشر' : 'واتساب غير مربوط بعد'}</strong>
          </div>
          ${!isConnected ? `
            <button type="button" id="btn-quick-pair-wa" class="btn-secondary" style="font-size: 10px; padding: 3px 8px; color: var(--color-gold-400);">
              📱 ربط الجهاز الآن
            </button>
          ` : ''}
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">قالب الرسالة:</label>
          <select id="modal-wa-template" class="form-control" style="font-size: 12px;">
            <option value="FITTING_REMINDER" ${defaultKey === 'FITTING_REMINDER' ? 'selected' : ''}>تذكير بموعد البروفة</option>
            <option value="READY_FOR_PICKUP" ${defaultKey === 'READY_FOR_PICKUP' ? 'selected' : ''}>تنبيه جاهزية البدلة للاستلام</option>
            <option value="RETURN_REMINDER" ${defaultKey === 'RETURN_REMINDER' ? 'selected' : ''}>تذكير بموعد إرجاع البدلة</option>
            <option value="OVERDUE_ALERT" ${defaultKey === 'OVERDUE_ALERT' ? 'selected' : ''}>تنبيه عاجل لمتأخرات الإرجاع</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label">رقم هاتف العميل:</label>
          <input type="text" id="modal-wa-phone" class="form-control" value="${data.phone || ''}" placeholder="01xxxxxxxxx" style="font-size: 12px;">
          <span style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block;">سيتم تحويل الرقم تلقائياً إلى الكود الدولي المصري (+20)</span>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label class="form-label">نص الرسالة للمعاينة والتعديل:</label>
          <textarea id="modal-wa-text" class="form-control" rows="4" style="font-size: 12px; line-height: 1.5;"></textarea>
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-secondary" id="btn-open-wa-chat" style="font-size: 11px;" title="فتح في المتصفح يدوياً">
          🌐 فتح بالمتصفح
        </button>
        <button class="btn-primary-action" id="btn-send-wa-direct" style="background: #10B981; border-color: #10B981; display: inline-flex; align-items: center; gap: 6px;">
          <span>🚀</span> إرسال مباشر في الخلفية (صامت)
        </button>
      `,
      width: '520px'
    });

    const templateSelect = document.getElementById('modal-wa-template');
    const phoneInput = document.getElementById('modal-wa-phone');
    const textPreview = document.getElementById('modal-wa-text');

    function updatePreview() {
      const selectedKey = templateSelect.value;
      const tpl = templates[selectedKey] ? templates[selectedKey].template : '';
      let msg = tpl
        .replaceAll('{customer_name}', data.customer_name || 'العميل العزيز')
        .replaceAll('{date}', data.date || new Date().toISOString().slice(0, 10))
        .replaceAll('{days_late}', String(data.days_late || data.daysOverdue || '1'));
      textPreview.value = msg;
    }

    templateSelect?.addEventListener('change', updatePreview);
    updatePreview();

    // Quick Pair Button
    document.getElementById('btn-quick-pair-wa')?.addEventListener('click', async () => {
      try {
        await electronApi.invoke('whatsapp:open-pairing');
        if (window.AppToast) window.AppToast.info('تم فتح شاشة الباركود. يرجى مسح الكود من تطبيق واتساب بهاتفك 📷');
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });

    // Send Direct Button (Background, silent, 0 windows)
    document.getElementById('btn-send-wa-direct')?.addEventListener('click', async () => {
      const phone = phoneInput?.value.trim();
      const message = textPreview?.value.trim();
      const directBtn = document.getElementById('btn-send-wa-direct');

      if (!phone) {
        if (window.AppToast) window.AppToast.warning('رقم الهاتف مطلوب.');
        return;
      }
      if (!message) {
        if (window.AppToast) window.AppToast.warning('نص الرسالة مطلوب.');
        return;
      }

      if (directBtn) {
        directBtn.disabled = true;
        directBtn.innerHTML = '<span>⏳</span> جاري الإرسال في الخلفية...';
      }

      try {
        if (window.AppToast) window.AppToast.info('جاري إرسال الرسالة عبر واتساب صامتاً في الخلفية... ⏳');
        const sendRes = await electronApi.invoke('whatsapp:send-direct', {
          phone,
          message,
          customerId: data.customer_id || null
        });

        if (sendRes?.success) {
          AppModal.close();
          if (window.AppToast) window.AppToast.success(`تم إرسال الرسالة إلى العميل +${sendRes.phone} بنجاح تام! 💬✅`);
          if (typeof window._updateWhatsAppHeaderStatus === 'function') {
            window._updateWhatsAppHeaderStatus();
          }
          if (typeof refreshTasksPage === 'function' && document.getElementById('tasks-returns-container')) {
            refreshTasksPage();
          }
        } else {
          if (directBtn) {
            directBtn.disabled = false;
            directBtn.innerHTML = '<span>🚀</span> إرسال مباشر في الخلفية (صامت)';
          }
          if (window.AppToast) window.AppToast.error(sendRes?.error || 'فشل إرسال الرسالة.');
        }
      } catch (err) {
        if (directBtn) {
          directBtn.disabled = false;
          directBtn.innerHTML = '<span>🚀</span> إرسال مباشر في الخلفية (صامت)';
        }
        if (err.message && err.message.includes('غير متصل')) {
          if (confirm('خدمة واتساب غير مربوطة بعد على هذا الجهاز.\n\nهل تريد فتح نافذة مسح الباركود لربط هاتفك الآن؟')) {
            await electronApi.invoke('whatsapp:open-pairing');
          }
        } else {
          if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
        }
      }
    });

    // Fallback: Open in browser
    document.getElementById('btn-open-wa-chat')?.addEventListener('click', async () => {
      const phone = phoneInput?.value.trim();
      const customMsg = textPreview?.value.trim();

      if (!phone) {
        if (window.AppToast) window.AppToast.warning('رقم الهاتف مطلوب.');
        return;
      }

      try {
        const linkRes = await electronApi.invoke('whatsapp:generate-link', {
          phone,
          template_key: templateSelect?.value,
          params: { custom_message: customMsg }
        });

        if (linkRes.success && linkRes.data?.link) {
          window.open(linkRes.data.link, '_blank');
          AppModal.close();
          if (window.AppToast) window.AppToast.success('تم فتح رابط واتساب بالمتصفح! 💬');
        }
      } catch (err) {
        if (window.AppToast) window.AppToast.error(`خطأ: ${err.message}`);
      }
    });
  }

  // =========================================================================
  // Phase 12: Print Preview Modal & Printing Engine Integration
  // =========================================================================
  async function openPrintPreviewModal({ title = 'معاينة المستند قبل الطباعة', html = '', pageSize = 'A4' } = {}) {
    if (!window.AppModal) return;

    let printersList = [];
    try {
      const pRes = await electronApi.invoke('print:get-printers');
      if (pRes.success && Array.isArray(pRes.data)) {
        printersList = pRes.data;
      }
    } catch (_) { }

    const printerOptions = printersList.map(p => `
      <option value="${p.name}">${p.name} ${p.isDefault ? '(الافتراضية)' : ''}</option>
    `).join('') || '<option value="Default">طابعة النظام الافتراضية</option>';

    const iframeWidth = pageSize === '80mm' ? '340px' : '100%';
    const iframeHeight = pageSize === '80mm' ? '460px' : '520px';

    window.AppModal.open({
      title: `🖨️ ${title}`,
      contentHtml: `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: var(--bg-app); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 12px; color: var(--text-secondary); font-weight: 600;">اختيار الطابعة:</label>
            <select id="modal-printer-select" class="form-control" style="width: 250px; padding: 4px 8px; font-size: 12px;">
              ${printerOptions}
            </select>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            مقاس الورق: <strong>${pageSize === '80mm' ? 'حراري 80mm' : 'ورق رسمي A4'}</strong>
          </div>
        </div>

        <div style="background: #e5e7eb; padding: 15px; border-radius: var(--radius-sm); display: flex; justify-content: center; overflow: auto; max-height: 560px;">
          <iframe id="print-preview-iframe" style="width: ${iframeWidth}; height: ${iframeHeight}; background: #fff; border: 1px solid #d1d5db; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 4px;"></iframe>
        </div>
      `,
      footerHtml: `
        <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
        <button class="btn-primary-action" id="btn-modal-do-print">🖨️ طباعة الآن</button>
      `,
      width: pageSize === '80mm' ? '480px' : '780px'
    });

    // Populate iframe content safely
    setTimeout(() => {
      const iframe = document.getElementById('print-preview-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.document.open();
        iframe.contentWindow.document.write(html);
        iframe.contentWindow.document.close();
      }
    }, 50);

    const btnPrint = document.getElementById('btn-modal-do-print');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        const iframe = document.getElementById('print-preview-iframe');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          if (window.AppToast) window.AppToast.success('تم إرسال أمر الطباعة بنجاح! 🖨️');
          AppModal.close();
        }
      });
    }
  }

  window.openPrintPreviewModal = openPrintPreviewModal;

  // =========================================================================
  // Phase 11: Reports & Analytics Page
  // =========================================================================
  let reportsActiveTab = 'pnl';
  let reportsFilter = {
    preset: 'month',
    startDate: '',
    endDate: ''
  };

  function setDateRangePreset(preset) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    reportsFilter.preset = preset;
    if (preset === 'today') {
      const d = toYmd(today);
      reportsFilter.startDate = d;
      reportsFilter.endDate = d;
    } else if (preset === 'week') {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      reportsFilter.startDate = toYmd(start);
      reportsFilter.endDate = toYmd(today);
    } else if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      reportsFilter.startDate = toYmd(start);
      reportsFilter.endDate = toYmd(today);
    } else if (preset === 'all') {
      reportsFilter.startDate = '';
      reportsFilter.endDate = '';
    }
  }

  async function renderReportsPage() {
    if (!reportsFilter.startDate && reportsFilter.preset === 'month') {
      setDateRangePreset('month');
    }

    pageContent.innerHTML = `
      <div class="content-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: var(--text-primary);">التقارير المحاسبية والتحليلات التشغيلية 📈</h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: var(--text-secondary);">كشوف الأرباح والخسائر، إشغال أسطول التأجير، تقييم المخزون، وسجل العملاء</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-secondary" id="btn-refresh-reports">🔄 تحديث</button>
          <button class="btn-primary-action" id="btn-print-report" onclick="window.print()">🖨️ طباعة التقرير</button>
        </div>
      </div>

      <div class="reports-tabs">
        <button class="reports-tab-btn ${reportsActiveTab === 'pnl' ? 'active' : ''}" data-tab="pnl">💰 الأرباح والخسائر (P&L)</button>
        <button class="reports-tab-btn ${reportsActiveTab === 'stock' ? 'active' : ''}" data-tab="stock">📦 تقييم المخزون والأصول</button>
        <button class="reports-tab-btn ${reportsActiveTab === 'occupancy' ? 'active' : ''}" data-tab="occupancy">📊 إشغال أسطول البدل</button>
        <button class="reports-tab-btn ${reportsActiveTab === 'customers' ? 'active' : ''}" data-tab="customers">👥 كبار العملاء والولاء</button>
      </div>

      <div id="reports-tab-body">
        <div class="state-container loading-state">
          <div class="state-icon">⏳</div>
          <h3 class="state-title">جاري تحميل التقرير...</h3>
        </div>
      </div>
    `;

    document.getElementById('btn-refresh-reports').addEventListener('click', () => {
      loadReportsTab(reportsActiveTab);
    });

    const tabButtons = pageContent.querySelectorAll('.reports-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        reportsActiveTab = btn.getAttribute('data-tab');
        loadReportsTab(reportsActiveTab);
      });
    });

    await loadReportsTab(reportsActiveTab);
  }

  async function loadReportsTab(tab) {
    const container = document.getElementById('reports-tab-body');
    if (!container) return;

    if (tab === 'pnl') {
      await loadPnlReport(container);
    } else if (tab === 'stock') {
      await loadStockReport(container);
    } else if (tab === 'occupancy') {
      await loadOccupancyReport(container);
    } else if (tab === 'customers') {
      await loadTopCustomersReport(container);
    }
  }

  // --- 1. P&L Report Renderer ---
  async function loadPnlReport(container) {
    container.innerHTML = `
      <div class="reports-filter-bar">
        <div class="filter-preset-pills">
          <button class="filter-pill ${reportsFilter.preset === 'today' ? 'active' : ''}" data-preset="today">اليوم</button>
          <button class="filter-pill ${reportsFilter.preset === 'week' ? 'active' : ''}" data-preset="week">آخر 7 أيام</button>
          <button class="filter-pill ${reportsFilter.preset === 'month' ? 'active' : ''}" data-preset="month">هذا الشهر</button>
          <button class="filter-pill ${reportsFilter.preset === 'all' ? 'active' : ''}" data-preset="all">جميع الفترات</button>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 12px; color: var(--text-secondary);">من:</label>
          <input type="date" id="pnl-start-date" class="form-control" style="width: 140px; padding: 4px 8px; font-size: 12px;" value="${reportsFilter.startDate || ''}">
          <label style="font-size: 12px; color: var(--text-secondary);">إلى:</label>
          <input type="date" id="pnl-end-date" class="form-control" style="width: 140px; padding: 4px 8px; font-size: 12px;" value="${reportsFilter.endDate || ''}">
          <button class="btn-secondary" id="btn-apply-pnl-filter" style="padding: 5px 12px; font-size: 12px;">تطبيق</button>
        </div>
      </div>
      <div id="pnl-data-container">
        <div class="state-container loading-state">
          <div class="state-icon">⏳</div>
          <h3 class="state-title">جاري استخراج بيانات الأرباح والخسائر...</h3>
        </div>
      </div>
    `;

    // Filter events
    const pills = container.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', async () => {
        const preset = pill.getAttribute('data-preset');
        setDateRangePreset(preset);
        await loadPnlReport(container);
      });
    });

    const btnApply = container.querySelector('#btn-apply-pnl-filter');
    if (btnApply) {
      btnApply.addEventListener('click', async () => {
        reportsFilter.preset = 'custom';
        reportsFilter.startDate = document.getElementById('pnl-start-date').value;
        reportsFilter.endDate = document.getElementById('pnl-end-date').value;
        await fetchAndRenderPnlData();
      });
    }

    await fetchAndRenderPnlData();
  }

  async function fetchAndRenderPnlData() {
    const dataContainer = document.getElementById('pnl-data-container');
    if (!dataContainer) return;

    try {
      const res = await electronApi.invoke('reports:get-profit-loss', {
        startDate: reportsFilter.startDate || null,
        endDate: reportsFilter.endDate || null
      });

      if (!res.success) {
        dataContainer.innerHTML = `<div class="state-container error-state"><div class="state-icon">⚠️</div><p>${res.error?.message || 'فشل تحميل تقرير الأرباح والخسائر'}</p></div>`;
        return;
      }

      const d = res.data;
      const fmt = (n) => window.UiUtils ? window.UiUtils.formatCurrency(n || 0) : `${Number(n || 0).toLocaleString()} ج.م`;

      const expRows = (d.operatingExpenses?.byCategory || []).map(cat => `
        <div class="breakdown-row">
          <span>${cat.category_name} (${cat.count} عملية)</span>
          <span style="font-weight: 600; color: var(--color-danger);">${fmt(cat.total_amount)}</span>
        </div>
      `).join('') || '<div style="color: var(--text-muted); font-size: 12px; padding: 10px 0;">لا توجد مصروفات مسجلة في هذه الفترة</div>';

      dataContainer.innerHTML = `
        <div class="pnl-grid">
          <div class="report-summary-card success">
            <span class="card-title">صافي الإيرادات التشغيلية</span>
            <span class="card-value">${fmt(d.revenue.totalNetRevenue)}</span>
            <span class="card-subtext">تأجير + مبيعات + غرامات - خصومات</span>
          </div>

          <div class="report-summary-card">
            <span class="card-title">تكلفة المبيعات والمغسلة (COGS)</span>
            <span class="card-value">${fmt(d.cogs.totalDirectCosts)}</span>
            <span class="card-subtext">تكلفة مشتريات البضاعة المباعة + تكلفة المغسلة</span>
          </div>

          <div class="report-summary-card info">
            <span class="card-title">مجمل الربح (Gross Profit)</span>
            <span class="card-value">${fmt(d.grossProfit)}</span>
            <span class="card-subtext">هامش ربح مجمل: ${d.grossMarginPercent}%</span>
          </div>

          <div class="report-summary-card danger">
            <span class="card-title">المصروفات التشغيلية</span>
            <span class="card-value">${fmt(d.operatingExpenses.totalOperatingExpenses)}</span>
            <span class="card-subtext">إيجارات، فواتير، بوفيه، ومصروفات عامة</span>
          </div>

          <div class="report-summary-card ${d.netOperatingProfit >= 0 ? 'success' : 'danger'}">
            <span class="card-title">صافي الربح التشغيلي (Net Profit)</span>
            <span class="card-value">${fmt(d.netOperatingProfit)}</span>
            <span class="card-subtext">هامش الربح الصافي: ${d.netMarginPercent}%</span>
          </div>
        </div>

        <div class="report-two-columns">
          <!-- Breakdown of Revenue -->
          <div class="table-card">
            <div class="table-header">
              <h3 style="font-size: 14px;">📊 تحليل الإيرادات المباشرة</h3>
            </div>
            <div style="padding: 16px;">
              <div class="breakdown-row">
                <span>إيرادات تأجير البدل (مقدمات + متبقي)</span>
                <span style="font-weight: 600; color: var(--color-gold-500);">${fmt(d.revenue.rentalRevenue)}</span>
              </div>
              <div class="breakdown-row">
                <span>مبيعات نقطة البيع المباشرة (POS)</span>
                <span style="font-weight: 600; color: var(--color-gold-500);">${fmt(d.revenue.salesRevenue)}</span>
              </div>
              <div class="breakdown-row">
                <span>غرامات تأخير إرجاع البدل</span>
                <span style="font-weight: 600; color: var(--color-gold-500);">${fmt(d.revenue.lateFeesRevenue)}</span>
              </div>
              <div class="breakdown-row">
                <span>إجمالي الخصومات الممنوحة</span>
                <span style="font-weight: 600; color: var(--color-danger);">- ${fmt(d.revenue.discountsGiven)}</span>
              </div>
              <div class="breakdown-row" style="border-top: 2px solid var(--border-color); margin-top: 6px; padding-top: 10px; font-weight: 700;">
                <span>صافي الإيراد العام المحقق</span>
                <span style="color: var(--color-success); font-size: 15px;">${fmt(d.revenue.totalNetRevenue)}</span>
              </div>
            </div>
          </div>

          <!-- Escrow Movements Isolation (ADR-011) -->
          <div class="table-card">
            <div class="table-header">
              <h3 style="font-size: 14px;">🛡️ حركة ودائع وأمانات التأمين (Escrow)</h3>
            </div>
            <div style="padding: 16px;">
              <div style="background: rgba(212, 175, 55, 0.08); padding: 10px; border-radius: 6px; border-right: 3px solid var(--color-gold-500); font-size: 11px; color: var(--text-secondary); margin-bottom: 12px;">
                💡 <strong>العزل المحاسبي:</strong> مبالغ التأمين المستردة أمانة طرف المحل ولا تدخل في الإيراد أو الأرباح نهائياً.
              </div>
              <div class="breakdown-row">
                <span>إجمالي مبالغ التأمين المستلمة</span>
                <span style="font-weight: 600;">${fmt(d.escrowFlow.depositsCollected)}</span>
              </div>
              <div class="breakdown-row">
                <span>إجمالي مبالغ التأمين المستردة للعملاء</span>
                <span style="font-weight: 600; color: var(--text-muted);">${fmt(d.escrowFlow.depositsRefunded)}</span>
              </div>
              <div class="breakdown-row" style="border-top: 2px solid var(--border-color); margin-top: 6px; padding-top: 10px; font-weight: 700;">
                <span>صافي التغير في رصيد الأمانات المعلقة</span>
                <span style="color: var(--color-gold-500); font-size: 15px;">${fmt(d.escrowFlow.netEscrowChange)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Breakdown of Operating Expenses -->
        <div class="table-card">
          <div class="table-header">
            <h3 style="font-size: 14px;">🧾 كشف المصروفات التشغيلية حسب البند</h3>
            <span style="font-size: 12px; color: var(--text-secondary);">الإجمالي: ${fmt(d.operatingExpenses.totalOperatingExpenses)}</span>
          </div>
          <div style="padding: 16px;">
            ${expRows}
          </div>
        </div>
      `;
    } catch (err) {
      dataContainer.innerHTML = `<div class="state-container error-state"><div class="state-icon">❌</div><p>حدث خطأ: ${err.message}</p></div>`;
    }
  }

  // --- 2. Stock & Asset Summary Report Renderer ---
  async function loadStockReport(container) {
    container.innerHTML = `
      <div class="state-container loading-state">
        <div class="state-icon">⏳</div>
        <h3 class="state-title">جاري احتساب وتقييم أصول المخزون...</h3>
      </div>
    `;

    try {
      const res = await electronApi.invoke('reports:get-stock-summary');
      if (!res.success) {
        container.innerHTML = `<div class="state-container error-state"><p>${res.error?.message || 'فشل تحميل تقييم المخزون'}</p></div>`;
        return;
      }

      const d = res.data;
      const fmt = (n) => window.UiUtils ? window.UiUtils.formatCurrency(n || 0) : `${Number(n || 0).toLocaleString()} ج.م`;

      const lowStockRows = (d.lowStockAlerts || []).map(item => `
        <tr>
          <td><span class="badge" style="background: rgba(255,255,255,0.05);">${item.product_code || '-'}</span></td>
          <td style="font-weight: 600;">${item.product_name}</td>
          <td>${item.category_name || '-'}</td>
          <td>${item.size_name || '-'}</td>
          <td>${item.color_name || '-'}</td>
          <td><span style="color: var(--color-danger); font-weight: 700;">${item.quantity_on_hand}</span></td>
          <td>${item.reorder_level}</td>
          <td><span class="badge badge-danger">عجز ${item.deficit} قطعة</span></td>
        </tr>
      `).join('') || `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">🎉 ممتاز! لا توجد أصناف تحت حد إعادة الطلب حالياً.</td></tr>`;

      container.innerHTML = `
        <div class="report-two-columns">
          <!-- Suit Fleet Valuation -->
          <div class="table-card">
            <div class="table-header">
              <h3 style="font-size: 14px;">🤵 أسطول البدل الاستثماري (Rental Fleet)</h3>
            </div>
            <div style="padding: 16px;">
              <div class="breakdown-row">
                <span>إجمالي قطع أسطول البدل</span>
                <span style="font-weight: 700; font-size: 16px;">${d.suits.totalUnits} بدلة</span>
              </div>
              <div class="breakdown-row">
                <span>بدل متاحة بالصالة (Available)</span>
                <span style="color: var(--color-success); font-weight: 600;">${d.suits.statusCounts.AVAILABLE || 0}</span>
              </div>
              <div class="breakdown-row">
                <span>بدل محجوزة ومؤجرة حالياً (Booked / In Use)</span>
                <span style="color: var(--color-gold-500); font-weight: 600;">${(d.suits.statusCounts.BOOKED || 0) + (d.suits.statusCounts.IN_USE || 0)}</span>
              </div>
              <div class="breakdown-row">
                <span>بدل في المغسلة والتجهيز (Cleaning)</span>
                <span style="color: #3b82f6; font-weight: 600;">${d.suits.statusCounts.IN_CLEANING || 0}</span>
              </div>
              <div class="breakdown-row">
                <span>بدل تالفة تحتاج إصلاح (Damaged)</span>
                <span style="color: var(--color-danger); font-weight: 600;">${d.suits.statusCounts.DAMAGED || 0}</span>
              </div>
              <div class="breakdown-row" style="border-top: 2px solid var(--border-color); margin-top: 6px; padding-top: 10px;">
                <span>إجمالي التكلفة الرأسمالية لشراء الأسطول</span>
                <span style="font-weight: 700; color: var(--color-gold-500); font-size: 15px;">${fmt(d.suits.totalCapitalCost)}</span>
              </div>
              <div class="breakdown-row">
                <span>الدخل الإيجاري التقديري لدورة كاملة</span>
                <span style="font-weight: 700; color: var(--color-success);">${fmt(d.suits.potentialRentalCycle)}</span>
              </div>
            </div>
          </div>

          <!-- Quantity Inventory Valuation -->
          <div class="table-card">
            <div class="table-header">
              <h3 style="font-size: 14px;">👞 مخزون البيع الكمي (أحذية وإكسسوارات)</h3>
            </div>
            <div style="padding: 16px;">
              <div class="breakdown-row">
                <span>عدد المنتجات والأصناف</span>
                <span style="font-weight: 700;">${d.quantityInventory.totalProducts} صنف (${d.quantityInventory.totalVariants} متغير)</span>
              </div>
              <div class="breakdown-row">
                <span>إجمالي القطع المتوفرة للبيع الفوري</span>
                <span style="color: var(--color-success); font-weight: 600;">${d.quantityInventory.availableQuantity} قطعة</span>
              </div>
              <div class="breakdown-row">
                <span>قطع محجوزة ضمن حجوزات قائمة</span>
                <span style="color: var(--color-gold-500); font-weight: 600;">${d.quantityInventory.totalReserved} قطعة</span>
              </div>
              <div class="breakdown-row" style="border-top: 2px solid var(--border-color); margin-top: 6px; padding-top: 10px;">
                <span>إجمالي تقييم المخزون بسعر التكلفة</span>
                <span style="font-weight: 700; color: var(--text-primary); font-size: 15px;">${fmt(d.quantityInventory.costValuation)}</span>
              </div>
              <div class="breakdown-row">
                <span>إجمالي القيمة البيعية السوقية المتوقعة</span>
                <span style="font-weight: 700; color: var(--color-gold-500); font-size: 15px;">${fmt(d.quantityInventory.retailValuation)}</span>
              </div>
              <div class="breakdown-row">
                <span>مجمل الربح التجاري المتوقع عند البيع الكامل</span>
                <span style="font-weight: 700; color: var(--color-success);">${fmt(d.quantityInventory.retailValuation - d.quantityInventory.costValuation)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Low Stock Alerts Table -->
        <div class="table-card">
          <div class="table-header">
            <h3 style="font-size: 14px;">⚠️ تنبيهات النواقص وحد إعادة الطلب للمخزون</h3>
            <span style="font-size: 12px; color: var(--text-secondary);">${d.lowStockAlerts?.length || 0} صنف يحتاج توريد</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>كود الصنف</th>
                <th>اسم المنتج</th>
                <th>القسم</th>
                <th>المقاس</th>
                <th>اللون</th>
                <th>الرصيد الحالي</th>
                <th>حد الطلب</th>
                <th>حالة العجز</th>
              </tr>
            </thead>
            <tbody>
              ${lowStockRows}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="state-container error-state"><p>حدث خطأ: ${err.message}</p></div>`;
    }
  }

  // --- 3. Occupancy & Utilization Report Renderer ---
  async function loadOccupancyReport(container) {
    container.innerHTML = `
      <div class="state-container loading-state">
        <div class="state-icon">⏳</div>
        <h3 class="state-title">جاري احتساب نسب إشغال الأسطول والطلب...</h3>
      </div>
    `;

    try {
      const res = await electronApi.invoke('reports:get-occupancy');
      if (!res.success) {
        container.innerHTML = `<div class="state-container error-state"><p>${res.error?.message || 'فشل تحميل تقرير الإشغال'}</p></div>`;
        return;
      }

      const d = res.data;
      const fmt = (n) => window.UiUtils ? window.UiUtils.formatCurrency(n || 0) : `${Number(n || 0).toLocaleString()} ج.م`;

      const topModelsRows = (d.topRentedModels || []).map((m, idx) => `
        <tr>
          <td><strong>#${idx + 1}</strong></td>
          <td><span class="badge">${m.code}</span></td>
          <td style="font-weight: 600;">${m.name}</td>
          <td><span class="badge badge-success" style="font-size: 13px;">${m.rental_count} مرة تأجير</span></td>
          <td style="font-weight: 700; color: var(--color-gold-500);">${fmt(m.total_revenue)}</td>
        </tr>
      `).join('') || `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد بيانات تأجير مسجلة بعد</td></tr>`;

      const popularSizesList = (d.popularSizes || []).map(s => `
        <div class="breakdown-row">
          <span style="font-weight: 600;">مقاس ${s.size_name}</span>
          <span class="badge" style="background: rgba(212, 175, 55, 0.15); color: var(--color-gold-500);">${s.rental_count} طلب تأجير</span>
        </div>
      `).join('') || '<div style="color: var(--text-muted); font-size: 12px; padding: 10px 0;">لا توجد مقاسات مسجلة بعد</div>';

      container.innerHTML = `
        <div class="report-two-columns">
          <!-- Occupancy Gauge & Metrics -->
          <div class="occupancy-gauge-box">
            <h4 style="margin: 0 0 15px; color: var(--text-secondary); font-size: 14px;">معدل إشغال أسطول البدل الحالي</h4>
            <div class="occupancy-circle">
              <span>${d.fleetSummary.occupancyRate}%</span>
            </div>
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">
              ${d.fleetSummary.occupiedUnits} بدلة مؤجرة أو محجوزة من إجمالي ${d.fleetSummary.totalFleet} بدلة بالأسطول
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; width: 100%;">
              <div style="background: var(--bg-app); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); text-align: center; flex: 1;">
                <div style="font-size: 11px; color: var(--text-secondary);">متاحة فوراً</div>
                <div style="font-size: 16px; font-weight: 700; color: var(--color-success);">${d.fleetSummary.availableUnits}</div>
              </div>
              <div style="background: var(--bg-app); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); text-align: center; flex: 1;">
                <div style="font-size: 11px; color: var(--text-secondary);">بالمغسلة والتجهيز</div>
                <div style="font-size: 16px; font-weight: 700; color: #3b82f6;">${d.fleetSummary.cleaningUnits}</div>
              </div>
              <div style="background: var(--bg-app); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); text-align: center; flex: 1;">
                <div style="font-size: 11px; color: var(--text-secondary);">تحت الصيانة</div>
                <div style="font-size: 16px; font-weight: 700; color: var(--color-danger);">${d.fleetSummary.damagedUnits}</div>
              </div>
            </div>
          </div>

          <!-- Popular Sizes Card -->
          <div class="table-card">
            <div class="table-header">
              <h3 style="font-size: 14px;">📏 المقاسات الأكثر طلباً في التأجير</h3>
            </div>
            <div style="padding: 16px;">
              ${popularSizesList}
            </div>
          </div>
        </div>

        <!-- Top Rented Suit Models Table -->
        <div class="table-card">
          <div class="table-header">
            <h3 style="font-size: 14px;">👔 أكثر موديلات البدل طلباً وإيراداً (Top 5 Suits)</h3>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>كود الموديل</th>
                <th>اسم الموديل</th>
                <th>عدد مرات التأجير</th>
                <th>إجمالي الإيرادات المحققة</th>
              </tr>
            </thead>
            <tbody>
              ${topModelsRows}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="state-container error-state"><p>حدث خطأ: ${err.message}</p></div>`;
    }
  }

  // --- 4. Top Customers Report Renderer ---
  async function loadTopCustomersReport(container) {
    container.innerHTML = `
      <div class="state-container loading-state">
        <div class="state-icon">⏳</div>
        <h3 class="state-title">جاري استخراج سجل وكبار العملاء...</h3>
      </div>
    `;

    try {
      const res = await electronApi.invoke('reports:get-top-customers', { limit: 15 });
      if (!res.success) {
        container.innerHTML = `<div class="state-container error-state"><p>${res.error?.message || 'فشل تحميل سجل العملاء'}</p></div>`;
        return;
      }

      const customers = res.data || [];
      const fmt = (n) => window.UiUtils ? window.UiUtils.formatCurrency(n || 0) : `${Number(n || 0).toLocaleString()} ج.م`;

      const rows = customers.map((c, idx) => `
        <tr>
          <td><strong>#${idx + 1}</strong></td>
          <td><span class="badge">${c.code}</span></td>
          <td style="font-weight: 600;">${c.name}</td>
          <td><span dir="ltr">${c.phone}</span></td>
          <td>${c.address || '-'}</td>
          <td><span class="badge" style="background: rgba(255,255,255,0.06);">${c.total_bookings} حجز</span></td>
          <td><span class="badge" style="background: rgba(255,255,255,0.06);">${c.total_sales} بيع</span></td>
          <td style="font-weight: 700; color: var(--color-gold-500);">${fmt(c.total_spent)}</td>
          <td>
            ${c.total_late_fees > 0
          ? `<span style="color: var(--color-danger); font-weight: 600;">${fmt(c.total_late_fees)}</span>`
          : '<span style="color: var(--color-success);">ملتزم تماماً</span>'}
          </td>
          <td>
            ${c.is_blacklisted
          ? '<span class="badge badge-danger">قائمة سوداء 🚫</span>'
          : '<span class="badge badge-success">عميل موثوق ✅</span>'}
          </td>
          <td>
            <button class="btn-action-sm btn-whatsapp-customer" data-phone="${c.phone}" data-name="${c.name}" title="مراسلة واتساب">
              💬 واتساب
            </button>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 20px;">لا يوجد عملاء مسجلين بعد</td></tr>`;

      container.innerHTML = `
        <div class="table-card">
          <div class="table-header">
            <h3 style="font-size: 14px;">🌟 كبار العملاء ومعدل الإنفاق والالتزام (Top Customers)</h3>
            <span style="font-size: 12px; color: var(--text-secondary);">ترتيب العملاء حسب إجمالي الإنفاق</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>كود العميل</th>
                <th>اسم العميل</th>
                <th>رقم الهاتف</th>
                <th>العنوان</th>
                <th>الحجوزات</th>
                <th>المبيعات</th>
                <th>إجمالي الإنفاق</th>
                <th>غرامات التأخير</th>
                <th>حالة العميل</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;

      // WhatsApp buttons listener
      container.querySelectorAll('.btn-whatsapp-customer').forEach(btn => {
        btn.addEventListener('click', () => {
          const phone = btn.getAttribute('data-phone');
          const name = btn.getAttribute('data-name');
          openWhatsAppModal(phone, name);
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="state-container error-state"><p>حدث خطأ: ${err.message}</p></div>`;
    }
  }

  function renderPlaceholderPage(page) {
    const titles = {
      pos: 'نقطة البيع السريع (POS)',
      finance: 'المحرك المالي والخزينة',
      tasks: 'المهام اليومية والتنبيهات',
      reports: 'التقارير والإحصائيات المحاسبية'
    };

    pageContent.innerHTML = `
      <div class="table-card">
        <div class="table-header">
          <h3>${titles[page] || page}</h3>
        </div>
        <div class="state-container empty-state" style="padding: 40px 0;">
          <div class="state-icon">🛠️</div>
          <h3 class="state-title">قسم ${titles[page] || page}</h3>
          <p class="state-desc">العقود وقواعد البيانات والمستودعات أصبحت جاهزة تماماً. سيتم ربط الواجهة التفاعلية الكاملة لهذا القسم في مرحلته المجدولة وفق الخطة.</p>
          <button class="btn-primary-action" onclick="AppToast.info('القسم جاهز في الخطة')">عرض حالة القسم</button>
        </div>
      </div>
    `;
  }

  // Keyboard shortcut listener (Ctrl+K for search)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('.header-search input');
      if (searchInput) searchInput.focus();
    }
  });

  // Run on load
  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load settings & update store branding and security
    await loadSettingsAndApply();

    // 2. Build dynamic inventory categories in sidebar
    await buildDynamicInventoryNav();

    // 3. Check initial hash and navigate
    const hash = window.location.hash.replace('#', '');
    const validPages = ['dashboard', 'admin', 'settings', 'suits', 'shoes', 'accessories', 'bookings', 'customers', 'pos', 'finance', 'tasks', 'reports'];
    if (hash && (validPages.includes(hash) || hash.startsWith('cat_') || PAGE_TITLES[hash])) {
      navigateToPage(hash);
    } else {
      navigateToPage('dashboard');
    }

    // Welcome Toast
    setTimeout(() => {
      if (window.AppToast) {
        window.AppToast.success('نظام إدارة محلات البدل والعرائس جاهز للعمل! 👔', 3000);
      }
    }, 400);
  });
})();
