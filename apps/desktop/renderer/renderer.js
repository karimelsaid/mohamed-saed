// Renderer Logic & UI Controller
(function() {
  'use strict';

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
      console.log(`[IPC Web Simulator] Handled channel [${channel}]`);
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
      return {
        success: true,
        data: { channel, payload, simulated: true },
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

  // 4. Quick Action Buttons
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
            <p style="color: var(--text-secondary); font-size: 13px;">سيتم ربط الإيصال فوراً بجلسة الخزينة الحالية وطباعة الإيصال الحراري 80mm.</p>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-primary-action" onclick="AppToast.success('تمت تجربة البيع السريع بنجاح! ⚡'); AppModal.close();">إتمام البيع وطباعة</button>
          `,
          width: '500px'
        });
      }
    });
  }

  const btnNewBooking = document.getElementById('btn-new-booking');
  if (btnNewBooking) {
    btnNewBooking.addEventListener('click', () => {
      if (window.AppModal) {
        window.AppModal.open({
          title: '➕ إنشاء حجز بدلة جديد',
          contentHtml: `
            <div class="form-group">
              <label class="form-label">اسم العميل</label>
              <input type="text" class="form-control" placeholder="اسم العميل بالكامل...">
            </div>
            <div class="form-group">
              <label class="form-label">رقم الهاتف (واتساب)</label>
              <input type="text" class="form-control" placeholder="01xxxxxxxxx">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label class="form-label">تاريخ الاستلام</label>
                <input type="date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
              </div>
              <div class="form-group">
                <label class="form-label">تاريخ الإرجاع</label>
                <input type="date" class="form-control">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">البدلة المختارة</label>
              <select class="form-control">
                <option>سموكنج أسود ملكي (كود: BARCODE-SUIT-001)</option>
                <option>بدلة خطوبة كحلي رويال (كود: BARCODE-SUIT-002)</option>
              </select>
            </div>
          `,
          footerHtml: `
            <button class="btn-secondary" onclick="AppModal.close()">إلغاء</button>
            <button class="btn-accent-action" onclick="AppToast.success('تم التحقق من عدم وجود تعارض زمني وحفظ الحجز بنجاح! 🤵'); AppModal.close();">حفظ الحجز وتأكيده</button>
          `,
          width: '560px'
        });
      }
    });
  }

  // 5. Initial System Handshake
  async function initSystem() {
    try {
      const infoRes = await electronApi.invoke('app:get-info');
      const statusEl = document.getElementById('system-status-text');
      if (statusEl && infoRes.success) {
        statusEl.textContent = `متصل - ${infoRes.data?.appName || 'نظام البدل'}`;
      }

      loadPage('dashboard');

      // Welcome Toast
      setTimeout(() => {
        if (window.AppToast) {
          window.AppToast.success('مرحباً بك في نظام إدارة محلات البدل والعرائس! (وضع التطوير نشط)', 3500);
        }
      }, 500);
    } catch (err) {
      console.error('System initialization error:', err);
      showErrorState('فشل في الاتصال بمحرك التطبيق: ' + err.message);
    }
  }

  function showErrorState(msg) {
    if (!pageContent) return;
    pageContent.innerHTML = `
      <div class="state-container error-state">
        <div class="state-icon">⚠️</div>
        <h3 class="state-title">حدث خطأ أثناء تحميل البيانات</h3>
        <p class="state-desc">${msg}</p>
        <button onclick="location.reload()" class="btn-primary-action">إعادة المحاولة</button>
      </div>
    `;
  }

  function loadPage(page) {
    if (!pageContent) return;
    if (page === 'dashboard') {
      renderDashboard();
    } else {
      renderPlaceholderPage(page);
    }
  }

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
      reports: 'التقارير والإحصائيات المحاسبية',
      settings: 'إعدادات النظام العامة'
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
  document.addEventListener('DOMContentLoaded', initSystem);
})();
