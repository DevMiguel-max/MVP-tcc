import type { Alert, CalibrationPair, CalibrationRecord, Db, Point, PointKind, Reading } from "./types";

/* ---------- utilitários ---------- */

export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/* ---------- configurações ---------- */

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function getApiKey(db: Db): string {
  const key = getSetting(db, "api_key");
  if (!key) throw new Error("Chave de API não inicializada (initDatabase não foi executado).");
  return key;
}

/* ---------- pontos ---------- */

interface PointRow {
  id: string;
  name: string;
  kind: PointKind;
  device_id: string;
  limit_pct: number;
  cal_a: number;
  cal_b: number;
  cal_r2: number | null;
  cal_updated_at: number | null;
}

function toPoint(r: PointRow): Point {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    deviceId: r.device_id,
    limit: Number(r.limit_pct),
    a: Number(r.cal_a),
    b: Number(r.cal_b),
    r2: r.cal_r2 === null ? null : Number(r.cal_r2),
    calibratedAt: r.cal_updated_at === null ? null : Number(r.cal_updated_at),
  };
}

export function listPoints(db: Db): Point[] {
  const rows = db.prepare("SELECT * FROM points ORDER BY id").all() as PointRow[];
  return rows.map(toPoint);
}

export function getPoint(db: Db, id: string): Point | null {
  const row = db.prepare("SELECT * FROM points WHERE id = ?").get(id) as PointRow | undefined;
  return row ? toPoint(row) : null;
}

export function getPointByDevice(db: Db, deviceId: string): Point | null {
  const row = db.prepare("SELECT * FROM points WHERE device_id = ?").get(deviceId) as PointRow | undefined;
  return row ? toPoint(row) : null;
}

export function updatePoint(db: Db, id: string, patch: { name?: string; limit?: number }): Point | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if (patch.limit !== undefined) {
    sets.push("limit_pct = ?");
    params.push(patch.limit);
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE points SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
  }
  return getPoint(db, id);
}

/* ---------- leituras ---------- */

interface ReadingRow {
  id: number;
  point_id: string;
  device_id: string;
  ts: number;
  received_at: number;
  raw: number;
  temp_c: number | null;
  moisture: number;
  simulated: number;
}

function toReading(r: ReadingRow): Reading {
  return {
    id: Number(r.id),
    pointId: r.point_id,
    deviceId: r.device_id,
    ts: Number(r.ts),
    receivedAt: Number(r.received_at),
    raw: Number(r.raw),
    tempC: r.temp_c === null ? null : Number(r.temp_c),
    moisture: Number(r.moisture),
    simulated: Number(r.simulated) === 1,
  };
}

