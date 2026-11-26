"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  ComposedChart,
} from "recharts";

interface PointOption {
  id: string;
  name: string;
}

/** Os campos ficam como texto para o usuário poder apagar e redigitar (inputs numéricos controlados travam em ""). */
interface PairInput {
  raw: string;
  moisture: string;
}

interface Pair {
  raw: number;
  moisture: number;
}

const MIN_R2_TO_APPLY = 0.95;

const fmtSigned = (n: number, digits: number) => `${n < 0 ? "−" : "+"} ${Math.abs(n).toFixed(digits)}`;
const equation = (a: number, b: number) => `y = ${a.toFixed(6)}x ${fmtSigned(b, 4)}`;

const toNumber = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** Domínio "bonito" e reta ajustada recortada à área visível (sem sair do gráfico nem ficar abaixo de 0%). */
function buildChart(pairs: Pair[], fit: { a: number; b: number } | null) {
  const raws = pairs.map((p) => p.raw);
  const ms = pairs.map((p) => p.moisture);
  const xMin = Math.max(0, Math.floor((Math.min(...raws) - 100) / 100) * 100);
  const xMax = Math.min(4095, Math.ceil((Math.max(...raws) + 100) / 100) * 100);
  const yMax = Math.max(10, Math.ceil((Math.max(...ms) * 1.15) / 5) * 5);

  let line: { raw: number; fit: number }[] = [];
  if (fit && Math.abs(fit.a) > 1e-12) {
    const candidates = [xMin, xMax, (0 - fit.b) / fit.a, (yMax - fit.b) / fit.a]
      .filter((x) => x >= xMin - 1e-9 && x <= xMax + 1e-9)
      .map((x) => ({ raw: x, fit: fit.a * x + fit.b }))
      .filter((pt) => pt.fit >= -1e-9 && pt.fit <= yMax + 1e-9)
      .sort((p, q) => p.raw - q.raw);
    if (candidates.length >= 2) line = [candidates[0], candidates[candidates.length - 1]];
  } else if (fit) {
    line = [
      { raw: xMin, fit: fit.b },
      { raw: xMax, fit: fit.b },
    ].filter((pt) => pt.fit >= 0 && pt.fit <= yMax);
  }
  return { xDomain: [xMin, xMax] as [number, number], yDomain: [0, yMax] as [number, number], line };
}

interface CalResult {
  id: number;
  a: number;
  b: number;
  r2: number;
  n: number;
  warnings: string[];
  appliedAt: number | null;
}

