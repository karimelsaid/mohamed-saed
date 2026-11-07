class CustomerRepository {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
  }

  createCustomer(c) {
    const db = this.dbConn.getDb();
    const stmt = db.prepare(`
      INSERT INTO customers (code, name, phone, alt_phone, national_id, address, chest_size, waist_size, shoe_size, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const code = c.code || `CUST-${Date.now().toString().slice(-5)}`;
    const res = stmt.run(
      code,
      c.name,
      c.phone,
      c.altPhone || null,
      c.nationalId || null,
      c.address || null,
      c.chestSize || null,
      c.waistSize || null,
      c.shoeSize || null,
      c.notes || null
    );
    return res.lastInsertRowid;
  }

  findByPhone(phone) {
    return this.dbConn.get('SELECT * FROM customers WHERE phone = ?', [phone]);
  }

  search(query) {
    const term = `%${query}%`;
    return this.dbConn.all(`
      SELECT * FROM customers
      WHERE name LIKE ? OR phone LIKE ? OR code LIKE ?
      ORDER BY id DESC LIMIT 20
    `, [term, term, term]);
  }
}

module.exports = { CustomerRepository };

