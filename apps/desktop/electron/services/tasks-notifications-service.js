const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { logger } = require('../logging/logger');

class TasksNotificationsService {
  constructor(dbConn = dbConnection) {
    this.dbConn = dbConn;
  }

  // =========================================================================
  // 1. TASK MANAGEMENT (إدارة ومتابعة المهام التشغيلية)
  // =========================================================================

  /**
   * جلب المهام مع الفلترة حسب التاريخ والأولوية
   */
  getTasks({ filter = 'ALL', limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT t.*,
             b.booking_number,
             c.id as customer_id,
             c.name as customer_name,
             c.phone as customer_phone,
             u.unit_barcode,
             m.name as suit_name,
             (SELECT MAX(created_at) FROM notification_logs nl 
              WHERE (nl.customer_id = c.id OR (c.phone IS NOT NULL AND nl.phone LIKE '%' || SUBSTR(REPLACE(REPLACE(c.phone, '+', ''), ' ', ''), -9)))
              AND nl.sent_status = 'SENT') as last_sent_at,
             (SELECT COUNT(*) FROM notification_logs nl 
              WHERE (nl.customer_id = c.id OR (c.phone IS NOT NULL AND nl.phone LIKE '%' || SUBSTR(REPLACE(REPLACE(c.phone, '+', ''), ' ', ''), -9)))
              AND nl.sent_status = 'SENT' AND date(nl.created_at) = date('now')) as sent_today_count
      FROM tasks t
      LEFT JOIN bookings b ON t.booking_id = b.id
      LEFT JOIN customers c ON b.customer_id = c.id
      LEFT JOIN suit_units u ON t.suit_unit_id = u.id
      LEFT JOIN suit_models m ON u.suit_model_id = m.id
      WHERE 1=1
    `;
    const params = [];

    const todayStr = new Date().toISOString().slice(0, 10);

    if (filter === 'TODAY') {
      sql += " AND date(t.due_date) = date(?) AND t.status != 'COMPLETED'";
      params.push(todayStr);
    } else if (filter === 'UPCOMING') {
      sql += " AND date(t.due_date) > date(?) AND t.status != 'COMPLETED'";
      params.push(todayStr);
    } else if (filter === 'OVERDUE') {
      sql += " AND date(t.due_date) < date(?) AND t.status != 'COMPLETED'";
      params.push(todayStr);
    } else if (filter === 'COMPLETED') {
      sql += " AND t.status = 'COMPLETED'";
    } else if (filter === 'PENDING') {
      sql += " AND t.status IN ('PENDING', 'IN_PROGRESS')";
    }

    sql += `
      ORDER BY
        CASE t.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'NORMAL' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        t.due_date ASC,
        t.id DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    return this.dbConn.all(sql, params);
  }

  /**
   * إنشاء مهمة يدوية جديدة
   */
  createTask({
    title,
    description = '',
    task_type = 'SUIT_PREPARATION',
    priority = 'NORMAL',
    due_date,
    booking_id = null,
    suit_unit_id = null
  }) {
    if (!title || !title.trim()) throw new Error('عنوان المهمة مطلوب.');
    if (!due_date) throw new Error('تاريخ استحقاق المهمة مطلوب.');

    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO tasks (title, description, task_type, priority, due_date, booking_id, suit_unit_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))
    `);
    const res = stmt.run(title.trim(), description.trim(), task_type, priority, due_date, booking_id || null, suit_unit_id || null);

    logger.info(`Created Task #${res.lastInsertRowid}: ${title} (Due: ${due_date})`);
    return {
      id: res.lastInsertRowid,
      title: title.trim(),
      task_type,
      priority,
      due_date,
      status: 'PENDING'
    };
  }

  /**
   * تعليم المهمة كمكتملة
   */
  completeTask(taskId) {
    if (!taskId) throw new Error('معرف المهمة مطلوب.');
    const db = this.dbConn.getDb();
    const res = db.prepare(`
      UPDATE tasks
      SET status = 'COMPLETED',
          completed_at = datetime('now')
      WHERE id = ?
    `).run(taskId);

    if (res.changes === 0) throw new Error('المهمة غير موجودة.');
    logger.info(`Task #${taskId} marked as COMPLETED.`);
    return { success: true, taskId, status: 'COMPLETED' };
  }

