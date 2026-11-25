import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/repo";
import { json, guard } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guard(() => {
    const db = getDb();
    const apiKey = getSetting(db, "api_key") ?? "";
    return json({ apiKey });
  });
}
