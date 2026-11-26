import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/repo";
import { fail, guard, isLocalRequest, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A chave só é mostrada a quem acessa o painel pelo próprio computador (localhost). */
export async function GET(req: Request) {
  return guard(() => {
    if (!isLocalRequest(req)) {
      return fail(403, "somente_local", "A chave de API só pode ser consultada pelo computador que roda o servidor (localhost).");
    }
    const db = getDb();
    const apiKey = getSetting(db, "api_key") ?? "";
    return json({ apiKey });
  });
}
