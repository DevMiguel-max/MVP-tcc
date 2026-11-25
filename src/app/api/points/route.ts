import { listPointsHandler } from "@/lib/api/points";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return listPointsHandler(getDb());
}
