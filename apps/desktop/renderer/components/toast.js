// Toast Notification System (AppToast)

class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = [];
  }

  ensureContainer() {
    if (typeof document === 'undefined') return null;
    if (!this.container) {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    }
    return this.container;
  }

  show(message, type = 'info', duration = 4000) {
    const container = this.ensureContainer();
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toastData = { id, message, type, duration, icon: icons[type] || 'ℹ️' };
    this.toasts.push(toastData);

    if (container) {
      const toastEl = document.createElement('div');
      toastEl.id = id;
      toastEl.className = `toast toast-${type}`;
      toastEl.innerHTML = `
        <span class="toast-icon">${toastData.icon}</span>
        <div class="toast-body">${message}</div>
        <button class="toast-close" onclick="AppToast.dismiss('${id}')">×</button>
      `;

      container.appendChild(toastEl);

      // Slide in
      setTimeout(() => toastEl.classList.add('show'), 10);

      // Auto dismiss
      if (duration > 0) {
        setTimeout(() => this.dismiss(id), duration);
      }
    }

    return id;
  }

  dismiss(id) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    if (typeof document !== 'undefined') {
      const toastEl = document.getElementById(id);
      if (toastEl) {
        toastEl.classList.remove('show');
        setTimeout(() => toastEl.remove(), 250);
      }
    }
  }

  success(msg, duration) { return this.show(msg, 'success', duration); }
  error(msg, duration) { return this.show(msg, 'error', duration); }
  warning(msg, duration) { return this.show(msg, 'warning', duration); }
  info(msg, duration) { return this.show(msg, 'info', duration); }
}

const AppToast = new ToastManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AppToast, ToastManager };
} else {
  window.AppToast = AppToast;
}

