"use client";

import { usePolling } from "@/hooks/usePolling";
import { PointCard } from "@/components/PointCard";
import { MoistureChart } from "@/components/MoistureChart";
import { AlertBar } from "@/components/AlertBar";
import { useState, useEffect } from "react";

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

interface Reading {
  ts: number;
  moisture: number;
  simulated: boolean;
}

const CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b"];

export default function DashboardPage() {
  const { data: pointsData } = usePolling<{ points: PointData[] }>("/api/points", 2000);
  const [chartData, setChartData] = useState<Record<string, Reading[]>>({});

  const points = pointsData?.points ?? [];

  // Busca as últimas leituras de cada ponto para o gráfico
  useEffect(() => {
    if (points.length === 0) return;
    let cancelled = false;

    async function fetchCharts() {
      const result: Record<string, Reading[]> = {};
      await Promise.all(
        points.map(async (p) => {
          try {
            const res = await fetch(`/api/readings?pointId=${p.id}&limit=100&order=asc`);
            if (res.ok) {
              const json = await res.json();
              result[p.id] = json.readings;
            }
          } catch { /* ignora */ }
        }),
      );
      if (!cancelled) setChartData(result);
    }

    fetchCharts();
    const interval = setInterval(fetchCharts, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [points.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Montar alertas
  const activeAlerts = points
    .filter((p) => p.alertOpen && p.latest)
    .map((p) => ({
      pointId: p.id,
      pointName: p.name,
      moisture: p.latest!.moisture,
      limit: p.limit,
      simulated: p.latest!.simulated,
    }));

  return (
    <div>
      {/* Faixa de alertas */}
      <AlertBar alerts={activeAlerts} />

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-accent mb-1">Painel de Monitoramento</h1>
        <p className="text-slate-400 text-sm">
          Monitoramento em tempo real da umidade de minério de ferro
        </p>
      </div>

      {/* Cards dos pontos */}
      {points.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400">Nenhum ponto de medição configurado.</p>
          <p className="text-slate-500 text-sm mt-2">
            Inicie o backend com <code className="text-accent">npm run dev</code> e o simulador com{" "}
            <code className="text-accent">npm run sim</code>
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {points.map((p) => (
              <PointCard key={p.id} point={p} />
            ))}
          </div>

          {/* Gráficos */}
          <div className="space-y-6">
            {points.map((p, i) => (
              <div key={p.id} className="card">
                <h3 className="font-display text-lg font-semibold mb-3">
                  {p.name} · <span className="text-slate-400">{p.id}</span>
                  {p.latest?.simulated && (
                    <span className="badge-simulated ml-3">SIMULADO</span>
                  )}
                </h3>
                {(chartData[p.id]?.length ?? 0) > 1 ? (
                  <MoistureChart
                    readings={chartData[p.id]}
                    limit={p.limit}
                    pointName={p.name}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ) : (
                  <p className="text-slate-500 text-sm py-8 text-center">
                    Aguardando leituras para exibir o gráfico…
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