export default function CalibracaoPage() {
  const [points, setPoints] = useState<PointOption[]>([]);
  const [selectedPoint, setSelectedPoint] = useState("P-03");
  const [pairs, setPairs] = useState<PairInput[]>([
    { raw: "2800", moisture: "6.0" },
    { raw: "2400", moisture: "8.0" },
    { raw: "2000", moisture: "10.0" },
  ]);
  const [result, setResult] = useState<CalResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/points")
      .then((r) => r.json())
      .then((d) => setPoints(d.points.map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);

  // Qualquer edição invalida o resultado anterior (senão o gráfico mostraria uma reta que não bate com os dados).
  const resetResult = () => {
    setResult(null);
    setMessage(null);
  };

  const addPair = () => {
    setPairs([...pairs, { raw: "", moisture: "" }]);
    resetResult();
  };

  const removePair = (i: number) => {
    if (pairs.length <= 3) return;
    setPairs(pairs.filter((_, idx) => idx !== i));
    resetResult();
  };

  const updatePair = (i: number, field: keyof PairInput, value: string) => {
    setPairs(pairs.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
    resetResult();
  };

  // Só pares completos e válidos entram no cálculo e no gráfico.
  const validPairs: Pair[] = pairs.flatMap((p) => {
    const raw = toNumber(p.raw);
    const moisture = toNumber(p.moisture);
    return raw !== null && moisture !== null ? [{ raw, moisture }] : [];
  });
  const canCalculate = validPairs.length >= 3 && validPairs.length === pairs.length;

  const calculate = async () => {
    setResult(null);
    setMessage(null);
    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointId: selectedPoint, pairs: validPairs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.message ?? "Erro ao calcular." });
        return;
      }
      setResult(data);
      setMessage({ type: "ok", text: `Calibração calculada: a = ${data.a.toFixed(6)}, b = ${data.b.toFixed(4)}, R² = ${data.r2.toFixed(4)}` });
    } catch {
      setMessage({ type: "err", text: "Erro de conexão." });
    }
  };

  const apply = async () => {
    if (!result) return;
    const weak = result.r2 < MIN_R2_TO_APPLY;
    if (weak && !window.confirm(`O R² é só ${result.r2.toFixed(3)}. Aplicar esta calibração vai deixar as medições imprecisas. Aplicar mesmo assim?`)) {
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/calibration/${result.id}/apply${weak ? "?force=1" : ""}`, { method: "POST" });
      if (res.ok) {
        setMessage({ type: "ok", text: `Calibração aplicada ao ponto ${selectedPoint}! O firmware receberá os novos coeficientes no próximo GET /api/config.` });
        setResult({ ...result, appliedAt: Date.now() });
      } else {
        const data = await res.json();
        setMessage({ type: "err", text: data.message ?? "Erro ao aplicar." });
      }
    } catch {
      setMessage({ type: "err", text: "Erro de conexão." });
    } finally {
      setApplying(false);
    }
  };

  // Dados para gráfico de dispersão + reta ajustada
  const chart = validPairs.length > 0 ? buildChart(validPairs, result ? { a: result.a, b: result.b } : null) : null;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-accent mb-2">Calibração</h1>
      <p className="text-slate-400 text-sm mb-6">
        Insira os pares (leitura bruta × umidade real da estufa) para calcular a regressão linear.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <div className="card">
          <div className="mb-4">
            <label htmlFor="cal-point" className="block text-xs text-slate-400 mb-1">
              Ponto de medição
            </label>
            <select
              id="cal-point"
              value={selectedPoint}
              onChange={(e) => { setSelectedPoint(e.target.value); setResult(null); }}
              className="bg-navy-700 border border-white/15 rounded-lg px-3 py-2 text-sm text-slate-100 w-full"
            >
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          <h3 className="text-sm font-semibold text-slate-300 mb-2">
            Pares de calibração (mín. 3)
          </h3>
          <div className="space-y-2 mb-4">
            {pairs.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  inputMode="decimal"
                  value={p.raw}
                  onChange={(e) => updatePair(i, "raw", e.target.value)}
                  placeholder="Leitura bruta"
                  aria-label={`Leitura bruta par ${i + 1}`}
                  className="bg-navy-700 border border-white/15 rounded px-2 py-1.5 text-sm text-slate-100 w-28 font-mono"
                />
                <span className="text-slate-500">→</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={p.moisture}
                  onChange={(e) => updatePair(i, "moisture", e.target.value)}
                  placeholder="Umidade %"
                  aria-label={`Umidade real par ${i + 1}`}
                  className="bg-navy-700 border border-white/15 rounded px-2 py-1.5 text-sm text-slate-100 w-24 font-mono"
                />
                <span className="text-xs text-slate-500">%</span>
                {pairs.length > 3 && (
                  <button onClick={() => removePair(i)} aria-label={`Remover par ${i + 1}`} className="text-red-400 hover:text-red-300 text-xs">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 mb-4">
            <button
              onClick={addPair}
              className="text-sm text-accent hover:text-accent-light transition-colors"
            >
              + Adicionar par
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={calculate}
              disabled={!canCalculate}
              className="bg-accent hover:bg-accent-dark text-navy font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Calcular Regressão
            </button>
            {result && !result.appliedAt && (
              <button
                onClick={apply}
                disabled={applying}
                className="border border-accent/50 text-accent hover:bg-accent/10 font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {applying ? "Aplicando…" : result.r2 < MIN_R2_TO_APPLY ? `Aplicar ao ${selectedPoint} mesmo assim` : `Aplicar ao ${selectedPoint}`}
              </button>
            )}
          </div>

          {!canCalculate && (
            <p className="text-xs text-amber-400 mt-3">Preencha ao menos 3 pares completos para calcular (todos os campos com número).</p>
          )}

          {/* Mensagens */}
          {message && (
            <div
              className={`mt-4 p-3 rounded-lg text-sm ${
                message.type === "ok"
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-red-500/10 text-red-400 border border-red-500/30"
              }`}
            >
              {message.text}
            </div>
          )}

          {result?.warnings && result.warnings.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
              <strong>Avisos:</strong>
              <ul className="list-disc list-inside mt-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="mt-4 p-4 bg-white/5 rounded-lg">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Resultado</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-400">a (inclinação)</div>
                  <div className="font-mono text-lg text-accent">{result.a.toFixed(6)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">b (intercepto)</div>
                  <div className="font-mono text-lg text-accent">{result.b.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">R²</div>
                  <div className={`font-mono text-lg ${result.r2 >= 0.95 ? "text-accent" : "text-amber-400"}`}>
                    {result.r2.toFixed(4)}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">
                umidade (%) = {result.a.toFixed(6)} × leitura_bruta {fmtSigned(result.b, 4)}
              </p>
            </div>
          )}
        </div>

        {/* Gráfico de dispersão */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            Gráfico de dispersão
          </h3>
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="raw"
                  type="number"
                  domain={chart ? chart.xDomain : ["auto", "auto"]}
                  allowDataOverflow
                  height={48}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  label={{ value: "Leitura bruta (ADC)", position: "insideBottom", offset: 0, fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  dataKey="moisture"
                  type="number"
                  domain={chart ? chart.yDomain : [0, 10]}
                  allowDataOverflow
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  label={{ value: "Umidade (%)", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0b1f3a",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    color: "#f1f5f9",
                    fontSize: 13,
                  }}
                />
                <Scatter data={validPairs} fill="#22c55e" name="Pares" isAnimationActive={false} />
                {result && chart && chart.line.length === 2 && (
                  <Line
                    data={chart.line}
                    dataKey="fit"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="Reta ajustada"
                    legendType="line"
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {result && (
            <p className="text-center text-xs text-slate-500 mt-2">
              {equation(result.a, result.b)} · R² = {result.r2.toFixed(4)} · {result.n} pares
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
