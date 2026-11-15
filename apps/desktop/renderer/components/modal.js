// Modal & Confirmation Dialog System (AppModal & AppConfirmDialog)

class ModalManager {
  constructor() {
    this.activeModal = null;
    this.initKeyboardListener();
  }

  initKeyboardListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.activeModal) {
          this.close();
        }
      });
    }
  }

  ensureContainer() {
    if (typeof document === 'undefined') return null;
    let overlay = document.getElementById('modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" id="modal-card">
          <div class="modal-header">
            <h3 id="modal-title">العنوان</h3>
            <button class="modal-close-btn" onclick="AppModal.close()">×</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer" id="modal-footer"></div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Close on backdrop click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }
    return overlay;
  }

  open({ title, contentHtml, footerHtml = '', width = '550px', onClose = null }) {
    const overlay = this.ensureContainer();
    this.activeModal = { title, onClose };

    if (overlay) {
      document.getElementById('modal-title').textContent = title || '';
      document.getElementById('modal-body').innerHTML = contentHtml || '';
      document.getElementById('modal-footer').innerHTML = footerHtml || '';
      document.getElementById('modal-card').style.maxWidth = width;

      overlay.classList.add('active');
      document.body.classList.add('modal-open');
    }

    return true;
  }

  close() {
    if (this.activeModal && typeof this.activeModal.onClose === 'function') {
      this.activeModal.onClose();
    }
    this.activeModal = null;

    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('modal-overlay');
      if (overlay) {
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
      }
    }
  }
}

class ConfirmDialogManager {
  show({
    title = 'تأكيد العملية',
    message = 'هل أنت متأكد من تنفيذ هذا الإجراء؟',
    confirmText = 'تأكيد',
    cancelText = 'إلغاء',
    isDanger = false,
    onConfirm = () => {},
    onCancel = () => {}
  }) {
    const btnClass = isDanger ? 'btn-danger' : 'btn-accent-action';

    const contentHtml = `
      <div class="confirm-dialog-content">
        <div class="confirm-icon">${isDanger ? '⚠️' : '❓'}</div>
        <p class="confirm-message">${message}</p>
      </div>
    `;

    const footerHtml = `
      <button class="btn-secondary" onclick="AppModal.close(); if(window._confirmCancel) window._confirmCancel();">${cancelText}</button>
      <button class="${btnClass}" onclick="AppModal.close(); if(window._confirmOk) window._confirmOk();">${confirmText}</button>
    `;

    const globalScope = typeof window !== 'undefined' ? window : global;
    globalScope._confirmOk = onConfirm;
    globalScope._confirmCancel = onCancel;

    return AppModal.open({
      title,
      contentHtml,
      footerHtml,
      width: '420px',
      onClose: () => {
        globalScope._confirmOk = null;
        globalScope._confirmCancel = null;
      }
    });
  }
}

const AppModal = new ModalManager();
const AppConfirmDialog = new ConfirmDialogManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AppModal, AppConfirmDialog, ModalManager, ConfirmDialogManager };
} else {
  window.AppModal = AppModal;
  window.AppConfirmDialog = AppConfirmDialog;
}
