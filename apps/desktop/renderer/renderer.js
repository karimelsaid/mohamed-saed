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
    });
  }

  // 2. Safe Electron API Wrapper
  const electronApi = window.electronApi || {
    invoke: async (channel, payload) => {
      console.warn(`Simulated IPC call in web browser mode for [${channel}]`);
      return {
        success: true,
        data: { simulated: true, channel, payload },
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

  // 4. Initial System Handshake
  async function initSystem() {
    try {
      const infoRes = await electronApi.invoke('app:get-info');
      const healthRes = await electronApi.invoke('app:get-system-health');

      const statusEl = document.getElementById('system-status-text');
      if (statusEl && infoRes.success) {
        statusEl.textContent = `جاهز للعمل - ${infoRes.data?.appName || 'نظام البدل'}`;
      }

      // Load initial dashboard
      loadPage('dashboard');
    } catch (err) {
      console.error('System initialization error:', err);
      showErrorState('فشل في الاتصال بمحرك التطبيق المكتبي: ' + err.message);
    }
  }

  function showErrorState(msg) {
    if (!pageContent) return;
    pageContent.innerHTML = `
      <div class="loading-state">
        <div style="font-size: 40px; color: var(--color-danger)">⚠️</div>
        <h3 style="color: var(--text-primary)">حدث خطأ أثناء تحميل البيانات</h3>
        <p style="color: var(--text-secondary)">${msg}</p>
        <button onclick="location.reload()" class="btn-primary-action" style="margin-top: 12px;">إعادة المحاولة</button>
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
            <div class="value">14,850 ج.م</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🤵</div>
          <div class="stat-info">
            <h4>البدل المحجوزة اليوم</h4>
            <div class="value">6 بدل</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📦</div>
          <div class="stat-info">
            <h4>تسليمات منتظرة اليوم</h4>
            <div class="value">4 عملاء</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="color: var(--color-danger); background: rgba(239,68,68,0.12)">⏰</div>
          <div class="stat-info">
            <h4>متأخرات الإرجاع</h4>
            <div class="value" style="color: var(--color-danger)">1 بدلة</div>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <h3>📅 جدول تسليمات ومرتجعات اليوم</h3>
          <span class="badge badge-info">اليوم: ${new Date().toLocaleDateString('ar-EG')}</span>
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
              <td><button class="btn-accent-action" style="padding: 6px 12px; font-size: 12px;">تسليم البدلة</button></td>
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
              <td><button class="btn-primary-action" style="padding: 6px 12px; font-size: 12px;">استلام وفحص</button></td>
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
        <div class="loading-state" style="height: 40vh;">
          <div style="font-size: 32px;">🛠️</div>
          <h3>قسم ${titles[page] || page}</h3>
          <p style="color: var(--text-secondary)">تم تجهيز العقود ونظام التفاعل ومستودعات البيانات، وسيتم تفعيل الواجهة التفاعلية في المرحلة المخصصة له بالترتيب.</p>
        </div>
      </div>
    `;
  }

  // Run on load
  document.addEventListener('DOMContentLoaded', initSystem);
})();
