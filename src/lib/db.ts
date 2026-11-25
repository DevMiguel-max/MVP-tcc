import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Db } from "./types";
import { initDatabase } from "./schema";

const globalForDb = globalThis as unknown as { __oremetrixDb?: Db };

export function resolveDbPath(): string {
  return process.env.OREMETRIX_DB_PATH ?? path.join(process.cwd(), "data", "oremetrix.db");
}

/** Conexão única (sobrevive ao hot-reload do `next dev`). Cria banco, tabelas e exemplos sozinho. */
export function getDb(): Db {
  if (!globalForDb.__oremetrixDb) {
    const file = resolveDbPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const raw = new Database(file);
    raw.pragma("journal_mode = WAL");
    raw.pragma("foreign_keys = ON");
    raw.pragma("busy_timeout = 5000");
    const db = raw as unknown as Db;
    initDatabase(db);
    globalForDb.__oremetrixDb = db;
  }
  return globalForDb.__oremetrixDb;
}
