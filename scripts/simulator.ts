#!/usr/bin/env tsx
/**
 * OREMETRIX — Simulador de leituras
 *
 * Gera leituras falsas para 3 pontos de medição e envia ao backend via
 * POST /api/readings. Todo dado tem `simulated: true` e aparece na interface
 * com a etiqueta "SIMULADO".
 *
 * Uso:
 *   npm run sim                   # padrão: 2 s entre leituras
 *   npm run sim -- --fast         # 500 ms entre leituras
 *   npm run sim -- --scenario=alert  # ponto "deriva" estoura o limite rápido
 *
 * Os 3 pontos simulados:
 *   P-01  "estável"  — umidade oscila pouco em torno de 7 %
 *   P-03  "deriva"   — sobe lentamente, cruza o limite (9 %) e gera alerta
 *   C-01  "ruidoso"  — oscila com ruído alto em torno de 8 %
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// ─── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fast = args.includes("--fast");
const scenario = args.find((a) => a.startsWith("--scenario="))?.split("=")[1] ?? "default";
const interval = fast ? 500 : 2000;

// ─── Conexão com o banco (mesmo caminho do backend) ───────────────────────────
const dbPath = process.env.OREMETRIX_DB_PATH ?? path.join(process.cwd(), "data", "oremetrix.db");
if (!fs.existsSync(dbPath)) {
  console.error(`[sim] Banco não encontrado em ${dbPath}. Rode "npm run dev" antes para criá-lo.`);
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true });
const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get() as { value: string }).value;
db.close();

const BASE_URL = process.env.OREMETRIX_URL ?? "http://localhost:3000";

// ─── Modelos de cada ponto ────────────────────────────────────────────────────

interface PointSim {
  pointId: string;
  deviceId: string;
  label: string;
  /** Calibração para converter "rawFake" em moisture.
   *  Usamos a calibração padrão: moisture = -0.005 * raw + 20 */
  calA: number;
  calB: number;
  /** Estado mutável */
  raw: number;
  tempC: number;
}

function rawFromMoisture(a: number, b: number, m: number): number {
  // moisture = a * raw + b  →  raw = (moisture - b) / a
  return (m - b) / a;
}

const calA = -0.005;
const calB = 20;

const points: PointSim[] = [
  {
    pointId: "P-01",
    deviceId: "esp32-p01",
    label: "estável",
    calA,
    calB,
    raw: rawFromMoisture(calA, calB, 7.0),
    tempC: 28,
  },
  {
    pointId: "P-03",
    deviceId: "esp32-p03",
    label: "deriva",
    calA,
    calB,
    raw: rawFromMoisture(calA, calB, scenario === "alert" ? 8.0 : 6.5),
    tempC: 30,
  },
  {
    pointId: "C-01",
    deviceId: "esp32-c01",
    label: "ruidoso",
    calA,
    calB,
    raw: rawFromMoisture(calA, calB, 8.0),
    tempC: 26,
  },
];

// ─── Funções de ruído ─────────────────────────────────────────────────────────

function gauss(): number {
  // Box-Muller
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Atualiza o raw do ponto e devolve { raw, moisture, tempC }. */
function step(p: PointSim, tick: number): { raw: number; moisture: number; tempC: number } {
  const driftRate = scenario === "alert" ? 0.15 : 0.04; // %/tick

  switch (p.label) {
    case "estável":
      // Oscila em torno de 7 %: ruído ±0.3 %
      p.raw += gauss() * (0.3 / Math.abs(p.calA));
      break;

    case "deriva":
      // Sobe lentamente (cada tick sobe ~driftRate %); depois de estourar, desce
      {
        const moistureNow = p.calA * p.raw + p.calB;
        if (moistureNow < 11) {
          // subindo
          p.raw -= driftRate / Math.abs(p.calA); // raw diminui → moisture sobe (calA negativo)
        } else {
          // volta para baixo do limite para mostrar o resolve do alerta
          p.raw += 0.3 / Math.abs(p.calA);
        }
        // ruído leve
        p.raw += gauss() * (0.08 / Math.abs(p.calA));
      }
      break;

    case "ruidoso":
      // Ruído alto ±1.5 %
      p.raw += gauss() * (1.5 / Math.abs(p.calA));
      break;
  }

  // Limita ao range ADC (0–4095)
  p.raw = clamp(p.raw, 0, 4095);

  const moisture = clamp(p.calA * p.raw + p.calB, 0, 100);
  // Temperatura oscila ±0.5 °C
  p.tempC = clamp(p.tempC + gauss() * 0.2, 15, 50);

  return { raw: Math.round(p.raw * 10) / 10, moisture: Math.round(moisture * 100) / 100, tempC: Math.round(p.tempC * 10) / 10 };
}

// ─── Envio ────────────────────────────────────────────────────────────────────

async function sendReading(
  p: PointSim,
  data: { raw: number; moisture: number; tempC: number },
): Promise<void> {
  const payload = {
    deviceId: p.deviceId,
    pointId: p.pointId,
    raw: data.raw,
    tempC: data.tempC,
    moisture: data.moisture,
    ts: Date.now(),
    simulated: true,
  };

  try {
    const res = await fetch(`${BASE_URL}/api/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    const alertTag = body.alert ? ` ← ${body.alert === "opened" ? "🚨 ALERTA ABERTO" : "✅ ALERTA RESOLVIDO"}` : "";
    const sim = " [SIMULADO]";
    console.log(
      `[${p.pointId}] ${p.label.padEnd(8)} | moisture=${data.moisture.toFixed(2).padStart(5)}% | raw=${data.raw.toFixed(1).padStart(6)} | temp=${data.tempC}°C${sim}${alertTag}`,
    );
    if (!res.ok) {
      console.error(`  ⚠ HTTP ${res.status}: ${JSON.stringify(body)}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ⚠ Erro de conexão: ${msg}`);
  }
}

// ─── Loop principal ───────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════╗
║           OREMETRIX — Simulador de Leituras                 ║
║                                                              ║
║  Cenário: ${scenario.padEnd(12)}  Intervalo: ${String(interval).padStart(4)} ms             ║
║  Pontos:  P-01 (estável), P-03 (deriva), C-01 (ruidoso)    ║
║  Todos os dados são SIMULADOS (simulated: true)             ║
║                                                              ║
║  Ctrl+C para parar                                           ║
╚══════════════════════════════════════════════════════════════╝
`);

let tick = 0;
async function loop() {
  for (const p of points) {
    const data = step(p, tick);
    await sendReading(p, data);
  }
  tick++;
}

// Primeira iteração imediata
loop().then(() => {
  const timer = setInterval(() => {
    loop().catch((err) => console.error("[sim] erro no loop:", err));
  }, interval);

  process.on("SIGINT", () => {
    clearInterval(timer);
    console.log("\n[sim] Simulador parado.");
    process.exit(0);
  });
});
