import { CalibrationError, fitLinear } from "../calibration";
import { fail, guard, issuesOf, json, readJson } from "../http";
import {
  applyCalibrationToPoint,
  getCalibration,
  getPoint,
  insertCalibration,
  listCalibrations,
} from "../repo";
import type { CalibrationRecord, Db } from "../types";
import { calibrationRequestSchema } from "../validation";

function calibrationDto(c: CalibrationRecord) {
  return { id: c.id, pointId: c.pointId, createdAt: c.createdAt, a: c.a, b: c.b, r2: c.r2, n: c.n, pairs: c.pairs, appliedAt: c.appliedAt };
}

/** POST /api/calibration — calcula a regressão linear, devolve a, b e R² e SALVA o registro (ainda não aplica ao ponto). */
export function postCalibration(req: Request, db: Db, now: number = Date.now()): Promise<Response> {
  return guard(async () => {
    const body = await readJson(req);
    if (!body.ok) return body.res;
    const parsed = calibrationRequestSchema.safeParse(body.data);
    if (!parsed.success) return fail(422, "payload_invalido", "Payload inválido.", issuesOf(parsed.error));
    const { pointId, pairs } = parsed.data;

    if (!getPoint(db, pointId)) return fail(404, "ponto_desconhecido", `O ponto ${pointId} não existe.`);

    let fit;
    try {
      fit = fitLinear(pairs);
    } catch (err) {
      if (err instanceof CalibrationError) return fail(422, "calibracao_invalida", err.message);
      throw err;
    }

    const id = insertCalibration(db, { pointId, createdAt: now, a: fit.a, b: fit.b, r2: fit.r2, pairs });
    return json(
      { id, pointId, a: fit.a, b: fit.b, r2: fit.r2, n: fit.n, warnings: fit.warnings, createdAt: now, appliedAt: null },
      201,
    );
  });
}

/** GET /api/calibration?pointId= — histórico de calibrações. */
export function getCalibrations(req: Request, db: Db): Promise<Response> {
  return guard(() => {
    const pointId = new URL(req.url).searchParams.get("pointId") || undefined;
    return json({ calibrations: listCalibrations(db, { pointId, limit: 50 }).map(calibrationDto) });
  });
}

/** POST /api/calibration/:id/apply — grava a, b e R² no ponto (o firmware busca no próximo GET /api/config). */
export function applyCalibration(db: Db, idRaw: string, now: number = Date.now()): Promise<Response> {
  return guard(() => {
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id < 1) return fail(422, "parametro_invalido", "Id de calibração inválido.");
    const cal = getCalibration(db, id);
    if (!cal) return fail(404, "calibracao_desconhecida", `A calibração ${id} não existe.`);

    applyCalibrationToPoint(db, cal, now);
    return json({ ok: true, pointId: cal.pointId, a: cal.a, b: cal.b, r2: cal.r2, appliedAt: now });
  });
}
