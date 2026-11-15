const { BrowserWindow, app } = require('electron');
const { dbConnection } = require('../database/connection');
const { logger } = require('../logging/logger');

class WhatsappDirectService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
    this.waWindow = null;
    this.isQuitting = false;
    this.isSending = false;
    this.sendQueue = [];
    this.isReady = false;
    this.pollInterval = null;
    this.onReadyCallback = null; // callback عند اكتمال الربط
  }

  /**
   * تهيئة النافذة الخلفية لواتساب ويب داخل بيئة Electron
   */
  getOrCreateWindow() {
    if (this.waWindow && !this.waWindow.isDestroyed()) {
      return this.waWindow;
    }

    logger.info('Initializing hidden background WhatsApp Web session...');

    this.waWindow = new BrowserWindow({
      width: 1024,
      height: 800,
      show: false, // يعمل في الخلفية دائماً بدون أي إزعاج للمستخدم
      title: 'ربط واتساب - امسح الباركود بهاتفك (الأجهزة المرتبطة)',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:whatsapp', // يحفظ تسجيل الدخول بشكل دائم عبر الجلسات
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false // يمنع إيقاف الجلسة أو تجميدها عند العمل في الخلفية
      }
    });

    // استخدام User Agent حديث ومتوافق مع متصفح Chrome لسطح المكتب
    this.waWindow.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // عند إغلاق النافذة من قبل المستخدم أثناء الربط، نقوم بإخفائها فقط لتبقى تعمل في الخلفية
    this.waWindow.on('close', (e) => {
      if (!this.isQuitting) {
        e.preventDefault();
        this.waWindow.hide();
        logger.info('WhatsApp window hidden (kept running in background).');
      }
    });

    // تحميل صفحة واتساب ويب
    this.waWindow.loadURL('https://web.whatsapp.com');

    // مراقبة حالة تسجيل الدخول تلقائياً
    this.startLoginWatcher();

    return this.waWindow;
  }

  /**
   * مراقبة تلقائية لمعرفة متى تم مسح الباركود واكتمال الدخول لإخفاء النافذة
   */
  startLoginWatcher() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      if (!this.waWindow || this.waWindow.isDestroyed()) return;

      try {
        const state = await this.waWindow.webContents.executeJavaScript(`
          (() => {
            const hasChatList = !!document.querySelector('#pane-side, #side, [data-icon=\"chat\"], [data-icon=\"default-user\"], [data-testid=\"chat-list\"], header');
            const hasWid = !!(localStorage.getItem('last-wid') || localStorage.getItem('last-wid-md') || localStorage.getItem('WAToken1'));
            const canvas = document.querySelector('canvas');
            return {
              isLogged: (hasChatList || hasWid) && !canvas
            };
          })()
        `);

        if (state.isLogged) {
          if (!this.isReady) {
            this.isReady = true;
            logger.info('WhatsApp Web paired and ready! Hiding window automatically.');
            if (typeof this.onReadyCallback === 'function') {
              try {
                this.onReadyCallback();
              } catch (cbErr) {
                logger.error('Error in onReadyCallback:', cbErr);
              }
            }
          }
          if (this.waWindow.isVisible()) {
            this.waWindow.hide();
          }
        }
      } catch (_) {}
    }, 2000);
  }

  /**
   * فحص حالة الاتصال الحالية لواتساب
   */
  async getStatus() {
    const win = this.getOrCreateWindow();
    if (!win || win.isDestroyed()) {
      return { isReady: false, status: 'NOT_INITIALIZED' };
    }

    try {
      const state = await win.webContents.executeJavaScript(`
        (() => {
          const hasChatList = !!document.querySelector('#pane-side, #side, [data-icon=\"chat\"], [data-icon=\"default-user\"], [data-testid=\"chat-list\"], header');
          const canvas = document.querySelector('canvas');
          const hasWid = !!(localStorage.getItem('last-wid') || localStorage.getItem('last-wid-md') || localStorage.getItem('WAToken1'));

          // الجلسة متصلة إذا وُجدت قائمة المحادثات أو معرّف الحساب المخزن محلياً ولا يوجد باركود
          const isReady = (hasChatList || hasWid) && !canvas;

          let qrData = null;
          try {
            if (canvas) qrData = canvas.toDataURL();
          } catch (_) {}

          return {
            isReady: isReady || hasChatList,
            hasQr: !!canvas,
            qrData,
            hasWid,
            title: document.title
          };
        })()
      `);

      if (state.isReady) {
        this.isReady = true;
      }

      return {
        isReady: this.isReady || state.isReady,
        hasQr: !!state.hasQr,
        qrData: state.qrData,
        hasWid: state.hasWid,
        isVisible: win.isVisible()
      };
    } catch (e) {
      return { isReady: this.isReady, error: e.message };
    }
  }

  /**
   * إظهار نافذة مسح الباركود للمستخدم
   */
  openPairingWindow() {
    const win = this.getOrCreateWindow();
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      return { success: true };
    }
    return { success: false, error: 'تعذر فتح نافذة واتساب.' };
  }

  /**
   * إخفاء نافذة الواتساب
   */
  hideWindow() {
    if (this.waWindow && !this.waWindow.isDestroyed()) {
      this.waWindow.hide();
    }
    return { success: true };
  }

  /**
   * تسجيل الخروج وقطع الربط لمسح باركود جديد
   */
  async disconnect() {
    const win = this.getOrCreateWindow();
    try {
      await win.webContents.session.clearStorageData();
      await win.loadURL('https://web.whatsapp.com');
      this.isReady = false;
      logger.info('WhatsApp session disconnected and storage cleared.');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * تطبيع رقم الهاتف وتحويله للصيغة الدولية (201xxxxxxxxx)
   */
  normalizePhone(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('01') && clean.length === 11) {
      clean = `20${clean.slice(1)}`;
    } else if (clean.startsWith('1') && clean.length === 10) {
      clean = `20${clean}`;
    }
    return clean;
  }

  /**
   * إرسال رسالة واتساب صامتة ومباشرة في الخلفية دون فتح أي متصفح
   */
  async sendMessage({ phone, message, customerId = null }) {
    if (!phone) throw new Error('رقم الهاتف مطلوب.');
    if (!message || !message.trim()) throw new Error('نص الرسالة مطلوب.');

    const cleanPhone = this.normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 9) {
      throw new Error(`رقم الهاتف غير صالح: ${phone}`);
    }

    const win = this.getOrCreateWindow();

    // التحقق من حالة الجاهزية وتسجيل الدخول
    const status = await this.getStatus();
    if (!status.isReady) {
      throw new Error('واتساب غير متصل. يرجى مسح باركود الربط أولاً من زر (ربط واتساب) بالأعلى.');
    }

    logger.info(`Starting direct background WhatsApp message to +${cleanPhone}...`);

    // منع التداخل إذا كان هناك إرسال متزامن عبر طابور تسلسلي
    if (this.isSending) {
      return new Promise((resolve, reject) => {
        this.sendQueue.push({ phone, message, customerId, resolve, reject });
      });
    }

    this.isSending = true;

    try {
      const sendUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
      await win.loadURL(sendUrl);

      // سكريبت الضغط على زر الإرسال آلياً في الخلفية
      const sendScript = `
        (async () => {
          for (let attempt = 0; attempt < 35; attempt++) {
            await new Promise(r => setTimeout(r, 500));

            // فحص إذا ظهرت رسالة خطأ بأن الرقم غير مسجل في واتساب
            const popup = document.querySelector('div[data-animate-modal-popup="true"]');
            if (popup) {
              const text = popup.innerText || '';
              if (text.includes('invalid') || text.includes('غير صحيح') || text.includes('phone number shared via url is invalid')) {
                const okBtn = popup.querySelector('button');
                if (okBtn) okBtn.click();
                return { success: false, error: 'رقم الهاتف غير مسجل على واتساب أو غير صالح.' };
              }
            }

            // فحص زر الإرسال المباشر
            const sendBtn = document.querySelector('button[aria-label="Send"], span[data-icon="send"]')?.closest('button');
            if (sendBtn && !sendBtn.disabled) {
              sendBtn.click();
              // الانتظار ثانية للتأكد من خروج الرسالة للسيرفر
              await new Promise(r => setTimeout(r, 1200));
              return { success: true };
            }

            // فحص مربع النص القابل للتعديل كطريقة بديلة عبر إرسال Enter
            const msgBox = document.querySelector('div[contenteditable="true"][data-tab="10"]');
            if (msgBox && msgBox.innerText.trim().length > 0) {
              const enterEvt = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
              });
              msgBox.dispatchEvent(enterEvt);
              await new Promise(r => setTimeout(r, 1200));
              return { success: true };
            }
          }

          return { success: false, error: 'انتهت المهلة قبل تأكيد الإرسال. تأكد من استقرار الإنترنت وتوصيل الهاتف.' };
        })()
      `;

      const result = await win.webContents.executeJavaScript(sendScript);

      if (!result.success) {
        throw new Error(result.error || 'تعذر إرسال الرسالة.');
      }

      logger.info(`WhatsApp message successfully sent to +${cleanPhone}!`);

      // تسجيل العملية في جدول الإشعارات
      try {
        this.dbConn.run(`
          INSERT INTO notification_logs (customer_id, channel, phone, message_template, sent_status)
          VALUES (?, 'WHATSAPP', ?, ?, 'SENT')
        `, [customerId, cleanPhone, message.slice(0, 500)]);
      } catch (logErr) {
        logger.warn(`Could not log notification record: ${logErr.message}`);
      }

      return {
        success: true,
        phone: cleanPhone,
        timestamp: new Date().toISOString()
      };
    } finally {
      this.isSending = false;
      // معالجة الرسالة التالية في الطابور إن وجدت
      if (this.sendQueue.length > 0) {
        const next = this.sendQueue.shift();
        this.sendMessage(next).then(next.resolve).catch(next.reject);
      }
    }
  }

  /**
   * تنظيف الموارد عند إغلاق التطبيق
   */
  cleanup() {
    this.isQuitting = true;
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.waWindow && !this.waWindow.isDestroyed()) {
      this.waWindow.destroy();
      this.waWindow = null;
    }
  }
}

const whatsappDirectService = new WhatsappDirectService();

module.exports = {
  WhatsappDirectService,
  whatsappDirectService
};

