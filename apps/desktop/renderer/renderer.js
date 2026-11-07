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
      if (channel === 'inventory:get-suit-models') {
        return {
          success: true,
          data: [
            { id: 1, code: 'MDL-ROYAL-01', name: 'سموكنج أسود ملكي فخم', category_name: 'بدل رجالي وعرائس', color_name: 'أسود ملكي', rental_price: 1500, security_deposit: 2000, total_units: 8, available_units: 5 },
            { id: 2, code: 'MDL-NAVY-02', name: 'بدلة خطوبة كحلي رويال', category_name: 'بدل رجالي وعرائس', color_name: 'كحلي رويال', rental_price: 1200, security_deposit: 1500, total_units: 6, available_units: 4 },
            { id: 3, code: 'MDL-GREY-03', name: 'بدلة عريس رمادي شارك سكين', category_name: 'بدل رجالي وعرائس', color_name: 'رمادي فحم', rental_price: 1400, security_deposit: 1800, total_units: 5, available_units: 3 }
          ]
        };
      }
      if (channel === 'inventory:get-suit-units') {
        return {
          success: true,
          data: [
            { id: 1, unit_barcode: 'ST-101-50-A', model_name: 'سموكنج أسود ملكي فخم', size_name: 'مقاس 50', warehouse_name: 'المخزن الرئيسي', rental_price: 1500, security_deposit: 2000, status: 'AVAILABLE', rental_count: 3 },
            { id: 2, unit_barcode: 'ST-101-52-B', model_name: 'سموكنج أسود ملكي فخم', size_name: 'مقاس 52', warehouse_name: 'المخزن الرئيسي', rental_price: 1500, security_deposit: 2000, status: 'BOOKED', rental_count: 5 },
            { id: 3, unit_barcode: 'ST-102-48-C', model_name: 'بدلة خطوبة كحلي رويال', size_name: 'مقاس 48', warehouse_name: 'المخزن الرئيسي', rental_price: 1200, security_deposit: 1500, status: 'IN_USE', rental_count: 2 },
            { id: 4, unit_barcode: 'ST-102-50-D', model_name: 'بدلة خطوبة كحلي رويال', size_name: 'مقاس 50', warehouse_name: 'قسم الدراي كلين', rental_price: 1200, security_deposit: 1500, status: 'IN_CLEANING', rental_count: 6 },
            { id: 5, unit_barcode: 'ST-103-54-E', model_name: 'بدلة عريس رمادي شارك سكين', size_name: 'مقاس 54', warehouse_name: 'المخزن الرئيسي', rental_price: 1400, security_deposit: 1800, status: 'AVAILABLE', rental_count: 1 }
          ]
        };
      }
      if (channel === 'inventory:get-quantity-products') {
        const type = payload?.categoryType || 'SHOES';
        if (type === 'SHOES') {
          return {
            success: true,
            data: [
              { id: 10, code: 'SH-OXFORD-01', name: 'حذاء كلاسيك أوكسفورد أسود لميع', category_name: 'أحذية كلاسيك', sale_price: 1850, rental_price: 350, total_quantity: 12, reserved_quantity: 2, available_quantity: 10, reorder_level: 3 },
              { id: 11, code: 'SH-DERBY-02', name: 'حذاء كحلي ديربي خياطة يدوي', category_name: 'أحذية كلاسيك', sale_price: 1950, rental_price: 400, total_quantity: 8, reserved_quantity: 1, available_quantity: 7, reorder_level: 2 },
              { id: 12, code: 'SH-LOAFER-03', name: 'لوفر عريس جلد طبيعي هافان', category_name: 'أحذية كلاسيك', sale_price: 2100, rental_price: 450, total_quantity: 2, reserved_quantity: 1, available_quantity: 1, reorder_level: 3 }
            ]
          };
        } else {
          return {
            success: true,
            data: [
              { id: 20, code: 'ACC-TIE-01', name: 'كرافتة حرير طبيعي أسود رويال', category_name: 'ربطات عنق وببيونات', sale_price: 250, rental_price: 80, total_quantity: 24, reserved_quantity: 4, available_quantity: 20, reorder_level: 5 },
              { id: 21, code: 'ACC-BOW-02', name: 'ببيون عريس ساتان أسود عريض', category_name: 'ربطات عنق وببيونات', sale_price: 180, rental_price: 60, total_quantity: 18, reserved_quantity: 3, available_quantity: 15, reorder_level: 5 },
              { id: 22, code: 'ACC-CUFF-03', name: 'أزرار أكمام فضي كريستال فاخر', category_name: 'أزرار أكمام', sale_price: 350, rental_price: 100, total_quantity: 9, reserved_quantity: 2, available_quantity: 7, reorder_level: 4 },
              { id: 23, code: 'ACC-SHIRT-04', name: 'قميص بدلة قطن مصري 100% أبيض', category_name: 'قمصان بدل', sale_price: 650, rental_price: 180, total_quantity: 15, reserved_quantity: 5, available_quantity: 10, reorder_level: 4 }
            ]
          };
        }
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
    } else if (page === 'suits') {
      renderSuitsPage();
    } else if (page === 'shoes') {
      renderShoesPage();
    } else if (page === 'accessories') {
      renderAccessoriesPage();
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

  // --- Phase 6: Render Suits Inventory (مخزون البدل والقطع الفردية) ---
  async function renderSuitsPage() {
    const modelsRes = await electronApi.invoke('inventory:get-suit-models');
    const unitsRes = await electronApi.invoke('inventory:get-suit-units');
    const models = modelsRes.data || [];
    const units = unitsRes.data || [];

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
          <p style="color: var(--text-secondary); font-size: 13px;">تتبع موديلات البدل والوحدات الفردية بالباركود، ودورة حياة كل بدلة وحالاتها.</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="btn-add-suit-model" class="btn-secondary">+ إضافة موديل بدلة</button>
          <button id="btn-add-suit-unit" class="btn-accent-action">+ إضافة قطعة جديدة (باركود)</button>
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

      <!-- Units Table -->
      <div class="table-card">
        <div class="table-header">
          <h3>سجل وحدات البدل الفردية</h3>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="suit-search-input" class="form-control" placeholder="بحث بالباركود أو الموديل..." style="width: 250px; padding: 6px 12px;">
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
              <th>التأمين</th>
              <th>الحالة الحالية</th>
              <th>مرات التأجير</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody id="suits-table-body">
            ${units.map(u => `
              <tr>
                <td><code style="background: rgba(212,175,55,0.1); color: var(--color-gold-400); padding: 2px 6px; border-radius: 4px;">${u.unit_barcode}</code></td>
                <td><strong>${u.model_name}</strong></td>
                <td><span class="badge badge-info">${u.size_name}</span></td>
                <td>${u.warehouse_name}</td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(u.rental_price) : u.rental_price + ' ج.م'}</td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(u.security_deposit) : u.security_deposit + ' ج.م'}</td>
                <td>${statusBadge(u.status)}</td>
                <td>${u.rental_count} مرات</td>
                <td>
                  <div style="display: flex; gap: 6px;">
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window._openUnitStatusModal(${u.id}, '${u.status}')">تغيير الحالة</button>
                    <button class="btn-primary-action" style="padding: 4px 8px; font-size: 11px;" onclick="window._openUnitHistoryDrawer(${u.id}, '${u.unit_barcode}', '${u.model_name}')">سجل الحركة</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Hook Add Model Modal
    document.getElementById('btn-add-suit-model')?.addEventListener('click', () => {
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
              <label class="form-label">سعر الإيجار اليومي (ج.م)</label>
              <input type="number" id="new-model-rental" class="form-control" value="1500">
            </div>
            <div class="form-group">
              <label class="form-label">مبلغ التأمين الافتراضي (ج.م)</label>
              <input type="number" id="new-model-deposit" class="form-control" value="2000">
            </div>
          </div>
        `,
        footerHtml: `
          <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
          <button class="btn-accent-action" onclick="window._saveSuitModel()">حفظ الموديل</button>
        `,
        width: '500px'
      });

      window._saveSuitModel = async () => {
        const code = document.getElementById('new-model-code')?.value;
        const name = document.getElementById('new-model-name')?.value;
        const rental_price = Number(document.getElementById('new-model-rental')?.value) || 0;
        const security_deposit = Number(document.getElementById('new-model-deposit')?.value) || 0;
        if (!code || !name) {
          AppToast.error('يرجى ملء الكود واسم الموديل.');
          return;
        }
        await electronApi.invoke('inventory:create-suit-model', { code, name, rental_price, security_deposit });
        AppToast.success('تمت إضافة موديل البدلة بنجاح! 🤵');
        AppModal.close();
        renderSuitsPage();
      };
    });

    // Hook Add Unit Modal
    document.getElementById('btn-add-suit-unit')?.addEventListener('click', () => {
      window.AppModal.open({
        title: '➕ إضافة قطعة بدلة فردية (باركود)',
        contentHtml: `
          <div class="form-group">
            <label class="form-label">موديل البدلة</label>
            <select id="unit-model-id" class="form-control">
              ${models.map(m => `<option value="${m.id}">${m.name} (${m.code})</option>`).join('')}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">المقاس</label>
              <select id="unit-size-id" class="form-control">
                <option value="1">مقاس 46</option>
                <option value="2">مقاس 48</option>
                <option value="3" selected>مقاس 50</option>
                <option value="4">مقاس 52</option>
                <option value="5">مقاس 54</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">المخزن</label>
              <select id="unit-wh-id" class="form-control">
                <option value="1">المخزن الرئيسي (المحل)</option>
                <option value="2">قسم الدراي كلين</option>
                <option value="3">مخزن الأمانات</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">الباركود (اتركه فارغًا للتوليد التلقائي)</label>
            <input type="text" id="unit-custom-barcode" class="form-control" placeholder="توليد تلقائي آلي">
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
        const size_id = Number(document.getElementById('unit-size-id')?.value) || 3;
        const warehouse_id = Number(document.getElementById('unit-wh-id')?.value) || 1;
        const unit_barcode = document.getElementById('unit-custom-barcode')?.value || null;

        await electronApi.invoke('inventory:create-suit-unit', { suit_model_id, size_id, warehouse_id, unit_barcode });
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
          <p style="color: var(--text-secondary); font-size: 13px;">إدارة كميات ومقاسات الأحذية الكلاسيك وعرائس للبيع المباشر والتأجير مع البدل.</p>
        </div>
        <button id="btn-add-shoe-product" class="btn-accent-action">+ إضافة صنف حذاء جديد</button>
      </div>

      <div class="table-card">
        <div class="table-header">
          <h3>أصناف الأحذية والأرصدة الحالية</h3>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>كود الصنف</th>
              <th>اسم الحذاء</th>
              <th>الرصيد الإجمالي</th>
              <th>المحجوز</th>
              <th>المتاح للبيع/الإيجار</th>
              <th>سعر البيع</th>
              <th>سعر الإيجار</th>
              <th>حالة المخزون</th>
              <th>تسوية الرصيد</th>
            </tr>
          </thead>
          <tbody>
            ${shoes.map(sh => `
              <tr>
                <td><code>${sh.code}</code></td>
                <td><strong>${sh.name}</strong></td>
                <td>${sh.total_quantity} زوج</td>
                <td>${sh.reserved_quantity} زوج</td>
                <td><strong style="color: ${sh.available_quantity <= sh.reorder_level ? 'var(--color-danger)' : 'var(--color-success)'}">${sh.available_quantity} زوج</strong></td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(sh.sale_price) : sh.sale_price + ' ج.م'}</td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(sh.rental_price) : sh.rental_price + ' ج.م'}</td>
                <td>
                  ${sh.available_quantity <= sh.reorder_level
                    ? '<span class="badge badge-warning">⚠️ قارب على النفاد</span>'
                    : '<span class="badge badge-success">متوفر بالمخزن</span>'}
                </td>
                <td>
                  <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="window._openAdjustStockModal(${sh.id}, '${sh.name}')">تسوية جرد (+/-)</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    window._openAdjustStockModal = (prodId, prodName) => {
      window.AppModal.open({
        title: `تسوية رصيد: ${prodName}`,
        contentHtml: `
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
        width: '450px'
      });

      window._confirmStockAdj = async (pId) => {
        const delta = Number(document.getElementById('adj-qty')?.value) || 0;
        const reason = document.getElementById('adj-reason')?.value || 'تسوية يدوية';
        try {
          await electronApi.invoke('inventory:adjust-stock', { variantId: 1, warehouseId: 1, deltaQty: delta, reason });
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

    pageContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700;">🎀 مخزون الإكسسوارات والإضافات (Accessories)</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">إدارة ربطات العنق، الببيونات، أزرار الأكمام، والقمصان الرجالية وإضافات البدل.</p>
        </div>
        <button class="btn-accent-action" onclick="AppToast.info('إضافة إكسسوار جديد')">+ إضافة إكسسوار جديد</button>
      </div>

      <div class="table-card">
        <div class="table-header">
          <h3>قائمة الإكسسوارات المتاحة بالمحل</h3>
        </div>
        <table class="app-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>اسم الإكسسوار</th>
              <th>التصنيف</th>
              <th>الرصيد الكلي</th>
              <th>المتاح</th>
              <th>سعر البيع</th>
              <th>سعر الإيجار</th>
              <th>تسوية المخزن</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td><code>${it.code}</code></td>
                <td><strong>${it.name}</strong></td>
                <td><span class="badge badge-info">${it.category_name}</span></td>
                <td>${it.total_quantity} قطعة</td>
                <td><strong style="color: var(--color-success)">${it.available_quantity} قطعة</strong></td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(it.sale_price) : it.sale_price + ' ج.م'}</td>
                <td>${window.UiUtils ? window.UiUtils.formatCurrency(it.rental_price) : it.rental_price + ' ج.م'}</td>
                <td>
                  <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="AppToast.success('تسوية رصيد ${it.name}')">تعديل الرصيد (+/-)</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
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
