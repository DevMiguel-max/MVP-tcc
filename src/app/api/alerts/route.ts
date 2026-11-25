import { getAlerts } from "@/lib/api/alerts";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return getAlerts(req, getDb());
}
