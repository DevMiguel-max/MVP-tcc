import { createHash, timingSafeEqual } from "node:crypto";
import type { ZodError } from "zod";
import { getApiKey } from "./repo";
import type { Db } from "./types";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(status: number, error: string, message: string, issues?: unknown): Response {
  return json(issues === undefined ? { error, message } : { error, message, issues }, status);
}

export function issuesOf(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export async function readJson(
  req: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; res: Response }> {
  try {
    return { ok: true, data: await req.json() };
  } catch {
    return { ok: false, res: fail(400, "json_invalido", "O corpo da requisição não é um JSON válido.") };
  }
}

/** Exige o cabeçalho x-api-key. Devolve a resposta de erro, ou null se a chave estiver correta. */
export function requireApiKey(req: Request, db: Db): Response | null {
  const provided = req.headers.get("x-api-key");
  if (!provided) return fail(401, "chave_ausente", "Cabeçalho x-api-key ausente.");
  const sha = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(sha(provided), sha(getApiKey(db)))) {
    return fail(401, "chave_invalida", "Chave de API inválida.");
  }
  return null;
}

/** Evita que uma exceção inesperada vire uma página HTML de erro: sempre responde JSON. */
export async function guard(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error("[oremetrix] erro interno:", err);
    return fail(500, "erro_interno", "Erro interno do servidor.");
  }
}

/** Interpreta um instante em epoch (ms) ou data ISO 8601. Devolve null se inválido. */
export function parseInstant(v: string): number | null {
  if (/^\d+$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}
