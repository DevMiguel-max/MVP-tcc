import { randomBytes } from "node:crypto";
import type { Db, PointKind } from "./types";
import { DEFAULT_CAL, DEFAULT_LIMIT } from "./defaults";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pilha','correia')),
  device_id TEXT NOT NULL UNIQUE,
  limit_pct REAL NOT NULL DEFAULT ${DEFAULT_LIMIT},
  cal_a REAL NOT NULL,
  cal_b REAL NOT NULL,
  cal_r2 REAL,
  cal_updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id TEXT NOT NULL REFERENCES points(id),
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  raw REAL NOT NULL,
  temp_c REAL,
  moisture REAL NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0 CHECK (simulated IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_readings_point_ts ON readings(point_id, ts);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id TEXT NOT NULL REFERENCES points(id),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  moisture REAL NOT NULL,
  limit_pct REAL NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0 CHECK (simulated IN (0,1))
);
-- no máximo um alerta aberto por ponto
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_one_open ON alerts(point_id) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS calibrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id TEXT NOT NULL REFERENCES points(id),
  created_at INTEGER NOT NULL,
  a REAL NOT NULL,
  b REAL NOT NULL,
  r2 REAL NOT NULL,
  n INTEGER NOT NULL,
  pairs_json TEXT NOT NULL,
  applied_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const EXAMPLE_POINTS: { id: string; name: string; kind: PointKind; deviceId: string }[] = [
  { id: "P-01", name: "Pilha 1", kind: "pilha", deviceId: "esp32-p01" },
  { id: "P-03", name: "Pilha 2", kind: "pilha", deviceId: "esp32-p03" },
  { id: "C-01", name: "Correia 1", kind: "correia", deviceId: "esp32-c01" },
];

/** Cria as tabelas, os 3 pontos de exemplo e a chave de API (se ainda não existirem). */
export function initDatabase(db: Db): void {
  db.exec(SCHEMA_SQL);

  const insertPoint = db.prepare(
    `INSERT OR IGNORE INTO points (id, name, kind, device_id, limit_pct, cal_a, cal_b)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of EXAMPLE_POINTS) {
    insertPoint.run(p.id, p.name, p.kind, p.deviceId, DEFAULT_LIMIT, DEFAULT_CAL.a, DEFAULT_CAL.b);
  }

  // Chave aleatória gerada na 1ª execução, guardada só no banco local (nunca no repositório).
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('api_key', ?)").run(
    randomBytes(24).toString("hex"),
  );
}
