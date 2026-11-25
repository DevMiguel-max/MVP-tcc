import { getCalibrations, postCalibration } from "@/lib/api/calibration";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return postCalibration(req, getDb());
}

export async function GET(req: Request) {
  return getCalibrations(req, getDb());
}
