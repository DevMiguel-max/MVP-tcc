"use client";

import { useState, useEffect, useCallback } from "react";
import { SimulatedBadge } from "@/components/SimulatedBadge";

interface Reading {
  id: number;
  pointId: string;
  deviceId: string;
  ts: number;
  raw: number;
  tempC: number | null;
  moisture: number;
  simulated: boolean;
}

interface PointOption {
  id: string;
  name: string;
}

export default function HistoricoPage() {
  const [points, setPoints] = useState<PointOption[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  // Carrega pontos
  useEffect(() => {
    fetch("/api/points")
      .then((r) => r.json())
      .then((d) => setPoints(d.points.map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);

  const fetchReadings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedPoint) params.set("pointId", selectedPoint);
    if (from) params.set("from", new Date(from).getTime().toString());
    if (to) params.set("to", new Date(to).getTime().toString());
    params.set("limit", "1000");
    params.set("order", "desc");

    try {
      const res = await fetch(`/api/readings?${params}`);
      const data = await res.json();
      setReadings(data.readings ?? []);
    } catch {
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPoint, from, to]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  // Exportar CSV
  const exportCSV = () => {
    const header = "Ponto,Dispositivo,Data/Hora,Raw,Umidade (%),Temperatura (°C),Simulado\n";
    const rows = readings.map((r) =>
      [
        r.pointId,
        r.deviceId,
        new Date(r.ts).toISOString(),
        r.raw,
        r.moisture.toFixed(2),
        r.tempC !== null ? r.tempC.toFixed(1) : "",
        r.simulated ? "SIM" : "NÃO",
      ].join(","),
    );
    const blob = new Blob(["\uFEFF" + header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `oremetrix_historico_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-accent mb-6">Histórico de Leituras</h1>

      {/* Filtros */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="point-select" className="block text-xs text-slate-400 mb-1">
              Ponto
            </label>
            <select
              id="point-select"
              value={selectedPoint}
              onChange={(e) => setSelectedPoint(e.target.value)}
              className="bg-navy-700 border border-white/15 rounded-lg px-3 py-2 text-sm text-slate-100 min-w-[160px]"
            >
              <option value="">Todos</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from-date" className="block text-xs text-slate-400 mb-1">
              De
            </label>
            <input
              id="from-date"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-navy-700 border border-white/15 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="to-date" className="block text-xs text-slate-400 mb-1">
              Até
            </label>
            <input
              id="to-date"
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-navy-700 border border-white/15 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <button
            onClick={fetchReadings}
            disabled={loading}
            className="bg-accent hover:bg-accent-dark text-navy font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Buscando…" : "Buscar"}
          </button>
          <button
            onClick={exportCSV}
            disabled={readings.length === 0}
            className="border border-accent/50 text-accent hover:bg-accent/10 font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-30"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-x-auto">
        {readings.length === 0 ? (
          <p className="text-center text-slate-500 py-8">Nenhuma leitura encontrada.</p>
        ) : (
          <>
            <div className="text-xs text-slate-400 mb-3">{readings.length} leituras</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ponto</th>
                  <th>Data/Hora</th>
                  <th>Umidade (%)</th>
                  <th>Raw</th>
                  <th>Temp (°C)</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.pointId}</td>
                    <td>{new Date(r.ts).toLocaleString("pt-BR")}</td>
                    <td className="font-mono">{r.moisture.toFixed(2)}</td>
                    <td className="font-mono text-slate-400">{r.raw.toFixed(1)}</td>
                    <td>{r.tempC !== null ? r.tempC.toFixed(1) : "—"}</td>
                    <td>{r.simulated ? <SimulatedBadge /> : <span className="text-xs text-slate-400">Hardware</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
