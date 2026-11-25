import { CONSECUTIVE_READINGS, ATTENTION_RATIO } from "./defaults";
import { getOpenAlert, insertAlert, lastReadings, resolveAlert } from "./repo";
import type { Db, Point, PointStatus } from "./types";

export type AlertEvent = "opened" | "resolved" | null;

/**
 * Regra de alerta (anti falso alarme por pico):
 *  - abre um alerta quando as últimas 3 leituras estão TODAS acima do limite;
 *  - fecha o alerta aberto quando as últimas 3 leituras estão TODAS dentro do limite;
 *  - nunca há mais de um alerta aberto por ponto.
 * Deve ser chamada logo após gravar uma leitura (dentro da mesma transação).
 */
export function evaluateAlert(db: Db, point: Point): AlertEvent {
  const last = lastReadings(db, point.id, CONSECUTIVE_READINGS); // da mais nova para a mais antiga
  if (last.length < CONSECUTIVE_READINGS) return null;

  const newest = last[0];
  const open = getOpenAlert(db, point.id);
  const allOver = last.every((r) => r.moisture > point.limit);
  const allWithin = last.every((r) => r.moisture <= point.limit);

  if (!open && allOver) {
    insertAlert(db, {
      pointId: point.id,
      createdAt: newest.ts,
      moisture: newest.moisture,
      limit: point.limit,
      simulated: newest.simulated,
    });
    return "opened";
  }
  if (open && allWithin) {
    resolveAlert(db, open.id, newest.ts);
    return "resolved";
  }
  return null;
}

/** Status mostrado no card: alerta (alerta aberto) > atenção (>90% do limite) > dentro do limite. */
export function computeStatus(input: { limit: number; moisture: number | null; alertOpen: boolean }): PointStatus {
  if (input.alertOpen) return "alerta";
  if (input.moisture === null) return "sem_dados";
  if (input.moisture > input.limit * ATTENTION_RATIO) return "atencao";
  return "ok";
}
