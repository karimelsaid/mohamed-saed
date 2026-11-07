// Renderer Logic & UI Controller - Suit Store Management System
(function() {
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

  // 2. Safe Electron API Wrapper
  const electronApi = window.electronApi || {
    invoke: async (channel, payload) => {
      console.log(`[IPC Web Simulator] Handled channel [${channel}]`, payload);
      
      // Fallback local memory for web mode
      if (channel === 'app:get-info') {
        return {
          success: true,
          data: {
            appName: 'رويال لإدارة محلات البدل والعرائس',
            version: '1.0.0 (وضع التطوير Live Dev)',
            platform: navigator.platform
          }
        };
      }
      if (channel === 'admin:get-categories') {
        return {
          success: true,
          data: [
            { id: 1, code: 'SUITS', name: 'بدل رجالي وعرائس', type: 'SUITS', is_active: 1 },
            { id: 2, code: 'SHOES', name: 'أحذية كلاسيك وعرائس', type: 'SHOES', is_active: 1 },
            { id: 3, code: 'TIES', name: 'ربطات عنق وببيونات', type: 'ACCESSORIES', is_active: 1 },
            { id: 4, code: 'CUFFLINKS', name: 'أزرار أكمام وإكسسوارات', type: 'ACCESSORIES', is_active: 1 },
            { id: 5, code: 'SHIRTS', name: 'قمصان بدل وبدل داخلية', type: 'ACCESSORIES', is_active: 1 }
          ]
        };
      }
      if (channel === 'admin:get-warehouses') {
        return {
          success: true,
          data: [
            { id: 1, code: 'MAIN', name: 'المخزن الرئيسي (المحل)', location: 'صالة العرض الرئيسية', is_default: 1, is_active: 1 },
            { id: 2, code: 'CLEANING', name: 'قسم الدراي كلين والمغسلة', location: 'القسم الداخلي', is_default: 0, is_active: 1 },
            { id: 3, code: 'STORAGE', name: 'مخزن الأمانات والبضاعة الاحتياطية', location: 'الدور العلوي', is_default: 0, is_active: 1 }
          ]
        };
      }
      if (channel === 'admin:get-sizes') {
        return {
          success: true,
          data: [
            { id: 1, category_type: 'SUIT', code: '48', name: 'مقاس 48', sort_order: 2 },
            { id: 2, category_type: 'SUIT', code: '50', name: 'مقاس 50', sort_order: 3 },
            { id: 3, category_type: 'SUIT', code: '52', name: 'مقاس 52', sort_order: 4 },
            { id: 4, category_type: 'SHOE', code: '42', name: 'مقاس 42', sort_order: 3 },
            { id: 5, category_type: 'SHOE', code: '43', name: 'مقاس 43', sort_order: 4 }
          ]
        };
      }
      if (channel === 'admin:get-colors') {
        return {
          success: true,
          data: [
            { id: 1, name: 'أسود ملكي', hex_code: '#000000', is_active: 1 },
            { id: 2, name: 'كحلي رويال', hex_code: '#0A1931', is_active: 1 },
            { id: 3, name: 'رمادي فحم', hex_code: '#333333', is_active: 1 },
            { id: 4, name: 'أبيض لؤلؤي', hex_code: '#FFFFFF', is_active: 1 }
          ]
        };
      }
      if (channel === 'admin:get-policies') {
        return {
          success: true,
          data: {
            defaultRentalDays: 3,
            bufferCleaningDays: 1,
            defaultDepositRatio: 1.0,
            lateFeePerDay: 300,
            allowGracePeriodHours: 4
          }
        };
      }
      if (channel === 'settings:get') {
        return {
          success: true,
          data: {
            store: {
              storeName: 'رويال للبدل والعرائس',
              phone: '01012345678',
              address: 'شارع الهرم، الجيزة، مصر',
              taxNumber: '123-456-789',
              invoiceFooter: 'شكرًا لاختياركم رويال للبدل. يرجى إحضار العقد عند الاستلام والتأكد من سلامة البدلة.'
            },
            printers: {
              receiptPrinter: 'Default Thermal 80mm',
              invoicePrinter: 'Default A4',
              autoPrintReceipt: true,
              previewBeforePrint: false
            }
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

  // 3. Navigation Management
  const navItems = document.querySelectorAll('.nav-item');
  const pageContent = document.getElementById('page-content');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const page = item.getAttribute('data-page');
      loadPage(page);
    });
  });

  // 4. Quick Actions
  const btnQuickPos = document.getElementById('btn-quick-pos');
  if (btnQuickPos) {
    btnQuickPos.addEventListener('click', () => {
      if (window.AppModal) {
        window.AppModal.open({
          title: '⚡ بيع مباشر سريع (POS)',
          contentHtml: `
            <div class="form-group">
              <label class="form-label">مسح باركود الصنف أو البحث</label>
              <input type="text" class="form-control" placeholder="امسح الباركود الآن..." autofocus>
            </div>
            <div class="form-group">
              <label class="form-label">طريقة الدفع</label>
              <select class="form-control">
                <option>نقدي (كاش بالدرج)</option>
                <option>بطاقة فيزا / POS</option>
                <option>محفظة إلكترونية (فودافون كاش / إنستاباي)</option>
              </select>
            </div>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-primary-action" onclick="AppToast.success('تم تسجيل البيع بنجاح! ⚡'); AppModal.close();">إتمام البيع</button>
          `,
          width: '480px'
        });
      }
    });
  }

  const btnNewBooking = document.getElementById('btn-new-booking');
  if (btnNewBooking) {
    btnNewBooking.addEventListener('click', () => {
      if (window.AppModal) {
        window.AppModal.open({
          title: '➕ حجز بدلة جديد',
          contentHtml: `
            <div class="form-group">
              <label class="form-label">اسم العميل</label>
              <input type="text" class="form-control" placeholder="اسم العميل...">
            </div>
            <div class="form-group">
              <label class="form-label">رقم الهاتف</label>
              <input type="text" class="form-control" placeholder="01xxxxxxxxx">
            </div>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-accent-action" onclick="AppToast.success('تم التحقق وحفظ الحجز بنجاح!'); AppModal.close();">تأكيد الحجز</button>
          `,
          width: '500px'
        });
      }
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
    } else {
      renderPlaceholderPage(page);
    }
  }

  // --- Render Dashboard ---
  function renderDashboard() {
    pageContent.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-info">
            <h4>إجمالي إيراد اليوم</h4>
            <div class="value">${window.UiUtils ? window.UiUtils.formatCurrency(14850) : '14,850 ج.م'}</div>
            <span style="font-size: 11px; color: var(--color-success)">↑ +18% مقارنة بالأمس</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🤵</div>
          <div class="stat-info">
            <h4>البدل المحجوزة اليوم</h4>
            <div class="value">6 بدل</div>
            <span style="font-size: 11px; color: var(--text-secondary)">مؤكدة بالعربون</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📦</div>
          <div class="stat-info">
            <h4>تسليمات منتظرة اليوم</h4>
            <div class="value">4 عملاء</div>
            <span style="font-size: 11px; color: var(--color-warning)">جاهزة ومكوية</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-danger); background: rgba(239,68,68,0.12)">⏰</div>
          <div class="stat-info">
            <h4>متأخرات الإرجاع</h4>
            <div class="value" style="color: var(--color-danger)">1 بدلة</div>
            <span style="font-size: 11px; color: var(--color-danger)">تحتاج متابعة واتساب</span>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <h3>📅 جدول تسليمات ومرتجعات اليوم</h3>
          <span class="badge badge-info">اليوم: ${window.UiUtils ? window.UiUtils.formatDate(new Date()) : new Date().toLocaleDateString('ar-EG')}</span>
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
            <tr>
              <td><strong>#BK-1042</strong></td>
              <td>محمد أحمد سعيد</td>
              <td>01012345678</td>
              <td>سموكنج أسود ملكي فخم</td>
              <td>52 Slim</td>
              <td>1,200 ج.م</td>
              <td>2,000 ج.م</td>
              <td><span class="badge badge-warning">جاهزة للاستلام</span></td>
              <td>
                <button class="btn-accent-action" style="padding: 6px 12px; font-size: 12px;" onclick="AppToast.info('تم بدء تسليم البدلة للعميل واستلام التأمين')">تسليم البدلة</button>
              </td>
            </tr>
            <tr>
              <td><strong>#BK-1039</strong></td>
              <td>كريم حسام الدين</td>
              <td>01198765432</td>
              <td>بدلة خطوبة كحلي رويال</td>
              <td>50 Regular</td>
              <td>0 ج.م (خالص)</td>
              <td>1,500 ج.م</td>
              <td><span class="badge badge-success">مستلمة (إرجاع اليوم)</span></td>
              <td>
                <button class="btn-primary-action" style="padding: 6px 12px; font-size: 12px;" onclick="AppDrawer.open({ title: 'فحص البدلة المرتجعة', contentHtml: '<p>بدلة كحلي مقاس 50. فحص سلامة القماش والأزرار ورد مبلغ التأمين (1,500 ج.م).</p>', width: '420px' })">استلام وفحص</button>
              </td>
            </tr>
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
      const cats = res.data || [];
      container.innerHTML = `
        <div class="table-card">
          <table class="app-table">
            <thead>
              <tr><th>الكود</th><th>اسم القسم</th><th>النوع</th><th>الحالة</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              ${cats.map(c => `
                <tr>
                  <td><strong>${c.code}</strong></td>
                  <td>${c.name}</td>
                  <td><span class="badge badge-info">${c.type}</span></td>
                  <td><span class="badge ${c.is_active ? 'badge-success' : 'badge-danger'}">${c.is_active ? 'نشط' : 'معطل'}</span></td>
                  <td>
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="AppToast.info('تعديل القسم: ${c.name}')">تعديل</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (tab === 'warehouses') {
      const res = await electronApi.invoke('admin:get-warehouses');
      const whs = res.data || [];
      container.innerHTML = `
        <div class="table-card">
          <table class="app-table">
            <thead>
              <tr><th>كود المخزن</th><th>الاسم</th><th>الموقع</th><th>الافتراضي</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              ${whs.map(w => `
                <tr>
                  <td><strong>${w.code}</strong></td>
                  <td>${w.name}</td>
                  <td>${w.location || '—'}</td>
                  <td>${w.is_default ? '<span class="badge badge-success">★ الافتراضي</span>' : '—'}</td>
                  <td><span class="badge ${w.is_active ? 'badge-success' : 'badge-danger'}">${w.is_active ? 'نشط' : 'معطل'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (tab === 'sizes') {
      const res = await electronApi.invoke('admin:get-sizes');
      const sizes = res.data || [];
      container.innerHTML = `
        <div class="table-card">
          <table class="app-table">
            <thead>
              <tr><th>الفئة</th><th>الكود</th><th>اسم المقاس</th><th>الترتيب</th></tr>
            </thead>
            <tbody>
              ${sizes.map(s => `
                <tr>
                  <td><span class="badge badge-info">${s.category_type}</span></td>
                  <td><strong>${s.code}</strong></td>
                  <td>${s.name}</td>
                  <td>${s.sort_order}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (tab === 'colors') {
      const res = await electronApi.invoke('admin:get-colors');
      const colors = res.data || [];
      container.innerHTML = `
        <div class="table-card">
          <table class="app-table">
            <thead>
              <tr><th>اللون</th><th>اسم اللون</th><th>رمز Hex</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              ${colors.map(col => `
                <tr>
                  <td><div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${col.hex_code}; border: 1px solid var(--border-color);"></div></td>
                  <td><strong>${col.name}</strong></td>
                  <td><code>${col.hex_code}</code></td>
                  <td><span class="badge badge-success">نشط</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (tab === 'policies') {
      const res = await electronApi.invoke('admin:get-policies');
      const pol = res.data || {};
      container.innerHTML = `
        <div class="table-card" style="max-width: 650px;">
          <h3 style="margin-bottom: 16px;">📜 سياسات وشروط التأجير المعتمدة</h3>
          <div class="form-group">
            <label class="form-label">مدة التأجير الافتراضية (بالأيام)</label>
            <input type="number" id="pol-rental-days" class="form-control" value="${pol.defaultRentalDays || 3}">
          </div>
          <div class="form-group">
            <label class="form-label">فترة الأمان للتجهيز والغسيل (Buffer Days)</label>
            <input type="number" id="pol-buffer-days" class="form-control" value="${pol.bufferCleaningDays || 1}">
          </div>
          <div class="form-group">
            <label class="form-label">غرامة التأخير اليومية (بالجنيه المصري EGP)</label>
            <input type="number" id="pol-late-fee" class="form-control" value="${pol.lateFeePerDay || 300}">
          </div>
          <div class="form-group">
            <label class="form-label">فترة السماح قبل تطبيق الغرامة (بالساعات)</label>
            <input type="number" id="pol-grace-hours" class="form-control" value="${pol.allowGracePeriodHours || 4}">
          </div>
          <button id="btn-save-policies" class="btn-accent-action" style="margin-top: 12px;">حفظ واعتماد السياسات</button>
        </div>
      `;

      const savePolBtn = document.getElementById('btn-save-policies');
      if (savePolBtn) {
        savePolBtn.addEventListener('click', async () => {
          const payload = {
            defaultRentalDays: Number(document.getElementById('pol-rental-days').value) || 3,
            bufferCleaningDays: Number(document.getElementById('pol-buffer-days').value) || 1,
            lateFeePerDay: Number(document.getElementById('pol-late-fee').value) || 300,
            allowGracePeriodHours: Number(document.getElementById('pol-grace-hours').value) || 4
          };
          await electronApi.invoke('admin:update-policies', payload);
          AppToast.success('تم حفظ واعتماد سياسات التأجير بنجاح! 📜');
        });
      }
    }
  }

  function openAddAdminModal(tab) {
    if (!window.AppModal) return;

    if (tab === 'categories') {
      window.AppModal.open({
        title: '➕ إضافة قسم جديد',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">كود القسم (مثال: VESTS)</label>
            <input type="text" id="new-cat-code" class="form-control" placeholder="الكود...">
          </div>
          <div class="form-group">
            <label class="form-label">اسم القسم بالعربية</label>
            <input type="text" id="new-cat-name" class="form-control" placeholder="اسم القسم...">
          </div>
          <div class="form-group">
            <label class="form-label">نوع القسم</label>
            <select id="new-cat-type" class="form-control">
              <option value="SUITS">بدل (SUITS)</option>
              <option value="SHOES">أحذية (SHOES)</option>
              <option value="ACCESSORIES">إكسسوارات (ACCESSORIES)</option>
            </select>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveCategory()">حفظ القسم</button>
        `,
        width: '460px'
      });

      window._saveCategory = async () => {
        const code = document.getElementById('new-cat-code')?.value;
        const name = document.getElementById('new-cat-name')?.value;
        const type = document.getElementById('new-cat-type')?.value;
        if (!code || !name) {
          AppToast.error('يرجى ملء كافة الحقول الإلزامية.');
          return;
        }
        await electronApi.invoke('admin:create-category', { code, name, type });
        AppToast.success('تمت إضافة القسم بنجاح!');
        AppModal.close();
        loadAdminTabContent('categories');
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
    } else {
      AppToast.info(`إضافة عنصر في تبويب: ${tab}`);
    }
  }

  // --- Phase 5: Render Settings Page ---
  async function renderSettingsPage() {
    const res = await electronApi.invoke('settings:get');
    const store = res.data?.store || {};
    const printers = res.data?.printers || {};

    pageContent.innerHTML = `
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: 700;">⚙️ إعدادات النظام العامة (Settings)</h2>
        <p style="color: var(--text-secondary); font-size: 13px;">تخصيص بيانات المتجر، الطابعات، وقفل الشاشة وحماية البيانات.</p>
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
          <button id="btn-save-store-settings" class="btn-accent-action" style="margin-top: 10px;">حفظ بيانات المتجر</button>
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

          <!-- Security PIN Card -->
          <div class="table-card">
            <h3 style="margin-bottom: 16px;">🔒 أمان وقفل الشاشة (PIN Code)</h3>
            <div class="form-group">
              <label class="form-label">تعيين رمز PIN جديد (4 أرقام على الأقل)</label>
              <input type="password" id="set-pin-code" class="form-control" placeholder="••••" maxlength="8">
            </div>
            <button id="btn-save-pin" class="btn-secondary" style="margin-top: 6px;">تحديث رمز PIN</button>
          </div>
        </div>
      </div>
    `;

    // Hook store settings save
    document.getElementById('btn-save-store-settings')?.addEventListener('click', async () => {
      const payload = {
        store: {
          storeName: document.getElementById('set-store-name').value,
          phone: document.getElementById('set-store-phone').value,
          address: document.getElementById('set-store-address').value,
          taxNumber: document.getElementById('set-store-tax').value,
          invoiceFooter: document.getElementById('set-store-footer').value
        }
      };
      await electronApi.invoke('settings:update', payload);
      AppToast.success('تم حفظ بيانات المتجر بنجاح! 🏪');
    });

    // Hook printer settings save
    document.getElementById('btn-save-printer-settings')?.addEventListener('click', async () => {
      const payload = {
        printers: {
          receiptPrinter: document.getElementById('set-printer-receipt').value,
          invoicePrinter: document.getElementById('set-printer-a4').value,
          autoPrintReceipt: document.getElementById('set-printer-autoprint').checked
        }
      };
      await electronApi.invoke('settings:update', payload);
      AppToast.success('تم حفظ إعدادات الطابعات بنجاح! 🖨️');
    });

    // Hook PIN update
    document.getElementById('btn-save-pin')?.addEventListener('click', async () => {
      const pin = document.getElementById('set-pin-code').value;
      if (!pin || pin.length < 4) {
        AppToast.error('رمز PIN يجب أن يتكون من 4 أرقام على الأقل.');
        return;
      }
      await electronApi.invoke('settings:update', { pin });
      AppToast.success('تم تحديث رمز قفل الشاشة بنجاح! 🔒');
      document.getElementById('set-pin-code').value = '';
    });
  }

  function renderPlaceholderPage(page) {
    const titles = {
      suits: 'إدارة مخزون البدل والقطع الفردية',
      shoes: 'مخزون الأحذية الكمي',
      accessories: 'مخزون الإكسسوارات والإضافات',
      bookings: 'إدارة الحجوزات والتأجير',
      pos: 'نقطة البيع السريع (POS)',
      customers: 'إدارة العملاء والقياسات',
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
  document.addEventListener('DOMContentLoaded', () => {
    // Check if initial hash is set
    const hash = window.location.hash.replace('#', '');
    if (hash && ['dashboard', 'admin', 'settings', 'suits', 'bookings', 'pos', 'finance', 'reports'].includes(hash)) {
      navItems.forEach(n => {
        if (n.getAttribute('data-page') === hash) {
          navItems.forEach(item => item.classList.remove('active'));
          n.classList.add('active');
        }
      });
      loadPage(hash);
    } else {
      loadPage('dashboard');
    }

    // Welcome Toast
    setTimeout(() => {
      if (window.AppToast) {
        window.AppToast.success('نظام إدارة محلات البدل والعرائس جاهز للعمل! 👔', 3000);
      }
    }, 400);
  });
})();
