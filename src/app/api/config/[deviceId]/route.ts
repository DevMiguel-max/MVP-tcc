import { getDeviceConfig } from "@/lib/api/config";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await ctx.params;
  return getDeviceConfig(req, getDb(), deviceId);
}
