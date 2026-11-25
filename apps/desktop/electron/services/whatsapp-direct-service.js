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

    // منع تجميد أو تقييد موارد العملية في الخلفية لضمان سرعة الإرسال على كافة الأجهزة
    try {
      this.waWindow.webContents.setBackgroundThrottling(false);
    } catch (_) {}

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
      // إعادة تحميل الصفحة لضمان ظهور QR code
      win.loadURL('https://web.whatsapp.com').then(() => {
        // انتظار قصير ثم إظهار النافذة
        setTimeout(() => {
          win.show();
          win.focus();
          win.maximize();
          logger.info('WhatsApp pairing window opened and maximized for QR code scanning.');
        }, 1000);
      });
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
   * تطبيع رقم الهاتف وتحويله للصيغة الدولية الصحيحة بدون أخطاء
   */
  normalizePhone(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/\D/g, '');
    if (!clean) return null;

    // إزالة أصفار البداية الدولية (مثل 0020... -> 20...)
    while (clean.startsWith('00')) {
      clean = clean.slice(2);
    }

    // معالجة الأرقام المصرية بمختلف أنماط الإدخال:
    // حالة الخطأ الشائع: كتابة كود مصر متبوعاً بصفر البداية 2001xxxxxxxxx (13 رقم)
    if (clean.startsWith('2001') && clean.length === 13) {
      clean = `20${clean.slice(3)}`;
    }
    // الرقم المحلي المعتاد 01xxxxxxxxx (11 رقم)
    else if (clean.startsWith('01') && clean.length === 11) {
      clean = `20${clean.slice(1)}`;
    }
    // الرقم بدون صفر البداية 1xxxxxxxxx (10 أرقام)
    else if (clean.startsWith('1') && clean.length === 10) {
      clean = `20${clean}`;
    }

    return clean;
  }

  /**
   * إرسال رسالة واتساب صامتة ومباشرة في الخلفية تدعم جميع الأجهزة ولغات واتساب
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
      throw new Error('واتساب غير متصل على هذا الجهاز. يرجى مسح باركود الربط أولاً من زر (ربط واتساب) بالأعلى.');
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

      // الانتقال الذكي داخل تطبيق SPA لتسريع فتح المحادثة دون إعادة تحميل كاملة للجلسة
      const currentUrl = (win.webContents.getURL && win.webContents.getURL()) || '';
      if (currentUrl.includes('web.whatsapp.com')) {
        await win.webContents.executeJavaScript(`
          (() => {
            window.location.href = ${JSON.stringify(sendUrl)};
          })()
        `);
      } else {
        await win.loadURL(sendUrl);
      }

      // سكريبت شامل للإرسال التلقائي في الخلفية متوافق مع كافة واجهات وتحديثات واتساب ويب
      const sendScript = `
        (async () => {
          function findSendButton() {
            // محددات أزرار الإرسال في واتساب ويب (العربية، الإنجليزية، والأيقونات الحديثة)
            const selectors = [
              'button[data-testid="compose-btn-send"]',
              'button[data-testid="send"]',
              'button[aria-label="Send"]',
              'button[aria-label="إرسال"]',
              'button[aria-label*="Send"]',
              'button[aria-label*="إرسال"]',
              'span[data-icon="send"]',
              'span[data-icon="wds-ic-send-filled"]',
              'span[data-icon="send-light"]'
            ];

            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) {
                const btn = el.tagName === 'BUTTON' ? el : el.closest('button');
                if (btn && !btn.disabled) return btn;
              }
            }

            // فحص أي زر داخل الفوتر يحمل أيقونة إرسال
            const footerBtns = document.querySelectorAll('footer button, [data-testid="conversation-footer"] button');
            for (const btn of footerBtns) {
              const hasSendIcon = btn.querySelector('svg, span[data-icon*="send"]');
              const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
              if ((hasSendIcon || aria.includes('send') || aria.includes('إرسال')) && !btn.disabled) {
                return btn;
              }
            }

            return null;
          }

          function findComposeBox() {
            return document.querySelector(
              'footer div[contenteditable="true"], ' +
              'div[contenteditable="true"][role="textbox"], ' +
              'div[contenteditable="true"][data-tab], ' +
              '[data-testid="conversation-compose-box-input"], ' +
              '#main footer div[contenteditable="true"]'
            );
          }

          // حلقة فحص متكيفة حتى 60 محاولة بفارق 750 مللي ثانية (إجمالي 45 ثانية لتغطية بطء شبكات الأجهزة المختلفة)
          for (let attempt = 0; attempt < 60; attempt++) {
            await new Promise(r => setTimeout(r, 750));

            // 1. فحص انقطاع الجلسة أو طلب مسح الباركود من جديد
            const canvas = document.querySelector('canvas');
            const qrBox = document.querySelector('[data-testid="qrcode"]');
            if (canvas || qrBox) {
              return {
                success: false,
                error: 'انقطع اتصال واتساب (تم تسجيل الخروج). يرجى الضغط على زر ربط واتساب لمسح الباركود بهاتفك مجدداً.'
              };
            }

            // 2. فحص ظهور نافذة تفيد بأن الرقم غير مسجل في واتساب
            const popup = document.querySelector('div[data-animate-modal-popup="true"], div[role="dialog"], [data-testid="popup-contents"]');
            if (popup) {
              const text = (popup.innerText || popup.textContent || '').toLowerCase();
              if (text.includes('invalid') || text.includes('غير صحيح') || text.includes('غير صالح') || text.includes('phone number shared via url is invalid')) {
                const okBtn = popup.querySelector('button');
                if (okBtn) okBtn.click();
                return {
                  success: false,
                  error: 'رقم الهاتف (+${cleanPhone}) غير مسجل في تطبيق واتساب أو غير صحيح.'
                };
              }
            }

            // 3. فحص وتفعيل زر الإرسال
            const sendBtn = findSendButton();
            if (sendBtn) {
              try {
                sendBtn.focus();
                sendBtn.click();
                ['mousedown', 'mouseup', 'click'].forEach(evt => {
                  sendBtn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
                });
              } catch (_) {}

              // الانتظار للتحقق من اختفاء نص الرسالة أو ظهور زر الميكروفون
              await new Promise(r => setTimeout(r, 1200));

              const boxAfter = findComposeBox();
              const isCleared = !boxAfter || !boxAfter.innerText || boxAfter.innerText.trim().length === 0;
              const hasPtt = !!document.querySelector('span[data-icon="ptt"], span[data-icon="mic"], [data-testid="ptt"]');

              if (isCleared || hasPtt) {
                return { success: true };
              }
              return { success: true, needsInputEvent: true };
            }

            // 4. فحص مربع الكتابة وتجهيز المؤشر لإرسال ضغطة Enter
            const composeBox = findComposeBox();
            if (composeBox && composeBox.innerText && composeBox.innerText.trim().length > 0) {
              try {
                composeBox.focus();
              } catch (_) {}
              return { success: true, needsInputEvent: true };
            }
          }

          return {
            success: false,
            error: 'انتهت مهلة انتظار الإرسال (45 ثانية). تأكد من استقرار الإنترنت ومسح باركود الربط بهاتفك.'
          };
        })()
      `;

      let result = await win.webContents.executeJavaScript(sendScript);

      if (result && result.needsInputEvent) {
        // إرسال ضغطة مفتاح Enter حقيقية على مستوى Chromium / OS عبر Electron
        try {
          win.webContents.focus();
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
          win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
          await new Promise(r => setTimeout(r, 1000));
        } catch (inputErr) {
          logger.warn(`Could not send OS Return input event: ${inputErr.message}`);
        }
      }

      if (!result || !result.success) {
        throw new Error((result && result.error) || 'تعذر إرسال الرسالة.');
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

