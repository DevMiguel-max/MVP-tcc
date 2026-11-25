import { evaluateAlert } from "../alert-engine";
import { fail, guard, issuesOf, json, parseInstant, readJson, requireApiKey } from "../http";
import { getPoint, insertReading, queryReadings, withTransaction } from "../repo";
import type { Db } from "../types";
import { readingPayloadSchema } from "../validation";

/** Antes de 2020 o relógio do dispositivo certamente não foi sincronizado (NTP). */
const MIN_VALID_TS = Date.UTC(2020, 0, 1);
const MAX_FUTURE_MS = 10 * 60 * 1000;

/** Se o timestamp do dispositivo for absurdo, usa o horário do servidor. */
export function normalizeTs(ts: number, now: number): { ts: number; source: "dispositivo" | "servidor" } {
  if (ts < MIN_VALID_TS || ts > now + MAX_FUTURE_MS) return { ts: now, source: "servidor" };
  return { ts, source: "dispositivo" };
}

export function postReading(req: Request, db: Db, now: number = Date.now()): Promise<Response> {
  return guard(async () => {
    const denied = requireApiKey(req, db);
    if (denied) return denied;

    const body = await readJson(req);
    if (!body.ok) return body.res;

    const parsed = readingPayloadSchema.safeParse(body.data);
    if (!parsed.success) return fail(422, "payload_invalido", "Payload inválido.", issuesOf(parsed.error));
    const p = parsed.data;

    const point = getPoint(db, p.pointId);
    if (!point) return fail(404, "ponto_desconhecido", `O ponto ${p.pointId} não existe.`);
    if (point.deviceId !== p.deviceId) {
      return fail(409, "dispositivo_incompativel", `O ponto ${p.pointId} não está associado ao dispositivo ${p.deviceId}.`);
    }

    const { ts, source } = normalizeTs(p.ts, now);
    const result = withTransaction(db, () => {
      const id = insertReading(db, {
        pointId: point.id,
        deviceId: p.deviceId,
        ts,
        receivedAt: now,
        raw: p.raw,
        tempC: p.tempC ?? null,
        moisture: p.moisture,
        simulated: p.simulated,
      });
      return { id, alert: evaluateAlert(db, point) };
    });

    return json({ ok: true, id: result.id, ts, tsSource: source, alert: result.alert }, 201);
  });
}

export function getReadings(req: Request, db: Db): Promise<Response> {
  return guard(() => {
    const sp = new URL(req.url).searchParams;

    const pointId = sp.get("pointId") || undefined;
    const fromRaw = sp.get("from");
    const toRaw = sp.get("to");
    const from = fromRaw ? parseInstant(fromRaw) : undefined;
    const to = toRaw ? parseInstant(toRaw) : undefined;
    if (from === null) return fail(422, "parametro_invalido", "O parâmetro 'from' não é uma data válida (use epoch em ms ou ISO 8601).");
    if (to === null) return fail(422, "parametro_invalido", "O parâmetro 'to' não é uma data válida (use epoch em ms ou ISO 8601).");
    if (from !== undefined && to !== undefined && from > to) {
      return fail(422, "parametro_invalido", "'from' não pode ser maior que 'to'.");
    }

    const limitRaw = sp.get("limit");
    const limit = limitRaw === null ? 500 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      return fail(422, "parametro_invalido", "'limit' deve ser um inteiro entre 1 e 10000.");
    }
    const order = sp.get("order") ?? "asc";
    if (order !== "asc" && order !== "desc") {
      return fail(422, "parametro_invalido", "'order' deve ser 'asc' ou 'desc'.");
    }
    if (pointId && !getPoint(db, pointId)) {
      return fail(404, "ponto_desconhecido", `O ponto ${pointId} não existe.`);
    }

    return json({ readings: queryReadings(db, { pointId, from, to, limit, order }) });
  });
}
