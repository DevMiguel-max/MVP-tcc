import { computeStatus } from "../alert-engine";
import { fail, guard, issuesOf, json, readJson } from "../http";
import { getOpenAlert, getPoint, latestReading, listPoints, updatePoint } from "../repo";
import type { Db, Point } from "../types";
import { pointUpdateSchema } from "../validation";

export function pointDto(p: Point) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    deviceId: p.deviceId,
    limit: p.limit,
    calibration: { a: p.a, b: p.b, r2: p.r2, updatedAt: p.calibratedAt },
  };
}

/** GET /api/points — um item por ponto, já com a última leitura, a margem e o status. */
export function listPointsHandler(db: Db): Promise<Response> {
  return guard(() => {
    const points = listPoints(db).map((p) => {
      const latest = latestReading(db, p.id);
      const alertOpen = getOpenAlert(db, p.id) !== null;
      return {
        ...pointDto(p),
        latest: latest
          ? { ts: latest.ts, moisture: latest.moisture, tempC: latest.tempC, raw: latest.raw, simulated: latest.simulated }
          : null,
        /** limite − umidade atual (positivo = folga) */
        margin: latest ? p.limit - latest.moisture : null,
        alertOpen,
        status: computeStatus({ limit: p.limit, moisture: latest ? latest.moisture : null, alertOpen }),
      };
    });
    return json({ points });
  });
}

/** PUT /api/points/:id — altera nome e/ou limite de umidade. */
export function putPoint(req: Request, db: Db, id: string): Promise<Response> {
  return guard(async () => {
    if (!getPoint(db, id)) return fail(404, "ponto_desconhecido", `O ponto ${id} não existe.`);
    const body = await readJson(req);
    if (!body.ok) return body.res;
    const parsed = pointUpdateSchema.safeParse(body.data);
    if (!parsed.success) return fail(422, "payload_invalido", "Payload inválido.", issuesOf(parsed.error));

    const updated = updatePoint(db, id, parsed.data);
    return json({ point: pointDto(updated as Point) });
  });
}