export function insertReading(
  db: Db,
  r: {
    pointId: string;
    deviceId: string;
    ts: number;
    receivedAt: number;
    raw: number;
    tempC: number | null;
    moisture: number;
    simulated: boolean;
  },
): number {
  const res = db
    .prepare(
      `INSERT INTO readings (point_id, device_id, ts, received_at, raw, temp_c, moisture, simulated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(r.pointId, r.deviceId, r.ts, r.receivedAt, r.raw, r.tempC, r.moisture, r.simulated ? 1 : 0);
  return Number(res.lastInsertRowid);
}

export interface ReadingsQuery {
  pointId?: string;
  from?: number;
  to?: number;
  limit: number;
  order: "asc" | "desc";
}

/** Devolve as `limit` leituras mais recentes do intervalo, na ordem pedida (asc é a ideal para gráficos). */
export function queryReadings(db: Db, q: ReadingsQuery): Reading[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.pointId) {
    where.push("point_id = ?");
    params.push(q.pointId);
  }
  if (q.from !== undefined) {
    where.push("ts >= ?");
    params.push(q.from);
  }
  if (q.to !== undefined) {
    where.push("ts <= ?");
    params.push(q.to);
  }
  const w = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const inner = `SELECT * FROM readings ${w} ORDER BY ts DESC, id DESC LIMIT ?`;
  const sql = q.order === "asc" ? `SELECT * FROM (${inner}) ORDER BY ts ASC, id ASC` : inner;
  const rows = db.prepare(sql).all(...params, q.limit) as ReadingRow[];
  return rows.map(toReading);
}

/** As últimas `n` leituras do ponto, da mais nova para a mais antiga. */
export function lastReadings(db: Db, pointId: string, n: number): Reading[] {
  const rows = db
    .prepare("SELECT * FROM readings WHERE point_id = ? ORDER BY ts DESC, id DESC LIMIT ?")
    .all(pointId, n) as ReadingRow[];
  return rows.map(toReading);
}

export function latestReading(db: Db, pointId: string): Reading | null {
  return lastReadings(db, pointId, 1)[0] ?? null;
}

/* ---------- alertas ---------- */

interface AlertRow {
  id: number;
  point_id: string;
  created_at: number;
  resolved_at: number | null;
  moisture: number;
  limit_pct: number;
  simulated: number;
}

function toAlert(r: AlertRow): Alert {
  return {
    id: Number(r.id),
    pointId: r.point_id,
    createdAt: Number(r.created_at),
    resolvedAt: r.resolved_at === null ? null : Number(r.resolved_at),
    moisture: Number(r.moisture),
    limit: Number(r.limit_pct),
    simulated: Number(r.simulated) === 1,
  };
}

export function getOpenAlert(db: Db, pointId: string): Alert | null {
  const row = db
    .prepare("SELECT * FROM alerts WHERE point_id = ? AND resolved_at IS NULL")
    .get(pointId) as AlertRow | undefined;
  return row ? toAlert(row) : null;
}

export function insertAlert(
  db: Db,
  a: { pointId: string; createdAt: number; moisture: number; limit: number; simulated: boolean },
): number {
  const res = db
    .prepare("INSERT INTO alerts (point_id, created_at, moisture, limit_pct, simulated) VALUES (?, ?, ?, ?, ?)")
    .run(a.pointId, a.createdAt, a.moisture, a.limit, a.simulated ? 1 : 0);
  return Number(res.lastInsertRowid);
}

export function resolveAlert(db: Db, id: number, resolvedAt: number): void {
  db.prepare("UPDATE alerts SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL").run(resolvedAt, id);
}

export function listAlerts(db: Db, q: { pointId?: string; activeOnly?: boolean; limit: number }): Alert[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.pointId) {
    where.push("point_id = ?");
    params.push(q.pointId);
  }
  if (q.activeOnly) where.push("resolved_at IS NULL");
  const w = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM alerts ${w} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(...params, q.limit) as AlertRow[];
  return rows.map(toAlert);
}

/* ---------- calibrações ---------- */

interface CalibrationRow {
  id: number;
  point_id: string;
  created_at: number;
  a: number;
  b: number;
  r2: number;
  n: number;
  pairs_json: string;
  applied_at: number | null;
}

function toCalibration(r: CalibrationRow): CalibrationRecord {
  return {
    id: Number(r.id),
    pointId: r.point_id,
    createdAt: Number(r.created_at),
    a: Number(r.a),
    b: Number(r.b),
    r2: Number(r.r2),
    n: Number(r.n),
    pairs: JSON.parse(r.pairs_json) as CalibrationPair[],
    appliedAt: r.applied_at === null ? null : Number(r.applied_at),
  };
}

export function insertCalibration(
  db: Db,
  c: { pointId: string; createdAt: number; a: number; b: number; r2: number; pairs: CalibrationPair[] },
): number {
  const res = db
    .prepare(
      "INSERT INTO calibrations (point_id, created_at, a, b, r2, n, pairs_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(c.pointId, c.createdAt, c.a, c.b, c.r2, c.pairs.length, JSON.stringify(c.pairs));
  return Number(res.lastInsertRowid);
}

export function getCalibration(db: Db, id: number): CalibrationRecord | null {
  const row = db.prepare("SELECT * FROM calibrations WHERE id = ?").get(id) as CalibrationRow | undefined;
  return row ? toCalibration(row) : null;
}

export function listCalibrations(db: Db, q: { pointId?: string; limit: number }): CalibrationRecord[] {
  const rows = (
    q.pointId
      ? db
          .prepare("SELECT * FROM calibrations WHERE point_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
          .all(q.pointId, q.limit)
      : db.prepare("SELECT * FROM calibrations ORDER BY created_at DESC, id DESC LIMIT ?").all(q.limit)
  ) as CalibrationRow[];
  return rows.map(toCalibration);
}

/** Grava a calibração no ponto (a, b, R²) e marca o registro como aplicado. */
export function applyCalibrationToPoint(db: Db, cal: CalibrationRecord, now: number): void {
  withTransaction(db, () => {
    db.prepare("UPDATE points SET cal_a = ?, cal_b = ?, cal_r2 = ?, cal_updated_at = ? WHERE id = ?").run(
      cal.a,
      cal.b,
      cal.r2,
      now,
      cal.pointId,
    );
    db.prepare("UPDATE calibrations SET applied_at = ? WHERE id = ?").run(now, cal.id);
  });
}
