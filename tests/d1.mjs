// Minimal D1 mock backed by node:sqlite (real SQLite semantics for UPSERT etc.)
import { DatabaseSync } from 'node:sqlite';

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  _norm(a) { return a === undefined ? null : (typeof a === 'boolean' ? (a ? 1 : 0) : a); }
  run() {
    const st = this.db.prepare(this.sql);
    const info = st.run(...this.args.map(this._norm));
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
  first(col) {
    const st = this.db.prepare(this.sql);
    const row = st.get(...this.args.map(this._norm));
    if (row === undefined) return null;
    return col ? row[col] : row;
  }
  all() {
    const st = this.db.prepare(this.sql);
    const rows = st.all(...this.args.map(this._norm));
    return { success: true, results: rows };
  }
  raw() { return this.all().results.map((r) => Object.values(r)); }
}

export function makeD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  return {
    prepare(sql) { return new Stmt(db, sql); },
    async batch(stmts) { return stmts.map((s) => s.run()); },
    async exec(sql) { db.exec(sql); return { count: 0 }; },
    _db: db,
  };
}
