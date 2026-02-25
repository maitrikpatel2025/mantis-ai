import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mantisDb, dataDir, PROJECT_ROOT } from "../paths.js";
import * as schema from "./schema.js";
let _db = null;
function getDb() {
  if (!_db) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const sqlite = new Database(mantisDb);
    sqlite.pragma("journal_mode = WAL");
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}
function initDatabase() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sqlite = new Database(mantisDb);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  const migrationsFolder = path.join(PROJECT_ROOT, "node_modules", "mantis-ai", "drizzle");
  migrate(db, { migrationsFolder });
  sqlite.close();
  _db = null;
}
export {
  getDb,
  initDatabase
};
