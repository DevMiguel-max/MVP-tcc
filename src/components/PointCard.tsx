"use client";

import { StatusDot } from "./StatusDot";
import { SimulatedBadge } from "./SimulatedBadge";

interface PointData {
  id: string;
  name: string;
  kind: string;
  limit: number;
  status: string;
  alertOpen: boolean;
  latest: {
    moisture: number;
    tempC: number | null;
    raw: number;
    simulated: boolean;
    ts: number;
  } | null;
  margin: number | null;
}

export function PointCard({ point }: { point: PointData }) {
  const p = point;
  const moisture = p.latest?.moisture;
  const margin = p.margin;

  const borderColor =
    p.status === "alerta"
      ? "border-red-500/50"
      : p.status === "atencao"
        ? "border-amber-400/50"
        : "border-white/10";

  return (
    <div className={`card ${borderColor} border-2`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold">
            {p.name} · <span className="text-slate-400">{p.id}</span>
          </h3>
          <span className="text-xs text-slate-400 uppercase">{p.kind}</span>
        </div>
        <div className="flex items-center gap-2">
          {p.latest?.simulated && <SimulatedBadge />}
          <StatusDot status={p.status} />
        </div>
      </div>

      {/* Dados */}
      {p.latest ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-400 mb-1">Umidade</div>
            <div className={`text-2xl font-display font-bold ${
              p.status === "alerta" ? "text-red-400" : p.status === "atencao" ? "text-amber-400" : "text-accent"
            }`}>
              {moisture!.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Limite</div>
            <div className="text-2xl font-display font-bold text-slate-300">
              {p.limit.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Margem</div>
            <div className={`text-lg font-semibold ${
              margin !== null && margin < 0 ? "text-red-400" : "text-slate-200"
            }`}>
              {margin !== null ? (margin >= 0 ? "+" : "") + margin.toFixed(2) + " pp" : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Temperatura</div>
            <div className="text-lg font-semibold text-slate-200">
              {p.latest.tempC !== null ? `${p.latest.tempC.toFixed(1)} °C` : "—"}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-slate-500 text-sm">Nenhuma leitura recebida.</p>
      )}

      {/* Timestamp */}
      {p.latest && (
        <div className="mt-3 text-xs text-slate-500">
          Última leitura: {new Date(p.latest.ts).toLocaleString("pt-BR")}
        </div>
      )}
    </div>
  );
}
