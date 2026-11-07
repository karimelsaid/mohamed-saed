class SettingsRepository {
  constructor(dbConnection) {
    this.dbConn = dbConnection;
  }

  get(key) {
    const row = this.dbConn.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  getAll() {
    const rows = this.dbConn.all('SELECT key, value, description FROM settings');
    const result = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }

  set(key, value, description = null) {
    const stmt = this.dbConn.getDb().prepare(`
      INSERT INTO settings (key, value, description, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        description = COALESCE(excluded.description, settings.description),
        updated_at = datetime('now')
    `);
    return stmt.run(key, value, description);
  }
}

module.exports = { SettingsRepository };
