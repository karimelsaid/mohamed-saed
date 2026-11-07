const { TransactionHelper } = require('../transaction-helper');

class BookingRepository {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
  }

  isUnitAvailable(unitId, pickupDate, returnDate) {
    const sql = `
      SELECT COUNT(*) as count
      FROM booking_items bi
      JOIN bookings b ON bi.booking_id = b.id
      WHERE bi.suit_unit_id = ?
        AND b.status NOT IN ('CANCELLED', 'COMPLETED')
        AND (
          (b.pickup_date <= ? AND b.return_due_date >= ?)
          OR
          (b.pickup_date >= ? AND b.pickup_date <= ?)
          OR
          (b.return_due_date >= ? AND b.return_due_date <= ?)
        )
    `;
    const row = this.dbConn.get(sql, [unitId, returnDate, pickupDate, pickupDate, returnDate, pickupDate, returnDate]);
    return row.count === 0;
  }

  createBookingWithItems(bookingData, items) {
    const db = this.dbConn.getDb();

    return TransactionHelper.runInTransaction(db, (tDb) => {
      // 1. Double check availability of each suit unit inside the transaction
      for (const item of items) {
        if (item.suitUnitId) {
          const availCheck = tDb.prepare(`
            SELECT COUNT(*) as count
            FROM booking_items bi
            JOIN bookings b ON bi.booking_id = b.id
            WHERE bi.suit_unit_id = ?
              AND b.status NOT IN ('CANCELLED', 'COMPLETED')
              AND (
                (b.pickup_date <= ? AND b.return_due_date >= ?)
                OR
                (b.pickup_date >= ? AND b.pickup_date <= ?)
                OR
                (b.return_due_date >= ? AND b.return_due_date <= ?)
              )
          `).get(item.suitUnitId, bookingData.returnDueDate, bookingData.pickupDate, bookingData.pickupDate, bookingData.returnDueDate, bookingData.pickupDate, bookingData.returnDueDate);

          if (availCheck.count > 0) {
            throw new Error(`تعارض زمني: البدلة رقم #${item.suitUnitId} محجوزة بالفعل خلال هذه الفترة ولا يمكن حجزها.`);
          }
        }
      }

      // 2. Insert booking record
      const bookingStmt = tDb.prepare(`
        INSERT INTO bookings (
          booking_number, customer_id, event_date, fitting_date, pickup_date, return_due_date,
          total_rental_amount, total_deposit_amount, discount_amount, final_amount, paid_amount,
          status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const bookingRes = bookingStmt.run(
        bookingData.bookingNumber,
        bookingData.customerId,
        bookingData.eventDate,
        bookingData.fittingDate || null,
        bookingData.pickupDate,
        bookingData.returnDueDate,
        bookingData.totalRentalAmount,
        bookingData.totalDepositAmount || 0,
        bookingData.discountAmount || 0,
        bookingData.finalAmount,
        bookingData.paidAmount || 0,
        bookingData.status || 'CONFIRMED',
        bookingData.notes || null
      );

      const bookingId = bookingRes.lastInsertRowid;

      // 3. Insert items
      const itemStmt = tDb.prepare(`
        INSERT INTO booking_items (booking_id, suit_unit_id, item_type, rental_price, deposit_price, tailoring_notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        itemStmt.run(
          bookingId,
          item.suitUnitId || null,
          item.itemType || 'SUIT',
          item.rentalPrice,
          item.depositPrice || 0,
          item.tailoringNotes || null
        );
      }

      // 4. Log status history
      const historyStmt = tDb.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, NULL, ?, 'تم إنشاء الحجز بنجاح')
      `);
      historyStmt.run(bookingId, bookingData.status || 'CONFIRMED');

      return bookingId;
    });
  }

  getBookingDetails(bookingId) {
    const booking = this.dbConn.get(`
      SELECT b.*, c.name as customer_name, c.phone as customer_phone
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      WHERE b.id = ?
    `, [bookingId]);

    if (!booking) return null;

    const items = this.dbConn.all(`
      SELECT bi.*, u.unit_barcode, m.name as model_name, s.name as size_name
      FROM booking_items bi
      LEFT JOIN suit_units u ON bi.suit_unit_id = u.id
      LEFT JOIN suit_models m ON u.suit_model_id = m.id
      LEFT JOIN sizes s ON u.size_id = s.id
      WHERE bi.booking_id = ?
    `, [bookingId]);

    return { ...booking, items };
  }
}

module.exports = { BookingRepository };
