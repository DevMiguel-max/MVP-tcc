#!/usr/bin/env tsx
/**
 * Seed script — cria o banco e os pontos de exemplo.
 * Já é feito automaticamente pelo `next dev`, mas este script permite
 * garantir que o banco existe antes de rodar o simulador.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { initDatabase } from "../src/lib/schema";

const dbPath = process.env.OREMETRIX_DB_PATH ?? path.join(process.cwd(), "data", "oremetrix.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
initDatabase(db as any);
db.close();

console.log(`[seed] Banco criado/atualizado: ${dbPath}`);
