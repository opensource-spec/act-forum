import { readFileSync } from 'node:fs';

export function initializeDatabase(db) {
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  db.exec(`CREATE TABLE IF NOT EXISTS local_users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,hash TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS local_sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES local_users(id),expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS local_sessions_expiry ON local_sessions(expires);
    CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY);`);
  const migrations = JSON.parse(readFileSync(new URL('../db/migrations.json', import.meta.url), 'utf8'));
  for (const migration of migrations) {
    if (db.prepare('SELECT name FROM local_migrations WHERE name=?').get(migration.name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql.replaceAll('--> statement-breakpoint', ''));
      db.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(migration.name);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function databaseAdapter(db) {
  return {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async all() { return { results: db.prepare(sql).all(...this.values) }; },
        async first() { return db.prepare(sql).get(...this.values) || null; },
        async run() { return db.prepare(sql).run(...this.values); },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map((statement) => db.prepare(statement.sql).run(...statement.values));
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
