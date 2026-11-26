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
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `);

    stmt.run(data.name || null, data.alt_phone || null, data.address || null, data.chest_size || null, data.waist_size || null, data.trouser_length || null, data.shoe_size || null, data.notes || null, customerId);
    logger.info(`Updated customer #${customerId}`);
    return true;
  }

  // =========================================================================
  // 2. AVAILABILITY CHECKER WITH BUFFER DAYS (فحص التوفر وفترة الأمان)
  // =========================================================================

  checkUnitAvailability(unitId, pickupDate, returnDueDate, excludeBookingId = null) {
    const db = this.dbConn.getDb();

    // Query overlapping active bookings:
    // A collision occurs if the requested range [pickupDate, returnDueDate] overlaps with any active booking's range [b.pickup_date, b.return_due_date]
    // Condition: b.pickup_date <= returnDueDate AND b.return_due_date >= pickupDate
    const sql = `
      SELECT b.id, b.booking_number, b.pickup_date, b.return_due_date, b.status
      FROM booking_items bi
      JOIN bookings b ON bi.booking_id = b.id
      WHERE bi.suit_unit_id = ?
        AND (? IS NULL OR b.id != ?)
        AND b.status NOT IN ('CANCELLED', 'COMPLETED', 'RETURNED')
        AND (b.pickup_date <= ? AND b.return_due_date >= ?)
      ORDER BY b.return_due_date DESC
      LIMIT 1
    `;

    const safeExcludeId = (excludeBookingId !== undefined && excludeBookingId !== null && excludeBookingId !== '') ? Number(excludeBookingId) : null;
    const row = db.prepare(sql).get(Number(unitId), safeExcludeId, safeExcludeId, returnDueDate, pickupDate);

    const isAvailable = !row;
    let nextAvailableDate = null;
    if (row && row.return_due_date) {
      const d = new Date(row.return_due_date);
      d.setDate(d.getDate() + 1);
      nextAvailableDate = d.toISOString().slice(0, 10);
    }

    return {
      unitId,
      isAvailable,
      conflictingBooking: row || null,
      nextAvailableDate
    };
  }

  // =========================================================================
  // 3. BOOKING ENGINE: LIFECYCLE, HANDOVER, RETURNS & SETTLEMENTS
  // =========================================================================

  getBookings(filters = {}) {
    let sql = `
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             (SELECT COUNT(*) FROM booking_items bi WHERE bi.booking_id = b.id) as items_count,
             (SELECT GROUP_CONCAT(COALESCE(m.name, p.name, bi.item_type, 'صنف')) FROM booking_items bi LEFT JOIN suit_units u ON bi.suit_unit_id = u.id LEFT JOIN suit_models m ON u.suit_model_id = m.id LEFT JOIN product_variants pv ON bi.product_variant_id = pv.id LEFT JOIN products p ON pv.product_id = p.id WHERE bi.booking_id = b.id) as items_summary
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
    params.push(filters.limit || 1000);

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
      SELECT bi.*, 
             COALESCE(u.unit_barcode, pv.barcode, pv.sku, '') as unit_barcode,
             u.serial_number,
             COALESCE(u.warehouse_id, psb.warehouse_id, 1) as warehouse_id,
             COALESCE(m.name, p.name, bi.item_type) as model_name,
             COALESCE(m.category_id, p.category_id, 1) as category_id,
             COALESCE(cat.name, pcat.name, bi.item_type) as category_name,
             COALESCE(w.name, pw.name, 'المخزن الرئيسي') as warehouse_name,
             COALESCE(s.name, ps.name, '—') as size_name,
             COALESCE(col.name, pcol.name, '—') as color_name
      FROM booking_items bi
      LEFT JOIN suit_units u ON bi.suit_unit_id = u.id
      LEFT JOIN suit_models m ON u.suit_model_id = m.id
      LEFT JOIN categories cat ON m.category_id = cat.id
      LEFT JOIN warehouses w ON u.warehouse_id = w.id
      LEFT JOIN sizes s ON u.size_id = s.id
      LEFT JOIN colors col ON m.color_id = col.id
      LEFT JOIN product_variants pv ON bi.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN categories pcat ON p.category_id = pcat.id
      LEFT JOIN sizes ps ON pv.size_id = ps.id
      LEFT JOIN colors pcol ON pv.color_id = pcol.id
      LEFT JOIN stock_balances psb ON psb.product_variant_id = pv.id
      LEFT JOIN warehouses pw ON psb.warehouse_id = pw.id
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
        totalDeposit += Number(it.deposit_price !== undefined ? it.deposit_price : it.security_deposit) || 0;
      }

      const discountNum = Number(discount_amount) || 0;
      const finalAmount = Math.max(0, totalRental - discountNum);
      const paidAdvanceNum = Number(paid_advance) || 0;
      const paid = Math.min(finalAmount, paidAdvanceNum);
      const bookingNumber = `BK-${Date.now().toString().slice(-6)}`;
      const cleanMethod = String(payment_method || 'CASH').trim().toUpperCase();

      // 3. Insert Booking
      const bStmt = tDb.prepare(`
        INSERT INTO bookings (
          booking_number, customer_id, event_date, pickup_date, return_due_date,
          total_rental_amount, total_deposit_amount, discount_amount, final_amount, paid_amount,
          deposit_paid, deposit_refunded, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'CONFIRMED', ?)
      `);

      const bRes = bStmt.run(
        bookingNumber, customer_id, event_date, pickup_date, return_due_date,
        totalRental, totalDeposit, discountNum, finalAmount, paid, notes
      );
      const bookingId = bRes.lastInsertRowid;

      // 4. Insert Items and mark unit as BOOKED
      const itStmt = tDb.prepare(`
        INSERT INTO booking_items (booking_id, suit_unit_id, product_variant_id, item_type, rental_price, deposit_price, tailoring_notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'BOOKED')
      `);

      for (const it of items) {
        const itemDeposit = Number(it.deposit_price !== undefined ? it.deposit_price : it.security_deposit) || 0;
        const itemType = it.item_type || it.category_name || 'SUIT';
        const unitId = it.suit_unit_id || it.unit_id || null;
        const variantId = it.product_variant_id || it.variant_id || null;
        itStmt.run(bookingId, unitId, variantId, itemType, it.rental_price, itemDeposit, it.tailoring_notes || null);
        if (unitId) {
          const currentUnit = tDb.prepare("SELECT status FROM suit_units WHERE id = ?").get(unitId);
          const currentStat = currentUnit ? currentUnit.status : 'AVAILABLE';
          // If unit is currently rented / in use by an active previous booking, keep its active physical status until returned
          const targetStatus = ['RENTED', 'IN_USE'].includes(currentStat) ? currentStat : 'BOOKED';
          tDb.prepare("UPDATE suit_units SET status = ? WHERE id = ?").run(targetStatus, unitId);
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, ?, ?, 'تأكيد حجز العميل', 'BOOKING', ?)
          `).run(unitId, currentStat, targetStatus, bookingId);
        } else if (variantId) {
          tDb.prepare("UPDATE stock_balances SET quantity_reserved = quantity_reserved + 1 WHERE product_variant_id = ?").run(variantId);
        }
      }

      // 5. If advance paid, record payment and cash transaction
      if (paid > 0) {
        let activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
        if (!activeSes) {
          const sessionCode = `SES-AUTO-${Date.now().toString().slice(-6)}`;
          const autoRes = tDb.prepare(`
            INSERT INTO cash_sessions (session_code, status, opening_balance, calculated_balance, total_cash_in, total_cash_out, opened_at)
            VALUES (?, 'OPEN', 0, 0, 0, 0, datetime('now', 'localtime'))
          `).run(sessionCode);
          activeSes = { id: autoRes.lastInsertRowid };
          logger.info(`Auto-opened cash session #${activeSes.id} (${sessionCode}) for booking advance`);
        }

        const payNum = `PAY-ADV-${Date.now().toString().slice(-5)}`;
        logger.info(`Recording advance payment: amount=${paid}, method=${cleanMethod}, sessionId=${activeSes.id}`);

        tDb.prepare(`
          INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method, created_at)
          VALUES (?, ?, ?, 'BOOKING', ?, 'RENTAL_ADVANCE', ?, ?, datetime('now', 'localtime'))
        `).run(payNum, activeSes.id, customer_id, bookingId, paid, cleanMethod);

        // Always record transaction in cash_transactions with proper category
        const category = cleanMethod === 'CASH' ? 'RENTAL' : cleanMethod;
        tDb.prepare(`
          INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes, created_at)
          VALUES (?, 'IN', ?, ?, 'BOOKING', ?, ?, datetime('now', 'localtime'))
        `).run(activeSes.id, category, paid, bookingId, `عربون حجز #${bookingNumber} (${cleanMethod})`);

        // Only update cash drawer balance for CASH payments
        if (cleanMethod === 'CASH') {
          tDb.prepare(`
            UPDATE cash_sessions
            SET total_cash_in = total_cash_in + ?,
                calculated_balance = calculated_balance + ?
            WHERE id = ?
          `).run(paid, paid, activeSes.id);
          logger.info(`Updated cash session balance: +${paid} EGP for session #${activeSes.id}`);
        } else {
          logger.info(`Non-cash advance recorded: ${cleanMethod} ${paid} EGP (drawer balance not modified)`);
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

  updateBooking(bookingId, {
    customer_id,
    event_date,
    pickup_date,
    return_due_date,
    items = [], // [{ suit_unit_id, rental_price, deposit_price, tailoring_notes }]
    discount_amount = 0,
    paid_advance = null,
    payment_method = 'CASH',
    notes = ''
  }) {
    if (!bookingId) throw new Error('معرف الحجز مطلوب للتعديل.');

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

    if (!pickup_date || !return_due_date) {
      throw new Error('تاريخ الاستلام وتاريخ الإرجاع حقول إلزامية.');
    }
    if (items.length === 0) {
      throw new Error('يجب اختيار قطعة واحدة على الأقل للحجز.');
    }
    if (new Date(return_due_date) < new Date(pickup_date)) {
      throw new Error('تاريخ الإرجاع يجب أن يلي تاريخ الاستلام.');
    }

    const db = this.dbConn.getDb();

    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Fetch existing booking & verify status
      const existing = tDb.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
      if (!existing) {
        throw new Error(`الحجز رقم #${bookingId} غير موجود.`);
      }

      // Check if booking has already been delivered / completed / cancelled
      if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(existing.status)) {
        throw new Error('لا يمكن تعديل الحجز بعد تسليم البدلة للعميل أو اكتمال/إلغاء الحجز.');
      }

      // 2. Strict Availability & Collision Verification (excluding this booking)
      for (const item of items) {
        if (item.suit_unit_id) {
          const avail = this.checkUnitAvailability(item.suit_unit_id, pickup_date, return_due_date, bookingId);
          if (!avail.isAvailable) {
            throw new Error(`تعارض زمني: القطعة رقم #${item.suit_unit_id} محجوزة بالفعل في حجز آخر #${avail.conflictingBooking.booking_number}.`);
          }
        }
      }

      // 3. Handle previously booked units and stock (release units no longer in the booking)
      const prevItems = tDb.prepare("SELECT suit_unit_id, product_variant_id FROM booking_items WHERE booking_id = ?").all(bookingId);
      const prevUnitIds = prevItems.map(p => p.suit_unit_id).filter(Boolean);
      const newUnitIds = items.map(it => it.suit_unit_id || it.unit_id).filter(Boolean);

      const unitsToRelease = prevUnitIds.filter(uid => !newUnitIds.includes(uid));
      for (const uid of unitsToRelease) {
        tDb.prepare("UPDATE suit_units SET status = 'AVAILABLE' WHERE id = ?").run(uid);
        tDb.prepare(`
          INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
          VALUES (?, 'BOOKED', 'AVAILABLE', 'تعديل حجز وإزالة القطعة منه', 'BOOKING', ?)
        `).run(uid, bookingId);
      }
      for (const pi of prevItems) {
        if (pi.product_variant_id) {
          tDb.prepare("UPDATE stock_balances SET quantity_reserved = MAX(0, quantity_reserved - 1) WHERE product_variant_id = ?").run(pi.product_variant_id);
        }
      }

      // 4. Calculate Totals
      let totalRental = 0;
      let totalDeposit = 0;
      for (const it of items) {
        totalRental += Number(it.rental_price) || 0;
        totalDeposit += Number(it.deposit_price !== undefined ? it.deposit_price : it.security_deposit) || 0;
      }

      const discountNum = Number(discount_amount) || 0;
      const finalAmount = Math.max(0, totalRental - discountNum);

      // Handle advance payments if specified
      let newPaidAmount = existing.paid_amount;
      const cleanMethod = String(payment_method || 'CASH').trim().toUpperCase();

      if (paid_advance !== null && paid_advance !== undefined) {
        const targetAdvance = Number(paid_advance) || 0;
        const additionalPaid = targetAdvance - existing.paid_amount;

        if (additionalPaid > 0) {
          // Additional advance payment received
          let activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
          if (!activeSes) {
            const sessionCode = `SES-AUTO-${Date.now().toString().slice(-6)}`;
            const autoRes = tDb.prepare(`
              INSERT INTO cash_sessions (session_code, status, opening_balance, calculated_balance, total_cash_in, total_cash_out, opened_at)
              VALUES (?, 'OPEN', 0, 0, 0, 0, datetime('now', 'localtime'))
            `).run(sessionCode);
            activeSes = { id: autoRes.lastInsertRowid };
          }

          const payNum = `PAY-ADV-MOD-${Date.now().toString().slice(-5)}`;
          tDb.prepare(`
            INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method, created_at)
            VALUES (?, ?, ?, 'BOOKING', ?, 'RENTAL_ADVANCE', ?, ?, datetime('now', 'localtime'))
          `).run(payNum, activeSes.id, customer_id || existing.customer_id, bookingId, additionalPaid, cleanMethod);

          const category = cleanMethod === 'CASH' ? 'RENTAL' : cleanMethod;
          tDb.prepare(`
            INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes, created_at)
            VALUES (?, 'IN', ?, ?, 'BOOKING', ?, ?, datetime('now', 'localtime'))
          `).run(activeSes.id, category, additionalPaid, bookingId, `عربون إضافي بتعديل حجز #${existing.booking_number} (${cleanMethod})`);

          if (cleanMethod === 'CASH') {
            tDb.prepare(`
              UPDATE cash_sessions
              SET total_cash_in = total_cash_in + ?,
                  calculated_balance = calculated_balance + ?
              WHERE id = ?
            `).run(additionalPaid, additionalPaid, activeSes.id);
          }
          newPaidAmount += additionalPaid;
        }
      }

      // 5. Replace booking items
      tDb.prepare("DELETE FROM booking_items WHERE booking_id = ?").run(bookingId);
      const itStmt = tDb.prepare(`
        INSERT INTO booking_items (booking_id, suit_unit_id, product_variant_id, item_type, rental_price, deposit_price, tailoring_notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'BOOKED')
      `);

      for (const it of items) {
        const itemDeposit = Number(it.deposit_price !== undefined ? it.deposit_price : it.security_deposit) || 0;
        const itemType = it.item_type || it.category_name || 'SUIT';
        const unitId = it.suit_unit_id || it.unit_id || null;
        const variantId = it.product_variant_id || it.variant_id || null;
        itStmt.run(bookingId, unitId, variantId, itemType, it.rental_price, itemDeposit, it.tailoring_notes || null);
        if (unitId) {
          tDb.prepare("UPDATE suit_units SET status = 'BOOKED' WHERE id = ?").run(unitId);
        } else if (variantId) {
          tDb.prepare("UPDATE stock_balances SET quantity_reserved = quantity_reserved + 1 WHERE product_variant_id = ?").run(variantId);
        }
      }

      // 6. Update Booking
      tDb.prepare(`
        UPDATE bookings SET
          customer_id = ?,
          event_date = ?,
          pickup_date = ?,
          return_due_date = ?,
          total_rental_amount = ?,
          total_deposit_amount = ?,
          discount_amount = ?,
          final_amount = ?,
          paid_amount = ?,
          notes = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        customer_id || existing.customer_id,
        event_date || pickup_date,
        pickup_date,
        return_due_date,
        totalRental,
        totalDeposit,
        discountNum,
        finalAmount,
        newPaidAmount,
        notes !== undefined ? notes : existing.notes,
        bookingId
      );

      // 7. Record status history
      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, ?, ?, 'تم تعديل بيانات وأصناف الحجز')
      `).run(bookingId, existing.status, existing.status);

      logger.info(`Updated Booking #${existing.booking_number} (ID: ${bookingId})`);
      return {
        bookingId,
        bookingNumber: existing.booking_number,
        finalAmount,
        paidAmount: newPaidAmount,
        remainingAmount: finalAmount - newPaidAmount,
        totalDeposit
      };
    });
  }

  markPrepared(bookingId, notes = 'تم التجهيز بالمحل') {
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

      let activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
      if (!activeSes && (depositPaidAmount > 0 || remainderPaidAmount > 0)) {
        const sessionCode = `SES-AUTO-${Date.now().toString().slice(-6)}`;
        const autoRes = tDb.prepare(`
          INSERT INTO cash_sessions (session_code, status, opening_balance, calculated_balance, total_cash_in, total_cash_out, opened_at)
          VALUES (?, 'OPEN', 0, 0, 0, 0, datetime('now', 'localtime'))
        `).run(sessionCode);
        activeSes = { id: autoRes.lastInsertRowid };
        logger.info(`Auto-opened cash session #${activeSes.id} (${sessionCode}) for handover payment`);
      }

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

  returnAndSettleBooking(bookingId, actualReturnDate, damageFee = 0, inspectionNotes = '', remainingPaid = false) {
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

      // Calculate days late considering calendar dates and grace period
      const dueStr = String(booking.return_due_date || '').slice(0, 10);
      const retStr = String(actualReturnDate || new Date().toISOString()).slice(0, 10);

      let lateDays = 0;
      if (dueStr && retStr) {
        const [dY, dM, dD] = dueStr.split('-').map(Number);
        const [rY, rM, rD] = retStr.split('-').map(Number);
        const dueMidnight = new Date(dY, dM - 1, dD, 0, 0, 0).getTime();
        const retMidnight = new Date(rY, rM - 1, rD, 0, 0, 0).getTime();
        const calendarDaysLate = Math.round((retMidnight - dueMidnight) / (1000 * 60 * 60 * 24));

        if (calendarDaysLate > 0) {
          if (calendarDaysLate === 1 && allowGracePeriod && graceHours > 0 && String(actualReturnDate).includes('T')) {
            const dueTime = new Date(dY, dM - 1, dD, 23, 59, 59).getTime();
            const retTime = new Date(actualReturnDate).getTime();
            if (retTime <= dueTime + (graceHours * 3600000)) {
              lateDays = 0;
            } else {
              lateDays = calendarDaysLate;
            }
          } else {
            lateDays = calendarDaysLate;
          }
        }
      }

      const lateFeePerDay = Number(policies.lateFeePerDay) > 0 ? Number(policies.lateFeePerDay) : 300;
      const lateFee = lateDays > 0 ? (lateDays * lateFeePerDay) : 0;
      const damageFeeNum = Math.max(0, Number(damageFee) || 0);
      logger.info(`Late fee calculation for booking #${bookingId}: due=${dueStr}, actualReturn=${retStr}, lateDays=${lateDays}, rate=${lateFeePerDay}, fee=${lateFee}`);

      // Calculate remaining rental amount
      const finalAmount = Number(booking.final_amount) || 0;
      const currentPaid = Number(booking.paid_amount) || 0;
      const rentalRemaining = Math.max(0, finalAmount - currentPaid);
      logger.info(`Return settlement for booking #${bookingId}: final_amount=${finalAmount}, currentPaid=${currentPaid}, remaining=${rentalRemaining}, remainingPaid=${remainingPaid}`);

      // Ensure open cash session
      let activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
      if (!activeSes) {
        const sessionCode = `SES-AUTO-${Date.now().toString().slice(-6)}`;
        const autoRes = tDb.prepare(`
          INSERT INTO cash_sessions (session_code, status, opening_balance, calculated_balance, total_cash_in, total_cash_out, opened_at)
          VALUES (?, 'OPEN', 0, 0, 0, 0, datetime('now', 'localtime'))
        `).run(sessionCode);
        activeSes = { id: autoRes.lastInsertRowid };
        logger.info(`Auto-opened cash session #${activeSes.id} (${sessionCode}) for return settlement`);
      }

      let newPaidAmount = currentPaid;
      let recordedDebt = 0;

      // Settle rental remaining (Debt vs Paid Now)
      if (rentalRemaining > 0) {
        if (!remainingPaid) {
          // Record customer debt in payments (NO cash_transactions because customer hasn't paid)
          const debtNum = `DEBT-${Date.now().toString().slice(-5)}`;
          tDb.prepare(`
            INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method, created_at)
            VALUES (?, NULL, ?, 'BOOKING', ?, 'CUSTOMER_DEBT', ?, 'DEBT', datetime('now', 'localtime'))
          `).run(debtNum, booking.customer_id, bookingId, rentalRemaining);
          recordedDebt = rentalRemaining;
          logger.info(`Recorded CUSTOMER_DEBT in payments: ${debtNum}, amount: ${rentalRemaining}, booking: #${bookingId}, customer: #${booking.customer_id}`);
        } else {
          // Customer settled the remaining balance at return
          const payNum = `PAY-REM-${Date.now().toString().slice(-5)}`;
          tDb.prepare(`
            INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method, created_at)
            VALUES (?, ?, ?, 'BOOKING', ?, 'RENTAL_REMAINDER', ?, 'CASH', datetime('now', 'localtime'))
          `).run(payNum, activeSes.id, booking.customer_id, bookingId, rentalRemaining);

          tDb.prepare(`
            INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes, created_at)
            VALUES (?, 'IN', 'RENTAL', ?, 'BOOKING', ?, ?, datetime('now', 'localtime'))
          `).run(activeSes.id, rentalRemaining, bookingId, `تحصيل باقي إيجار عند الإرجاع حجز #${booking.booking_number}`);

          tDb.prepare(`
            UPDATE cash_sessions
            SET total_cash_in = total_cash_in + ?,
                calculated_balance = calculated_balance + ?
            WHERE id = ?
          `).run(rentalRemaining, rentalRemaining, activeSes.id);

          newPaidAmount = currentPaid + rentalRemaining;
          logger.info(`Recorded remaining rental payment at return: amount=${rentalRemaining}, session #${activeSes.id}`);
        }
      }

      // Settlement of Security Deposit:
      // Refund = Deposit Paid - Damage Fee - Late Fee
      const totalDeductions = damageFeeNum + lateFee;
      const depositPaid = Number(booking.deposit_paid) || 0;
      const refundAmount = Math.max(0, depositPaid - totalDeductions);
      const remainingOwed = Math.max(0, totalDeductions - depositPaid);

      // 1. Update Booking record
      tDb.prepare(`
        UPDATE bookings
        SET status = 'COMPLETED',
            actual_return_date = ?,
            late_fee = ?,
            damage_fee = ?,
            deposit_refunded = ?,
            paid_amount = ?,
            notes = COALESCE(notes || ' | ', '') || ?
        WHERE id = ?
      `).run(actualReturnDate, lateFee, damageFeeNum, refundAmount, newPaidAmount, inspectionNotes, bookingId);

      // 2. Refund cash from drawer if refundAmount > 0
      if (refundAmount > 0 && activeSes) {
        tDb.prepare(`
          INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes, created_at)
          VALUES (?, 'OUT', 'DEPOSIT_REFUND', ?, 'BOOKING', ?, ?, datetime('now', 'localtime'))
        `).run(activeSes.id, refundAmount, bookingId, `رد تأمين أمانات حجز #${booking.booking_number}`);

        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_out = total_cash_out + ?,
              calculated_balance = calculated_balance - ?
          WHERE id = ?
        `).run(refundAmount, refundAmount, activeSes.id);
        logger.info(`Refunded deposit from cash drawer: amount=${refundAmount}, session #${activeSes.id}`);
      }

      // 3. Return Units: AVAILABLE if clean (no damage and no late fee), IN_CLEANING if damaged or late
      const isClean = (damageFeeNum === 0 && lateFee === 0);
      const newStatus = isClean ? 'AVAILABLE' : 'IN_CLEANING';
      const reason = isClean
        ? 'إرجاع البدلة سليمة ومتاحة للإيجار فوراً'
        : `إرجاع البدلة من العميل (غرامة=${lateFee}، تلفيات=${damageFeeNum}) وإرسالها للتنظيف`;

      logger.info(`Suit unit status after return: damageFee=${damageFeeNum}, lateFee=${lateFee}, isClean=${isClean}, newStatus=${newStatus}`);

      const items = tDb.prepare('SELECT suit_unit_id FROM booking_items WHERE booking_id = ?').all(bookingId);
      for (const it of items) {
        if (it.suit_unit_id) {
          const unit = tDb.prepare('SELECT status FROM suit_units WHERE id = ?').get(it.suit_unit_id);
          const oldUnitStatus = unit ? unit.status : (booking.status === 'DELIVERED' ? 'IN_USE' : 'BOOKED');
          // Check if there is another confirmed future booking for this unit
          const nextBooking = tDb.prepare(`
            SELECT b.id FROM booking_items bi
            JOIN bookings b ON bi.booking_id = b.id
            WHERE bi.suit_unit_id = ? AND b.status = 'CONFIRMED'
            ORDER BY b.pickup_date ASC LIMIT 1
          `).get(it.suit_unit_id);
          const targetReturnStatus = nextBooking ? 'BOOKED' : newStatus;
          tDb.prepare("UPDATE suit_units SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(targetReturnStatus, it.suit_unit_id);
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id, created_at)
            VALUES (?, ?, ?, ?, 'BOOKING', ?, datetime('now', 'localtime'))
          `).run(it.suit_unit_id, oldUnitStatus, targetReturnStatus, reason, bookingId);
        }
      }
      tDb.prepare("UPDATE booking_items SET status = 'RETURNED' WHERE booking_id = ?").run(bookingId);

      // 4. Record status history
      const debtNote = recordedDebt > 0 ? ` | دين على العميل: ${recordedDebt} ج.م` : '';
      tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes, created_at)
        VALUES (?, ?, 'COMPLETED', ?, datetime('now', 'localtime'))
      `).run(bookingId, booking.status, `تم استلام البدلة وفحصها وتصفية الحجز: تأخير=${lateDays} أيام (غرامة=${lateFee})، تلفيات=${damageFeeNum}، مسترد=${refundAmount} ج.م${debtNote}`);

      // 5. Mark related tasks as COMPLETED
      tDb.prepare(`
        UPDATE tasks
        SET status = 'COMPLETED', completed_at = datetime('now', 'localtime')
        WHERE booking_id = ? AND status != 'COMPLETED'
      `).run(bookingId);

      logger.info(`Booking #${bookingId} returned and settled: LateDays=${lateDays}, LateFee=${lateFee}, Refund=${refundAmount}, CustomerDebt=${recordedDebt}`);
      return {
        bookingId,
        status: 'COMPLETED',
        lateDays,
        lateFee,
        damageFee: damageFeeNum,
        depositPaid: booking.deposit_paid,
        refundAmount,
        remainingOwed,
        customerDebt: recordedDebt
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

      // Release suit units back to AVAILABLE and decrease quantity_reserved
      const items = tDb.prepare('SELECT suit_unit_id, product_variant_id FROM booking_items WHERE booking_id = ?').all(bookingId);
      for (const it of items) {
        if (it.suit_unit_id) {
          tDb.prepare("UPDATE suit_units SET status = 'AVAILABLE' WHERE id = ?").run(it.suit_unit_id);
          tDb.prepare(`
            INSERT INTO unit_status_history (suit_unit_id, old_status, new_status, reason, reference_type, reference_id)
            VALUES (?, 'BOOKED', 'AVAILABLE', 'إلغاء الحجز وإتاحة القطعة', 'BOOKING', ?)
          `).run(it.suit_unit_id, bookingId);
        } else if (it.product_variant_id) {
          tDb.prepare("UPDATE stock_balances SET quantity_reserved = MAX(0, quantity_reserved - 1) WHERE product_variant_id = ?").run(it.product_variant_id);
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

  /**
   * تحصيل دين عميل مسجل من حجز سابق
   */
  collectDebt({
    paymentId,
    amount,
    paymentMethod = 'CASH',
    notes = ''
  }) {
    if (!paymentId) {
      throw new Error('معرف الدين (paymentId) حقل إلزامي.');
    }

    const db = this.dbConn.getDb();
    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Fetch debt record
      const debt = tDb.prepare("SELECT * FROM payments WHERE id = ? AND payment_type = 'CUSTOMER_DEBT'").get(paymentId);
      if (!debt) {
        throw new Error(`سجل الدين رقم #${paymentId} غير موجود أو تم تحصيله مسبقاً.`);
      }

      const debtAmount = Number(debt.amount) || 0;
      const collectAmount = amount !== undefined && amount !== null && Number(amount) > 0
        ? Math.min(debtAmount, Number(amount))
        : debtAmount;

      if (collectAmount <= 0) {
        throw new Error('مبلغ التحصيل يجب أن يكون أكبر من الصفر.');
      }

      const cleanMethod = String(paymentMethod || 'CASH').trim().toUpperCase();

      // 2. Fetch booking details
      const booking = tDb.prepare('SELECT * FROM bookings WHERE id = ?').get(debt.reference_id);
      const bookingNumber = booking ? booking.booking_number : `BK-${debt.reference_id}`;

      // 3. Ensure active cash session exists
      let activeSes = tDb.prepare("SELECT id FROM cash_sessions WHERE status = 'OPEN' LIMIT 1").get();
      if (!activeSes) {
        const sessionCode = `SES-AUTO-${Date.now().toString().slice(-6)}`;
        const autoRes = tDb.prepare(`
          INSERT INTO cash_sessions (session_code, status, opening_balance, calculated_balance, total_cash_in, total_cash_out, opened_at)
          VALUES (?, 'OPEN', 0, 0, 0, 0, datetime('now', 'localtime'))
        `).run(sessionCode);
        activeSes = { id: autoRes.lastInsertRowid };
        logger.info(`Auto-opened cash session #${activeSes.id} (${sessionCode}) for debt collection`);
      }

      // 4. Insert collection payment record (as RENTAL_REMAINDER so it counts in rental revenue)
      const payNum = `PAY-REM-${Date.now().toString().slice(-5)}`;
      tDb.prepare(`
        INSERT INTO payments (payment_number, cash_session_id, customer_id, reference_type, reference_id, payment_type, amount, payment_method, created_at)
        VALUES (?, ?, ?, 'BOOKING', ?, 'RENTAL_REMAINDER', ?, ?, datetime('now', 'localtime'))
      `).run(payNum, activeSes.id, debt.customer_id, debt.reference_id, collectAmount, cleanMethod);

      // 5. If CASH, update cash_transactions and cash_sessions
      const category = cleanMethod === 'CASH' ? 'RENTAL' : cleanMethod;
      const txNote = `تحصيل دين حجز #${bookingNumber} (${cleanMethod})${notes ? ' - ' + notes : ''}`;
      tDb.prepare(`
        INSERT INTO cash_transactions (cash_session_id, transaction_type, category, amount, reference_type, reference_id, notes, created_at)
        VALUES (?, 'IN', ?, ?, 'BOOKING', ?, ?, datetime('now', 'localtime'))
      `).run(activeSes.id, category, collectAmount, debt.reference_id, txNote);

      if (cleanMethod === 'CASH') {
        tDb.prepare(`
          UPDATE cash_sessions
          SET total_cash_in = total_cash_in + ?,
              calculated_balance = calculated_balance + ?
          WHERE id = ?
        `).run(collectAmount, collectAmount, activeSes.id);
        logger.info(`Updated cash session balance after debt collection: +${collectAmount} EGP for session #${activeSes.id}`);
      } else {
        logger.info(`Debt collected via ${cleanMethod} (${collectAmount} EGP); logged in cash_transactions without altering drawer cash.`);
      }

      // 6. Update booking paid_amount
      if (booking) {
        tDb.prepare(`
          UPDATE bookings
          SET paid_amount = paid_amount + ?
          WHERE id = ?
        `).run(collectAmount, booking.id);

        tDb.prepare(`
          INSERT INTO booking_status_history (booking_id, old_status, new_status, notes, created_at)
          VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(booking.id, booking.status, booking.status, `تم تحصيل دين بقيمة ${collectAmount} ج.م بطريقة ${cleanMethod} (${payNum})`);
      }

      // 7. Update original debt payment record
      const remainingDebt = debtAmount - collectAmount;
      if (remainingDebt <= 0) {
        tDb.prepare(`
          UPDATE payments
          SET payment_type = 'SETTLED_DEBT'
          WHERE id = ?
        `).run(debt.id);
        logger.info(`Debt payment #${debt.id} fully settled (${collectAmount} EGP).`);
      } else {
        tDb.prepare(`
          UPDATE payments
          SET amount = ?
          WHERE id = ?
        `).run(remainingDebt, debt.id);
        logger.info(`Debt payment #${debt.id} partially settled (${collectAmount} EGP collected, ${remainingDebt} EGP remaining).`);
      }

      return {
        paymentId: debt.id,
        collectedAmount: collectAmount,
        remainingDebt,
        paymentMethod: cleanMethod,
        receiptNumber: payNum,
        bookingNumber
      };
    });
  }
}

const bookingEngineService = new BookingEngineService();
module.exports = { bookingEngineService, BookingEngineService };