  /**
   * التوليد التلقائي لمهام الحجوزات التشغيلية
   */
  generateTasksFromBookings() {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      let createdCount = 0;
      const todayStr = new Date().toISOString().slice(0, 10);

      // 1. Fetch active bookings (CONFIRMED, PREPARED, DELIVERED)
      const activeBookings = tDb.prepare(`
        SELECT b.*, c.name as customer_name, c.phone as customer_phone
        FROM bookings b
        JOIN customers c ON b.customer_id = c.id
        WHERE b.status IN ('CONFIRMED', 'FITTING_SCHEDULED', 'PREPARED', 'DELIVERED')
      `).all();

      const existingTasksStmt = tDb.prepare('SELECT id FROM tasks WHERE booking_id = ? AND task_type = ?');
      const insertTaskStmt = tDb.prepare(`
        INSERT INTO tasks (title, description, task_type, priority, due_date, booking_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))
      `);

      for (const b of activeBookings) {
        // A. Fitting Task (if scheduled)
        if (b.fitting_date) {
          const hasFitting = existingTasksStmt.get(b.id, 'FITTING');
          if (!hasFitting) {
            insertTaskStmt.run(
              `بروفة وتعديل خياط للبدلة - حجز #${b.booking_number}`,
              `العميل: ${b.customer_name} • هاتف: ${b.customer_phone}`,
              'FITTING',
              'HIGH',
              b.fitting_date,
              b.id
            );
            createdCount++;
          }
        }

        // B. Suit Preparation Task (Before Pickup)
        if (['CONFIRMED', 'FITTING_SCHEDULED'].includes(b.status)) {
          const hasPrep = existingTasksStmt.get(b.id, 'SUIT_PREPARATION');
          if (!hasPrep) {
            insertTaskStmt.run(
              `كي وتجهيز البدلة للاستلام - حجز #${b.booking_number}`,
              `تجهيز وكي وإعداد الإكسسوارات للعميل ${b.customer_name} قبل موعد الاستلام في ${b.pickup_date}`,
              'SUIT_PREPARATION',
              'HIGH',
              b.pickup_date,
              b.id
            );
            createdCount++;
          }
        }

        // C. Overdue Followup Task (if past return date)
        if (['DELIVERED', 'CONFIRMED', 'PREPARED'].includes(b.status) && b.return_due_date < todayStr) {
          const hasLate = existingTasksStmt.get(b.id, 'RETURN_FOLLOWUP');
          if (!hasLate) {
            insertTaskStmt.run(
              `⚠️ متابعة متأخرات إرجاع - حجز #${b.booking_number}`,
              `العميل ${b.customer_name} تجاوز تاريخ الإرجاع المستحق (${b.return_due_date}). يرجى التواصل فوراً بالواتساب أو الهاتف.`,
              'RETURN_FOLLOWUP',
              'URGENT',
              todayStr,
              b.id
            );
            createdCount++;
          }
        }

        // D. Return Reminder Task (Due today or tomorrow)
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

        if (['DELIVERED', 'CONFIRMED', 'PREPARED'].includes(b.status) && (b.return_due_date === todayStr || b.return_due_date === tomorrowStr)) {
          const hasReminder = existingTasksStmt.get(b.id, 'RETURN_REMINDER');
          if (!hasReminder) {
            const isToday = b.return_due_date === todayStr;
            insertTaskStmt.run(
              `📦 تذكير واستلام إرجاع البدلة ${isToday ? '(اليوم)' : '(غداً)'} - حجز #${b.booking_number}`,
              `العميل: ${b.customer_name} • هاتف: ${b.customer_phone} • موعد الإرجاع: ${b.return_due_date}`,
              'RETURN_REMINDER',
              'HIGH',
              b.return_due_date,
              b.id
            );
            createdCount++;
          }
        }
      }

      logger.info(`Generated ${createdCount} automated operational tasks from bookings.`);
      return { success: true, createdCount };
    });
  }

  /**
   * جلب المنتجات والبدل المستحقة للإرجاع والمتأخرة
   */
  getReturnsDue() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const sql = `
      SELECT b.id as booking_id,
             b.booking_number,
             b.status,
             b.pickup_date,
             b.return_due_date,
             b.deposit_paid,
             b.total_deposit_amount,
             b.final_amount,
             c.id as customer_id,
             c.name as customer_name,
             c.phone as customer_phone,
             (SELECT GROUP_CONCAT(COALESCE(m.name, 'بدلة') || ' (' || COALESCE(s.name, '-') || ') [' || COALESCE(u.unit_barcode, '-') || ']')
              FROM booking_items bi
              LEFT JOIN suit_units u ON bi.suit_unit_id = u.id
              LEFT JOIN suit_models m ON u.suit_model_id = m.id
              LEFT JOIN sizes s ON u.size_id = s.id
              WHERE bi.booking_id = b.id) as items_summary,
             CAST(ROUND(julianday(date(?)) - julianday(date(b.return_due_date))) AS INTEGER) as days_overdue,
             (SELECT MAX(created_at) FROM notification_logs nl 
              WHERE (nl.customer_id = c.id OR (c.phone IS NOT NULL AND nl.phone LIKE '%' || SUBSTR(REPLACE(REPLACE(c.phone, '+', ''), ' ', ''), -9)))
              AND nl.sent_status = 'SENT') as last_sent_at,
             (SELECT COUNT(*) FROM notification_logs nl 
              WHERE (nl.customer_id = c.id OR (c.phone IS NOT NULL AND nl.phone LIKE '%' || SUBSTR(REPLACE(REPLACE(c.phone, '+', ''), ' ', ''), -9)))
              AND nl.sent_status = 'SENT' AND date(nl.created_at) = date(?)) as sent_today_count
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      WHERE b.status IN ('DELIVERED', 'CONFIRMED', 'PREPARED')
      ORDER BY
        CASE
          WHEN date(b.return_due_date) < date(?) THEN 1
          WHEN date(b.return_due_date) = date(?) THEN 2
          ELSE 3
        END ASC,
        b.return_due_date ASC,
        b.id DESC
    `;
    const rows = this.dbConn.all(sql, [todayStr, todayStr, todayStr, todayStr]);
    return rows.map(r => ({
      ...r,
      is_overdue: r.days_overdue > 0,
      is_today: r.days_overdue === 0,
      is_upcoming: r.days_overdue < 0
    }));
  }

  // =========================================================================
  // 2. IN-APP ALERTS & NOTIFICATIONS (نظام التنبيهات الذكي)
  // =========================================================================

  getAlerts() {
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Overdue Bookings Count
    const overdueCount = this.dbConn.get(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE status = 'DELIVERED' AND date(return_due_date) < date(?)
    `, [todayStr]).count;

    // 2. Today's Pickups
    const todayPickupsCount = this.dbConn.get(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE date(pickup_date) = date(?) AND status IN ('CONFIRMED', 'PREPARED')
    `, [todayStr]).count;

    // 3. Today's Returns Due
    const todayReturnsCount = this.dbConn.get(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE date(return_due_date) = date(?) AND status = 'DELIVERED'
    `, [todayStr]).count;

    // 4. Today's Fittings
    const todayFittingsCount = this.dbConn.get(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE date(fitting_date) = date(?) AND status IN ('CONFIRMED', 'FITTING_SCHEDULED')
    `, [todayStr]).count;

    // 5. Unread in-app notifications
    const unreadCount = this.dbConn.get(`
      SELECT COUNT(*) as count FROM notifications WHERE is_read = 0
    `).count;

    const alertsList = [];
    if (overdueCount > 0) {
      alertsList.push({
        type: 'OVERDUE',
        level: 'DANGER',
        title: 'بدل متأخرة عن الإرجاع',
        message: `يوجد ${overdueCount} بدلة تجاوزت موعد الإرجاع وتحتسب غرامات تأخير يومية.`,
        action: 'bookings'
      });
    }
    if (todayPickupsCount > 0) {
      alertsList.push({
        type: 'PICKUP',
        level: 'WARNING',
        title: 'تسليمات اليوم',
        message: `يوجد ${todayPickupsCount} عملاء بانتظار استلام بدلهم اليوم.`,
        action: 'bookings'
      });
    }
    if (todayReturnsCount > 0) {
      alertsList.push({
        type: 'RETURN',
        level: 'INFO',
        title: 'استلامات متوقعة اليوم',
        message: `من المتوقع إرجاع ${todayReturnsCount} بدلة اليوم لفحصها ورد التأمين.`,
        action: 'bookings'
      });
    }
    if (todayFittingsCount > 0) {
      alertsList.push({
        type: 'FITTING',
        level: 'INFO',
        title: 'مواعيد بروفات اليوم',
        message: `يوجد ${todayFittingsCount} بروفات وتعديلات خياط مجدولة لليوم.`,
        action: 'tasks'
      });
    }

    const returnsDue = this.getReturnsDue();

    return {
      overdueCount,
      todayPickupsCount,
      todayReturnsCount,
      todayFittingsCount,
      unreadNotificationsCount: unreadCount,
      alertsList,
      returnsDue
    };
  }

  getNotifications({ unreadOnly = false, limit = 50 } = {}) {
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    if (unreadOnly) sql += ' AND is_read = 0';
    sql += ' ORDER BY id DESC LIMIT ?';
    return this.dbConn.all(sql, [limit]);
  }

  markNotificationRead(notificationId) {
    const db = this.dbConn.getDb();
    if (notificationId === 'ALL') {
      db.prepare('UPDATE notifications SET is_read = 1').run();
      return { success: true, markedAll: true };
    }
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notificationId);
    return { success: true, notificationId };
  }

  // =========================================================================
  // 3. WHATSAPP TEMPLATES & CLICK-TO-CHAT ENGINE (محرك رسائل الواتساب)
  // =========================================================================

  getWhatsAppTemplates(storeName = 'محمد السعيد') {
    return {
      FITTING_REMINDER: {
        key: 'FITTING_REMINDER',
        title: 'تذكير بموعد البروفة',
        template: `مرحباً {customer_name}، نذكرك بميعاد بروفة البدلة الخاصة بكم في محل [${storeName}] بتاريخ {date}. نسعد بتشريفكم!`
      },
      READY_FOR_PICKUP: {
        key: 'READY_FOR_PICKUP',
        title: 'تنبيه جاهزية البدلة للاستلام',
        template: `مرحباً {customer_name}، بدلتكم جاهزة ومكوية للاستلام اليوم في محل [${storeName}]. يرجى إحضار إيصال الحجز عند الحضور.`
      },
      RETURN_REMINDER: {
        key: 'RETURN_REMINDER',
        title: 'تذكير بموعد إرجاع البدلة',
        template: `مرحباً {customer_name}، نود تذكيركم بموعد إرجاع البدلة غداً {date} لمحل [${storeName}] لضمان استرداد كامل مبلغ التأمين (الأمانات). شكراً لتعاملكم معنا.`
      },
      OVERDUE_ALERT: {
        key: 'OVERDUE_ALERT',
        title: 'تنبيه عاجل لمتأخرات الإرجاع',
        template: `عاجل: مرحباً {customer_name}، نود تذكيركم بأن موعد إرجاع البدلة لمحل [${storeName}] قد تجاوز الوقت المحدد ({days_late} يوم تأخير). يرجى التوجه للمحل لتسليمها وتجنب زيادة غرامات التأخير اليومية.`
      },
      INVOICE_THANKS: {
        key: 'INVOICE_THANKS',
        title: 'إيصال الفاتورة وشكر العميل',
        template: `شكراً لاختياركم [${storeName}]! تم إصدار فاتورتكم رقم {invoice_number} بإجمالي {amount} ج.م. نتمنى لكم مناسبة سعيدة وتألق دائم!`
      }
    };
  }

  /**
   * تشغيل محرك الإرسال التلقائي للرسائل والتنبيهات للعملاء المؤجرين في الخلفية
   */
  async runAutoAlerts(whatsappDirectService, settingsService) {
    if (!whatsappDirectService || !settingsService) {
      return { success: false, error: 'الخدمات المطلوبة غير متوفرة.' };
    }

    const waSettings = settingsService.getWhatsAppSettings();
    if (!waSettings.autoSendAlerts) {
      return { success: false, skipped: true, reason: 'الإرسال التلقائي غير مفعل في الإعدادات.' };
    }

    const status = await whatsappDirectService.getStatus();
    if (!status.isReady) {
      logger.warn('Auto WhatsApp alerts skipped: WhatsApp Web session is not connected.');
      return { success: false, skipped: true, reason: 'واتساب غير متصل. يرجى مسح باركود الربط أولاً.' };
    }

    logger.info('Starting automated background WhatsApp alerts run...');

    // جلب البدل المستحقة والمتأخرة
    const returns = this.getReturnsDue();
    const storeProfile = settingsService.getStoreProfile();
    const storeName = storeProfile.storeName || 'محل البدل';

    let sentCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const r of returns) {
      if (!r.customer_phone) continue;

      // تخطي إذا تم الإرسال للعميل اليوم مسبقاً
      if (r.sent_today_count > 0) {
        skippedCount++;
        continue;
      }

      let message = null;

      // 1. تنبيه المتأخرات
      if (r.is_overdue && waSettings.autoSendOverdue) {
        message = `عاجل: مرحباً ${r.customer_name}، نود تذكيركم بأن موعد إرجاع البدلة (حجز #${r.booking_number}) لمحل [${storeName}] قد تجاوز الموعد المحدد (${r.days_overdue} يوم تأخير). يرجى التوجه للمحل لتسليمها وتجنب زيادة غرامات التأخير. شكراً لتعاونكم!`;
      }
      // 2. تذكير بموعد الإرجاع (اليوم أو غداً)
      else if ((r.is_today || r.days_overdue === -1) && waSettings.autoSendReturns) {
        const whenText = r.is_today ? 'اليوم' : 'غداً';
        message = `مرحباً ${r.customer_name}، نود تذكيركم بموعد إرجاع البدلة (حجز #${r.booking_number}) لمحل [${storeName}] ${whenText} بتاريخ ${r.return_due_date} لضمان استرداد كامل مبلغ التأمين (الأمانات). نسعد بخدمتكم دائماً!`;
      }

      if (message) {
        try {
          logger.info(`Auto-sending WhatsApp alert to ${r.customer_name} (${r.customer_phone})...`);
          await whatsappDirectService.sendMessage({
            phone: r.customer_phone,
            message,
            customerId: r.customer_id
          });
          sentCount++;
          // مهلة بسيطة بين كل رسالة والأخرى لتجنب التزاحم
          await new Promise(res => setTimeout(res, 2000));
        } catch (sendErr) {
          logger.error(`Failed to auto-send WhatsApp alert to ${r.customer_phone}: ${sendErr.message}`);
          errors.push({ phone: r.customer_phone, name: r.customer_name, error: sendErr.message });
        }
      }
    }

    logger.info(`Completed auto WhatsApp alerts run: ${sentCount} sent, ${skippedCount} skipped.`);
    return {
      success: true,
      sentCount,
      skippedCount,
      errorsCount: errors.length,
      errors
    };
  }

  /**
   * تطبيع رقم الهاتف المصري (01xxxxxxxxx -> 201xxxxxxxxx) وتوليد رابط Click-to-Chat
   */
  generateWhatsAppLink({ customer_id = null, phone, template_key, params = {} }) {
    if (!phone) throw new Error('رقم هاتف العميل مطلوب.');

    // 1. Normalize Egyptian Phone
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = `20${cleanPhone.slice(1)}`; // +201xxxxxxxxx
    } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
      cleanPhone = `20${cleanPhone}`;
    }

    // 2. Render Template
    const templates = this.getWhatsAppTemplates();
    const tplObj = templates[template_key] || {
      template: params.custom_message || 'مرحباً بكم من محل mohamed saed.'
    };

    let renderedText = tplObj.template;
    for (const [key, val] of Object.entries(params)) {
      renderedText = renderedText.replaceAll(`{${key}}`, String(val));
    }

    // 3. Generate Link
    const encoded = encodeURIComponent(renderedText);
    const link = `https://wa.me/${cleanPhone}?text=${encoded}`;

    // 4. Log in notification_logs
    try {
      const db = this.dbConn.getDb();
      db.prepare(`
        INSERT INTO notification_logs (customer_id, channel, phone, message_template, sent_status, created_at)
        VALUES (?, 'WHATSAPP', ?, ?, 'GENERATED', datetime('now'))
      `).run(customer_id || null, cleanPhone, renderedText);
    } catch (e) {
      logger.warn('Could not write notification log:', e);
    }

    return {
      phone: cleanPhone,
      message: renderedText,
      link
    };
  }
}

const tasksNotificationsService = new TasksNotificationsService();

module.exports = {
  TasksNotificationsService,
  tasksNotificationsService
};
