// State Components (Loading, Empty, Error, Badges, StatCards)

const AppStates = {
  /**
   * مؤشر التحميل المتجاوب (AppLoading)
   */
  loading(message = 'جاري معالجة البيانات...') {
    return `
      <div class="state-container loading-state">
        <div class="spinner"></div>
        <p class="state-message">${message}</p>
      </div>
    `;
  },

  /**
   * الحالة الفارغة (AppEmptyState)
   */
  empty({
    icon = '📭',
    title = 'لا توجد بيانات حالياً',
    message = 'لم يتم العثور على أي عناصر لعرضها في هذا القسم.',
    actionText = null,
    actionOnClick = null
  }) {
    const actionBtn = actionText && actionOnClick
      ? `<button class="btn-accent-action" onclick="${actionOnClick}">${actionText}</button>`
      : '';

    return `
      <div class="state-container empty-state">
        <div class="state-icon">${icon}</div>
        <h3 class="state-title">${title}</h3>
        <p class="state-desc">${message}</p>
        ${actionBtn}
      </div>
    `;
  },

  /**
   * حالة الخطأ (AppErrorState)
   */
  error({
    title = 'حدث خطأ في النظام',
    message = 'تعذر استكمال العملية بنجاح. يرجى إعادة المحاولة.',
    retryOnClick = 'location.reload()'
  }) {
    return `
      <div class="state-container error-state">
        <div class="state-icon">⚠️</div>
        <h3 class="state-title">${title}</h3>
        <p class="state-desc">${message}</p>
        <button class="btn-primary-action" onclick="${retryOnClick}">إعادة المحاولة</button>
      </div>
    `;
  },

  /**
   * شارة الحالة (AppBadge)
   */
  badge(text, type = 'info') {
    return `<span class="badge badge-${type}">${text}</span>`;
  },

  /**
   * بطاقة المؤشر الإحصائي (AppStatCard)
   */
  statCard({ icon, title, value, subtext = '', colorClass = '' }) {
    return `
      <div class="stat-card ${colorClass}">
        <div class="stat-icon">${icon}</div>
        <div class="stat-info">
          <h4>${title}</h4>
          <div class="value">${value}</div>
          ${subtext ? `<span class="stat-subtext">${subtext}</span>` : ''}
        </div>
      </div>
    `;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AppStates };
} else {
  window.AppStates = AppStates;
}

