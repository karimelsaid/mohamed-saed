const { dbConnection } = require('../database/connection');
const { TransactionHelper } = require('../database/transaction-helper');
const { AdminService, adminService: defaultAdminService } = require('./admin-service');
const { logger } = require('../logging/logger');

class BookingEngineService {
  constructor(dbConn = dbConnection, adminSvc = null) {
    this.dbConn = dbConn;
    this.adminService = adminSvc || new AdminService(dbConn);
  }

  // =========================================================================
  // 1. CUSTOMER MANAGEMENT (إدارة العملاء والقياسات)
  // =========================================================================

  getCustomers(search = '', limit = 50, offset = 0) {
    let sql = `
      SELECT c.*,
             (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) as total_bookings,
             (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id AND b.status IN ('CONFIRMED', 'DELIVERED', 'PREPARED')) as active_bookings
      FROM customers c
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.code LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY c.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.dbConn.all(sql, params);
  }

  getCustomerDetails(customerId) {
    const customer = this.dbConn.get('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) return null;

    const bookings = this.dbConn.all(`
      SELECT b.*,
             (SELECT COUNT(*) FROM booking_items bi WHERE bi.booking_id = b.id) as item_count
      FROM bookings b
      WHERE b.customer_id = ?
      ORDER BY b.id DESC
    `, [customerId]);

    const notes = this.dbConn.all('SELECT * FROM customer_notes WHERE customer_id = ? ORDER BY id DESC', [customerId]);

    return { ...customer, bookings, notes };
  }

  createCustomer({ name, phone, alt_phone = '', national_id = '', address = '', chest_size = null, waist_size = null, sleeve_length = null, trouser_length = null, shoe_size = null, notes = '' }) {
    if (!name || !phone) throw new Error('اسم العميل ورقم الهاتف حقول إلزامية.');

    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('0020') && cleanPhone.length === 14) {
      cleanPhone = cleanPhone.slice(4);
    } else if (cleanPhone.startsWith('20') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.slice(2);
    }
    if (cleanPhone.length === 10 && cleanPhone.startsWith('1')) {
      cleanPhone = '0' + cleanPhone;
    }

    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('01')) {
      throw new Error('رقم الهاتف غير صالح. يجب أن يتكون من 11 رقمًا ويبدأ بـ 01 (أو +20).');
    }

    const db = this.dbConn.getDb();
    const existing = db.prepare('SELECT id, code, name, phone FROM customers WHERE phone = ?').get(cleanPhone);
    if (existing) {
      if (name && name.trim() && existing.name !== name.trim()) {
        try {
          db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(name.trim(), existing.id);
          existing.name = name.trim();
        } catch (e) {
          logger.warn(`Could not update existing customer name: ${e.message}`);
        }
      }
      logger.info(`Customer with phone [${cleanPhone}] already exists: ${existing.name} (#${existing.id}). Returning existing record.`);
      return { id: existing.id, code: existing.code, name: existing.name, phone: cleanPhone, is_existing: true };
    }

    const lastCust = db.prepare('SELECT id FROM customers ORDER BY id DESC LIMIT 1').get();
    const nextNum = (lastCust ? lastCust.id : 0) + 1;
    const code = `CUST-${String(nextNum).padStart(4, '0')}`;
    const stmt = db.prepare(`
      INSERT INTO customers (code, name, phone, alt_phone, national_id, address, chest_size, waist_size, sleeve_length, trouser_length, shoe_size, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(code, name.trim(), cleanPhone, alt_phone.trim(), national_id.trim(), address.trim(), chest_size, waist_size, sleeve_length, trouser_length, shoe_size, notes.trim());
    logger.info(`Created Customer: ${name} (${code})`);
    return { id: res.lastInsertRowid, code, name: name.trim(), phone: cleanPhone };
  }

  updateCustomer(customerId, data) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      UPDATE customers
      SET name = COALESCE(?, name),
          alt_phone = COALESCE(?, alt_phone),
          address = COALESCE(?, address),
          chest_size = COALESCE(?, chest_size),
          waist_size = COALESCE(?, waist_size),
          trouser_length = COALESCE(?, trouser_length),
          shoe_size = COALESCE(?, shoe_size),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(data.name || null, data.alt_phone || null, data.address || null, data.chest_size || null, data.waist_size || null, data.trouser_length || null, data.shoe_size || null, data.notes || null, customerId);
    logger.info(`Updated customer #${customerId}`);
    return true;
  }

  // =========================================================================
  // 2. AVAILABILITY CHECKER WITH BUFFER DAYS (فحص التوفر وفترة الأمان)
  // =========================================================================

  checkUnitAvailability(unitId, pickupDate, returnDueDate) {
    const policies = this.adminService.getRentalPolicies();
    const bufferDays = policies.bufferCleaningDays || 1;

    // Buffer range: expand start and end by buffer days
    // pickup - bufferDays to returnDueDate + bufferDays
    const db = this.dbConn.getDb();

    // Query overlapping active bookings
    const sql = `
      SELECT b.id, b.booking_number, b.pickup_date, b.return_due_date, b.status
      FROM booking_items bi
      JOIN bookings b ON bi.booking_id = b.id
      WHERE bi.suit_unit_id = ?
        AND b.status NOT IN ('CANCELLED', 'COMPLETED')
        AND (
          -- Check overlapping with buffer period
          (date(b.pickup_date, '-' || ? || ' days') <= ? AND date(b.return_due_date, '+' || ? || ' days') >= ?)
          OR
          (b.pickup_date >= ? AND b.pickup_date <= ?)
          OR
          (b.return_due_date >= ? AND b.return_due_date <= ?)
        )
    `;

    const row = db.prepare(sql).get(unitId, bufferDays, returnDueDate, bufferDays, pickupDate, pickupDate, returnDueDate, pickupDate, returnDueDate);

    const isAvailable = !row;
    return {
      unitId,
      isAvailable,
      conflictingBooking: row || null,
      bufferDays
    };
  }

  // =========================================================================
  // 3. BOOKING ENGINE: LIFECYCLE, HANDOVER, RETURNS & SETTLEMENTS
  // =========================================================================

  getBookings(filters = {}) {
    let sql = `
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             (SELECT COUNT(*) FROM booking_items bi WHERE bi.booking_id = b.id) as items_count,
             (SELECT GROUP_CONCAT(COALESCE(m.name, 'صنف')) FROM booking_items bi LEFT JOIN suit_units u ON bi.suit_unit_id = u.id LEFT JOIN suit_models m ON u.suit_model_id = m.id WHERE bi.booking_id = b.id) as items_summary
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      sql += ' AND b.status = ?';
      params.push(filters.status);
    }
    if (filters.customerId) {
      sql += ' AND b.customer_id = ?';
      params.push(filters.customerId);
    }
    if (filters.search) {
      sql += ' AND (b.booking_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }
    if (filters.pickupDate) {
      sql += ' AND b.pickup_date = ?';
      params.push(filters.pickupDate);
    }
    if (filters.returnDueDate) {
      sql += ' AND b.return_due_date = ?';
      params.push(filters.returnDueDate);
    }

    sql += ' ORDER BY b.id DESC LIMIT ?';
    params.push(filters.limit || 50);

    return this.dbConn.all(sql, params);
  }

  getBookingDetails(bookingId) {
    const booking = this.dbConn.get(`
      SELECT b.*, c.name as customer_name, c.phone as customer_phone, c.alt_phone, c.address,
             c.chest_size, c.waist_size, c.trouser_length, c.shoe_size
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      WHERE b.id = ?
    `, [bookingId]);

    if (!booking) return null;

    const items = this.dbConn.all(`
      SELECT bi.*, u.unit_barcode, u.serial_number, m.name as model_name, s.name as size_name, col.name as color_name
      FROM booking_items bi
      LEFT JOIN suit_units u ON bi.suit_unit_id = u.id
      LEFT JOIN suit_models m ON u.suit_model_id = m.id
      LEFT JOIN sizes s ON u.size_id = s.id
      LEFT JOIN colors col ON m.color_id = col.id
      WHERE bi.booking_id = ?
    `, [bookingId]);

    const payments = this.dbConn.all(`
      SELECT * FROM payments WHERE reference_type = 'BOOKING' AND reference_id = ? ORDER BY id ASC
    `, [bookingId]);

    const history = this.dbConn.all(`
      SELECT * FROM booking_status_history WHERE booking_id = ? ORDER BY id ASC
    `, [bookingId]);

    return { ...booking, items, payments, history };
  }

  createBooking({
    customer_id,
    event_date,
    fitting_date = null,
    pickup_date,
    return_due_date,
    items = [], // [{ suit_unit_id, rental_price, deposit_price, tailoring_notes }]
    discount_amount = 0,
    paid_advance = 0,
    payment_method = 'CASH',
    notes = ''
  }) {
    if (pickup_date && (!return_due_date || !String(return_due_date).trim())) {
      try {
        const db = this.dbConn.getDb();
        const row = db.prepare("SELECT value FROM settings WHERE key = 'rental_policy_defaultRentalDays'").get();
        const days = row && !isNaN(Number(row.value)) ? Number(row.value) : 3;
        const d = new Date(pickup_date);
        d.setDate(d.getDate() + days);
        return_due_date = d.toISOString().slice(0, 10);
      } catch (e) {
        const d = new Date(pickup_date);
        d.setDate(d.getDate() + 3);
        return_due_date = d.toISOString().slice(0, 10);
      }
    }

    if (!customer_id || !pickup_date || !return_due_date) {
      throw new Error('العميل وتاريخ الاستلام وتاريخ الإرجاع حقول إلزامية.');
    }
    if (items.length === 0) {
      throw new Error('يجب اختيار قطعة واحدة على الأقل للحجز.');
    }
    if (new Date(return_due_date) < new Date(pickup_date)) {
      throw new Error('تاريخ الإرجاع يجب أن يلي تاريخ الاستلام.');
    }

    const db = this.dbConn.getDb();

    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Strict Availability & Collision Verification
      for (const item of items) {
        if (item.suit_unit_id) {
          const avail = this.checkUnitAvailability(item.suit_unit_id, pickup_date, return_due_date);
          if (!avail.isAvailable) {
            throw new Error(`تعارض زمني: البدلة رقم #${item.suit_unit_id} محجوزة بالفعل خلال هذه الفترة في حجز #${avail.conflictingBooking.booking_number}.`);
          }
        }
      }

      // 2. Calculate Totals
      let totalRental = 0;
      let totalDeposit = 0;
      for (const it of items) {
        totalRental += Number(it.rental_price) || 0;
        totalDeposit += Number(it.deposit_price) || 0;
      }

      const finalAmount = Math.max(0, totalRental - discount_amount);
      const paid = Math.min(finalAmount, paid_advance);
      const bookingNumber = `BK-${Date.now().toString().slice(-6)}`;

      // 3. Insert Booking
      const bStmt = tDb.prepare(`
        INSERT INTO bookings (
          booking_number, customer_id, event_date, fitting_date, pickup_date, return_due_date,
          total_rental_amount, total_deposit_amount, discount_amount, final_amount, paid_amount,
          deposit_paid, deposit_refunded, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'CONFIRMED', ?)
      `);

      const bRes = bStmt.run(
        bookingNumber, customer_id, event_date, fitting_date, pickup_date, return_due_date,
        totalRental, totalDeposit, discount_amount, finalAmount, paid, notes
      );
      const bookingId = bRes.lastInsertRowid;

      // 4. Insert Items and mark unit as BOOKED
      const itStmt = tDb.prepare(`
        INSERT INTO booking_items (booking_id, suit_unit_id, item_type, rental_price, deposit_price, tailoring_notes, status)
        VALUES (?, ?, 'SUIT', ?, ?, ?, 'BOOKED')
      `);

      for (const it of items) {
        itStmt.run(bookingId, it.suit_unit_id || null, it.rental_price, it.deposit_price || 0, it.tailoring_notes || null);
        if (it.suit_unit_id) {
          tDb.prepare("UPDATE suit_units SET status = 'BOOKED' WHERE id = ?").run(it.suit_unit_id);
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, 'AVAILABLE', 'BOOKED', 'تأكيد حجز العميل', 'BOOKING', ?)
          `).run(it.suit_unit_id, bookingId);
        }
      }

      // 5. If advance paid, record payment
      if (paid > 0) {
        const payNum = `PAY-ADV-${Date.now().toString().slice(-5)}`;
        const activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
        tDb.prepare(`
          INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method)
          VALUES (?, ?, ?, 'BOOKING', ?, 'RENTAL_ADVANCE', ?, ?)
        `).run(payNum, activeSes ? activeSes.id : null, customer_id, bookingId, paid, payment_method);

        if (payment_method === 'CASH' && activeSes) {
          tDb.prepare(`
            INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
            VALUES (?, 'IN', 'RENTAL', ?, 'BOOKING', ?, ?)
          `).run(activeSes.id, paid, bookingId, `عربون حجز #${bookingNumber}`);

          tDb.prepare(`
            UPDATE cash_sessions
            SET total_cash_in = total_cash_in + ?,
                calculated_balance = calculated_balance + ?
            WHERE id = ?
          `).run(paid, paid, activeSes.id);
        }
      }

      // 6. Record Status History
      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, NULL, 'CONFIRMED', 'تم إنشاء الحجز وسداد العربون')
      `).run(bookingId);

      logger.info(`Created Booking: ${bookingNumber} (ID: ${bookingId}) for Customer #${customer_id}`);
      return {
        bookingId,
        bookingNumber,
        finalAmount,
        paidAmount: paid,
        remainingAmount: finalAmount - paid,
        totalDeposit
      };
    });
  }

  scheduleFitting(bookingId, fittingDate, tailoringNotes = '') {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      tDb.prepare(`
        UPDATE bookings
        SET fitting_date = ?, status = 'FITTING_SCHEDULED', notes = COALESCE(notes || ' | ', '') || ?
        WHERE id = ?
      `).run(fittingDate, tailoringNotes, bookingId);

      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, 'CONFIRMED', 'FITTING_SCHEDULED', ?)
      `).run(bookingId, `تحديد موعد البروفة: ${fittingDate}`);

      logger.info(`Booking #${bookingId} fitting scheduled for ${fittingDate}`);
      return true;
    });
  }

  markPrepared(bookingId, notes = 'تم التجهيز والكي بالمحل') {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      tDb.prepare("UPDATE bookings SET status = 'PREPARED' WHERE id = ?").run(bookingId);
      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, 'FITTING_SCHEDULED', 'PREPARED', ?)
      `).run(bookingId, notes);

      logger.info(`Booking #${bookingId} marked as PREPARED`);
      return true;
    });
  }

  handoverBooking(bookingId, depositPaidAmount, remainderPaidAmount = 0, paymentMethod = 'CASH') {
    const db = this.dbConn.getDb();

    return TransactionHelper.runInTransaction(db, (tDb) => {
      const booking = tDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
      if (!booking || ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(booking.status)) {
        throw new Error('الحجز غير متاح للتسليم (مستلم مسبقاً أو ملغي).');
      }

      // 1. Update booking: status to DELIVERED, deposit_paid, paid_amount
      const newPaid = booking.paid_amount + remainderPaidAmount;
      tDb.prepare(`
        UPDATE bookings
        SET status = 'DELIVERED',
            deposit_paid = deposit_paid + ?,
            paid_amount = ?,
            actual_return_date = NULL
        WHERE id = ?
      `).run(depositPaidAmount, newPaid, bookingId);

      const activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();

      // 2. Record Deposit Payment (Amanat)
      if (depositPaidAmount > 0) {
        const depNum = `PAY-DEP-${Date.now().toString().slice(-5)}`;
        tDb.prepare(`
          INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method)
          VALUES (?, ?, ?, 'BOOKING', ?, 'SECURITY_DEPOSIT', ?, ?)
        `).run(depNum, activeSes ? activeSes.id : null, booking.customer_id, bookingId, depositPaidAmount, paymentMethod);

        if (paymentMethod === 'CASH' && activeSes) {
          tDb.prepare(`
            INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
            VALUES (?, 'IN', 'DEPOSIT', ?, 'BOOKING', ?, ?)
          `).run(activeSes.id, depositPaidAmount, bookingId, `تحصيل تأمين أمانات حجز #${booking.booking_number}`);

          tDb.prepare(`
            UPDATE cash_sessions
            SET total_cash_in = total_cash_in + ?,
                calculated_balance = calculated_balance + ?
            WHERE id = ?
          `).run(depositPaidAmount, depositPaidAmount, activeSes.id);
        }
      }

      // 3. Record remainder rental payment if any
      if (remainderPaidAmount > 0) {
        const remNum = `PAY-REM-${Date.now().toString().slice(-5)}`;
        tDb.prepare(`
          INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method)
          VALUES (?, ?, ?, 'BOOKING', ?, 'RENTAL_REMAINDER', ?, ?)
        `).run(remNum, activeSes ? activeSes.id : null, booking.customer_id, bookingId, remainderPaidAmount, paymentMethod);

        if (paymentMethod === 'CASH' && activeSes) {
          tDb.prepare(`
            INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
            VALUES (?, 'IN', 'RENTAL', ?, 'BOOKING', ?, ?)
          `).run(activeSes.id, remainderPaidAmount, bookingId, `سداد باقي إيجار حجز #${booking.booking_number}`);

          tDb.prepare(`
            UPDATE cash_sessions
            SET total_cash_in = total_cash_in + ?,
                calculated_balance = calculated_balance + ?
            WHERE id = ?
          `).run(remainderPaidAmount, remainderPaidAmount, activeSes.id);
        }
      }

      // 4. Update suit units to IN_USE
      const items = tDb.prepare('SELECT suit_unit_id FROM booking_items WHERE booking_id = ?').all(bookingId);
      for (const it of items) {
        if (it.suit_unit_id) {
          tDb.prepare("UPDATE suit_units SET status = 'IN_USE', rental_count = rental_count + 1 WHERE id = ?").run(it.suit_unit_id);
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, 'BOOKED', 'IN_USE', 'تسليم البدلة للعميل واستلام التأمين', 'BOOKING', ?)
          `).run(it.suit_unit_id, bookingId);
        }
      }

      // 5. History log
      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, ?, 'DELIVERED', ?)
      `).run(bookingId, booking.status, `تم تسليم البدلة للعميل وسداد تأمين: ${depositPaidAmount} ج.م`);

      logger.info(`Booking #${bookingId} handed over to customer successfully.`);
      return { success: true, bookingId, status: 'DELIVERED' };
    });
  }

  returnAndSettleBooking(bookingId, actualReturnDate, damageFee = 0, inspectionNotes = '') {
    const db = this.dbConn.getDb();
    const policies = this.adminService.getRentalPolicies();
    const applyLateFee = policies.applyLateFee !== false && String(policies.applyLateFee) !== '0';
    const lateFeePerDay = applyLateFee ? (Number(policies.lateFeePerDay) >= 0 ? Number(policies.lateFeePerDay) : 300) : 0;
    const allowGracePeriod = policies.allowGracePeriod !== false && String(policies.allowGracePeriod) !== '0';
    const graceHours = allowGracePeriod ? (Number(policies.allowGracePeriodHours) || 0) : 0;

    return TransactionHelper.runInTransaction(db, (tDb) => {
      const booking = tDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
      if (!booking || ['COMPLETED', 'CANCELLED'].includes(booking.status)) {
        throw new Error('الحجز غير متاح للإرجاع (الحجز مكتمل بالفعل أو ملغي).');
      }

      // Calculate days late considering grace period
      const dueDate = new Date(booking.return_due_date + 'T23:59:59');
      const retDate = new Date(actualReturnDate);
      const graceMs = graceHours * 60 * 60 * 1000;
      const effectiveDueDate = new Date(dueDate.getTime() + graceMs);
      const diffTime = retDate.getTime() - effectiveDueDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const lateDays = (!applyLateFee || diffDays <= 0) ? 0 : diffDays;
      const lateFee = applyLateFee ? (lateDays * lateFeePerDay) : 0;

      // Settlement: Refund = Deposit Paid - Damage Fee - Late Fee
      const totalDeductions = damageFee + lateFee;
      const refundAmount = Math.max(0, (booking.deposit_paid || 0) - totalDeductions);
      const remainingOwed = Math.max(0, totalDeductions - (booking.deposit_paid || 0));

      // 1. Update Booking
      tDb.prepare(`
        UPDATE bookings
        SET status = 'COMPLETED',
            actual_return_date = ?,
            late_fee = ?,
            damage_fee = ?,
            deposit_refunded = ?,
            notes = COALESCE(notes || ' | ', '') || ?
        WHERE id = ?
      `).run(actualReturnDate, lateFee, damageFee, refundAmount, inspectionNotes, bookingId);

      // Record cash refund for deposit settlement if session is active
      const activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
      if (refundAmount > 0 && activeSes) {
        tDb.prepare(`
          INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes)
          VALUES (?, 'OUT', 'DEPOSIT_REFUND', ?, 'BOOKING', ?, ?)
        `).run(activeSes.id, refundAmount, bookingId, `رد تأمين أمانات حجز #${booking.booking_number}`);

        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_out = total_cash_out + ?,
              calculated_balance = calculated_balance - ?
          WHERE id = ?
        `).run(refundAmount, refundAmount, activeSes.id);
      }

      // 2. Return Units: mark IN_CLEANING
      const items = tDb.prepare('SELECT suit_unit_id FROM booking_items WHERE booking_id = ?').all(bookingId);
      for (const it of items) {
        if (it.suit_unit_id) {
          const unit = tDb.prepare('SELECT status FROM suit_units WHERE id = ?').get(it.suit_unit_id);
          const oldUnitStatus = unit ? unit.status : (booking.status === 'DELIVERED' ? 'IN_USE' : 'BOOKED');
          tDb.prepare("UPDATE suit_units SET status = 'IN_CLEANING' WHERE id = ?").run(it.suit_unit_id);
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, ?, 'IN_CLEANING', 'إرجاع البدلة من العميل وإرسالها للتنظيف', 'BOOKING', ?)
          `).run(it.suit_unit_id, oldUnitStatus, bookingId);
        }
      }

      // 3. Record status history
      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, ?, 'COMPLETED', ?)
      `).run(bookingId, booking.status, `تم استلام البدلة وفحصها وتصفية الحجز: تأخير=${lateDays} أيام (غرامة=${lateFee})، تلفيات=${damageFee}، مسترد=${refundAmount} ج.م`);

      // 4. Mark any related tasks for this booking as COMPLETED
      tDb.prepare(`
        UPDATE tasks
        SET status = 'COMPLETED', completed_at = datetime('now')
        WHERE booking_id = ? AND status != 'COMPLETED'
      `).run(bookingId);

      logger.info(`Booking #${bookingId} returned and settled: LateDays=${lateDays}, LateFee=${lateFee}, Refund=${refundAmount}`);
      return {
        bookingId,
        status: 'COMPLETED',
        lateDays,
        lateFee,
        damageFee,
        depositPaid: booking.deposit_paid,
        refundAmount,
        remainingOwed
      };
    });
  }

  cancelBooking(bookingId, reason = 'إلغاء بناء على طلب العميل') {
    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      const booking = tDb.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
      if (!booking || ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(booking.status)) {
        throw new Error('لا يمكن إلغاء الحجز في حالته الحالية.');
      }

      tDb.prepare("UPDATE bookings SET status = 'CANCELLED', cancellation_reason = ? WHERE id = ?").run(reason, bookingId);

      // Release suit units back to AVAILABLE
      const items = tDb.prepare('SELECT suit_unit_id FROM booking_items WHERE booking_id = ?').all(bookingId);
      for (const it of items) {
        if (it.suit_unit_id) {
          tDb.prepare("UPDATE suit_units SET status = 'AVAILABLE' WHERE id = ?").run(it.suit_unit_id);
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, 'BOOKED', 'AVAILABLE', 'إلغاء الحجز وإتاحة القطعة', 'BOOKING', ?)
          `).run(it.suit_unit_id, bookingId);
        }
      }

      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, ?, 'CANCELLED', ?)
      `).run(bookingId, booking.status, reason);

      logger.info(`Booking #${bookingId} cancelled: ${reason}`);
      return true;
    });
  }
}

const bookingEngineService = new BookingEngineService();
module.exports = { bookingEngineService, BookingEngineService };
