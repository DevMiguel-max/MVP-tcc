import { fail, guard, json } from "../http";
import { listAlerts } from "../repo";
import type { Db } from "../types";

/** GET /api/alerts?active=1&pointId=&limit= */
export function getAlerts(req: Request, db: Db): Promise<Response> {
  return guard(() => {
    const sp = new URL(req.url).searchParams;
    const limitRaw = sp.get("limit");
    const limit = limitRaw === null ? 100 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      return fail(422, "parametro_invalido", "'limit' deve ser um inteiro entre 1 e 1000.");
    }
    const active = sp.get("active");
    const alerts = listAlerts(db, {
      pointId: sp.get("pointId") || undefined,
      activeOnly: active === "1" || active === "true",
      limit,
    });
    return json({ alerts });
  });
}
