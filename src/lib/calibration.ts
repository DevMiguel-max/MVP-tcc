import type { CalibrationPair } from "./types";

export class CalibrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationError";
  }
}

export interface CalibrationFit {
  /** inclinação: umidade_% = a * leitura + b */
  a: number;
  /** intercepto */
  b: number;
  /** coeficiente de determinação (0 a 1) */
  r2: number;
  n: number;
  warnings: string[];
}

export const MIN_PAIRS = 3;

/** Regressão linear por mínimos quadrados: umidade = a * leitura_bruta + b. */
export function fitLinear(pairs: CalibrationPair[]): CalibrationFit {
  const n = pairs.length;
  if (n < MIN_PAIRS) {
    throw new CalibrationError(`São necessários ao menos ${MIN_PAIRS} pares (recebidos: ${n}).`);
  }
  if (pairs.some((p) => !Number.isFinite(p.raw) || !Number.isFinite(p.moisture))) {
    throw new CalibrationError("Todos os valores precisam ser números finitos.");
  }

  // Trabalha com os dados centralizados na média (mais estável numericamente).
  const meanX = pairs.reduce((s, p) => s + p.raw, 0) / n;
  const meanY = pairs.reduce((s, p) => s + p.moisture, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pairs) {
    const dx = p.raw - meanX;
    const dy = p.moisture - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  if (sxx === 0) {
    throw new CalibrationError("As leituras brutas são todas iguais: não é possível ajustar uma reta.");
  }
  if (syy === 0) {
    throw new CalibrationError(
      "A umidade real é igual em todos os pares: use amostras com umidades diferentes.",
    );
  }

  const a = sxy / sxx;
  const b = meanY - a * meanX;

  let ssRes = 0;
  for (const p of pairs) {
    const e = p.moisture - (a * p.raw + b);
    ssRes += e * e;
  }
  const r2 = Math.min(1, Math.max(0, 1 - ssRes / syy));

  const warnings: string[] = [];
  if (r2 < 0.95) {
    warnings.push(`R² baixo (${r2.toFixed(3)}): o ajuste linear está fraco. Revise as amostras ou refaça as leituras.`);
  }
  if (n < 5) {
    warnings.push(`Apenas ${n} pares: a calibração é frágil. Use 5 ou mais pontos distribuídos na faixa de operação.`);
  }
  return { a, b, r2, n, warnings };
}

/** Aplica a calibração linear a uma leitura bruta (mesma conta feita no firmware). */
export function applyLinear(a: number, b: number, raw: number): number {
  return a * raw + b;
}
