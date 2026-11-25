import { createRequire } from "node:module";
import { initDatabase } from "@/lib/schema";
import { getApiKey } from "@/lib/repo";
import type { Db } from "@/lib/types";

const nodeRequire = createRequire(__filename);

/**
 * Banco em memória para os testes. Usa o better-sqlite3 (o mesmo da aplicação) quando
 * instalado; se não estiver, cai para o node:sqlite do Node >= 22.5.
 */
export function createTestDb(): Db {
  let raw: unknown;
  try {
    const Database = nodeRequire("better-sqlite3");
    raw = new Database(":memory:");
  } catch {
    const { DatabaseSync } = nodeRequire("node:sqlite");
    raw = new DatabaseSync(":memory:");
  }
  const db = raw as Db;
  db.exec("PRAGMA foreign_keys = ON");
  initDatabase(db);
  return db;
}

export const BASE = "http://localhost:3000";

export function req(
  method: string,
  path: string,
  opts: { body?: unknown; key?: string; rawBody?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.key) headers["x-api-key"] = opts.key;
  let body: string | undefined;
  if (opts.rawBody !== undefined) body = opts.rawBody;
  else if (opts.body !== undefined) body = JSON.stringify(opts.body);
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(BASE + path, { method, headers, body });
}

export function keyOf(db: Db): string {
  return getApiKey(db);
}

/** payload válido de leitura; sobrescreva campos conforme o teste */
export function reading(over: Record<string, unknown> = {}) {
  return { deviceId: "esp32-p03", pointId: "P-03", raw: 2200, tempC: 24.5, moisture: 9, ts: 1_800_000_000_000, ...over };
}
