// Drawer / Slide-Over Component (AppDrawer)

class DrawerManager {
  constructor() {
    this.activeDrawer = null;
  }

  ensureContainer() {
    if (typeof document === 'undefined') return null;
    let overlay = document.getElementById('drawer-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'drawer-overlay';
      overlay.className = 'drawer-overlay';
      overlay.innerHTML = `
        <div class="drawer-panel" id="drawer-panel">
          <div class="drawer-header">
            <h3 id="drawer-title">التفاصيل</h3>
            <button class="drawer-close-btn" onclick="AppDrawer.close()">×</button>
          </div>
          <div class="drawer-body" id="drawer-body"></div>
          <div class="drawer-footer" id="drawer-footer"></div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }
    return overlay;
  }

  open({ title, contentHtml, footerHtml = '', width = '480px', onClose = null }) {
    const overlay = this.ensureContainer();
    this.activeDrawer = { title, onClose };

    if (overlay) {
      document.getElementById('drawer-title').textContent = title || '';
      document.getElementById('drawer-body').innerHTML = contentHtml || '';
      document.getElementById('drawer-footer').innerHTML = footerHtml || '';
      document.getElementById('drawer-panel').style.width = width;

      overlay.classList.add('active');
    }
    return true;
  }

  close() {
    if (this.activeDrawer && typeof this.activeDrawer.onClose === 'function') {
      this.activeDrawer.onClose();
    }
    this.activeDrawer = null;

    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('drawer-overlay');
      if (overlay) {
        overlay.classList.remove('active');
      }
    }
  }
}

const AppDrawer = new DrawerManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AppDrawer, DrawerManager };
} else {
  window.AppDrawer = AppDrawer;
}
