class SuitUnitRepository {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
  }

  createModel(model) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO suit_models (category_id, code, name, brand, color_id, sale_price, rental_price, security_deposit, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      model.categoryId || 1,
      model.code,
      model.name,
      model.brand || null,
      model.colorId || null,
      model.salePrice || 0,
      model.rentalPrice || 0,
      model.securityDeposit || 0,
      model.description || null
    );
    return res.lastInsertRowid;
  }

  createUnit(unit) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO suit_units (suit_model_id, size_id, warehouse_id, unit_barcode, serial_number, status, purchase_date, purchase_cost, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      unit.suitModelId,
      unit.sizeId,
      unit.warehouseId || 1,
      unit.unitBarcode,
      unit.serialNumber || null,
      unit.status || 'AVAILABLE',
      unit.purchaseDate || new Date().toISOString().slice(0, 10),
      unit.purchaseCost || 0,
      unit.notes || null
    );
    return res.lastInsertRowid;
  }

  findByBarcode(barcode) {
    return this.dbConn.get(`
      SELECT u.*, m.name as model_name, m.code as model_code, m.rental_price, m.security_deposit,
             s.name as size_name, w.name as warehouse_name
      FROM suit_units u
      JOIN suit_models m ON u.suit_model_id = m.id
      JOIN sizes s ON u.size_id = s.id
      JOIN warehouses w ON u.warehouse_id = w.id
      WHERE u.unit_barcode = ?
    `, [barcode]);
  }

  /**
   * البحث عن الوحدات المتاحة لموديل معين خلال فترة زمنية محددة
   * مع استبعاد أي وحدة مرتبطة بحجز متداخل زمنيًا (Conflict-Free Availability)
   */
  findAvailableUnits(modelId, startDate, endDate) {
    const sql = `
      SELECT u.*, s.name as size_name, m.name as model_name, m.rental_price, m.security_deposit
      FROM suit_units u
      JOIN suit_models m ON u.suit_model_id = m.id
      JOIN sizes s ON u.size_id = s.id
      WHERE u.suit_model_id = ?
        AND u.status != 'RETIRED'
        AND u.status != 'DAMAGED'
        AND u.id NOT IN (
          -- استبعاد أي وحدة محجوزة في فترة تتقاطع مع الفترة المطلوبة
          SELECT bi.suit_unit_id
          FROM booking_items bi
          JOIN bookings b ON bi.booking_id = b.id
          WHERE bi.suit_unit_id IS NOT NULL
            AND b.status NOT IN ('CANCELLED', 'COMPLETED')
            AND (
              (b.pickup_date <= ? AND b.return_due_date >= ?)
              OR
              (b.pickup_date >= ? AND b.pickup_date <= ?)
              OR
              (b.return_due_date >= ? AND b.return_due_date <= ?)
            )
        )
      ORDER BY s.sort_order ASC
    `;

    return this.dbConn.all(sql, [modelId, endDate, startDate, startDate, endDate, startDate, endDate]);
  }
}

module.exports = { SuitUnitRepository };
