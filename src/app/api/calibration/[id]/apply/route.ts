import { applyCalibration } from "@/lib/api/calibration";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const force = new URL(req.url).searchParams.get("force") === "1";
  return applyCalibration(getDb(), id, Date.now(), force);
}
