import { getReadings, postReading } from "@/lib/api/readings";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return postReading(req, getDb());
}

export async function GET(req: Request) {
  return getReadings(req, getDb());
}
