/**
 * Interface mínima de banco usada pela aplicação. Tanto o better-sqlite3
 * (produção) quanto o node:sqlite (usado nos testes quando o better-sqlite3
 * não está instalado) a satisfazem. Por isso só usamos parâmetros posicionais (?).
 */
export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}
export interface Statement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
export interface Db {
  exec(sql: string): void;
  prepare(sql: string): Statement;
}

export type PointKind = "pilha" | "correia";
export type PointStatus = "ok" | "atencao" | "alerta" | "sem_dados";

export interface Point {
  id: string;
  name: string;
  kind: PointKind;
  deviceId: string;
  /** limite de umidade (%) */
  limit: number;
  /** calibração: umidade_% = a * leitura + b */
  a: number;
  b: number;
  r2: number | null;
  calibratedAt: number | null;
}

export interface Reading {
  id: number;
  pointId: string;
  deviceId: string;
  /** epoch em milissegundos */
  ts: number;
  receivedAt: number;
  raw: number;
  tempC: number | null;
  moisture: number;
  simulated: boolean;
}

export interface Alert {
  id: number;
  pointId: string;
  createdAt: number;
  resolvedAt: number | null;
  moisture: number;
  limit: number;
  simulated: boolean;
}

export interface CalibrationPair {
  raw: number;
  moisture: number;
}

export interface CalibrationRecord {
  id: number;
  pointId: string;
  createdAt: number;
  a: number;
  b: number;
  r2: number;
  n: number;
  pairs: CalibrationPair[];
  appliedAt: number | null;
}
