import { fail, guard, json, requireApiKey } from "../http";
import { getPointByDevice } from "../repo";
import type { Db } from "../types";

/** GET /api/config/:deviceId — calibração e limite vigentes, consumidos pelo firmware. */
export function getDeviceConfig(req: Request, db: Db, deviceId: string): Promise<Response> {
  return guard(() => {
    const denied = requireApiKey(req, db);
    if (denied) return denied;

    const point = getPointByDevice(db, deviceId);
    if (!point) return fail(404, "dispositivo_desconhecido", `Nenhum ponto está associado ao dispositivo ${deviceId}.`);
    return json({ a: point.a, b: point.b, limit: point.limit });
  });
}
