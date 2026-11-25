"use client";

import { SimulatedBadge } from "./SimulatedBadge";

interface AlertInfo {
  pointId: string;
  pointName: string;
  moisture: number;
  limit: number;
  simulated: boolean;
}

export function AlertBar({ alerts }: { alerts: AlertInfo[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-0">
      {alerts.map((a) => (
        <div key={a.pointId} className="alert-bar">
          <span className="text-red-400 text-lg">🚨</span>
          <span>
            <strong>{a.pointName} ({a.pointId})</strong> — Umidade{" "}
            <strong>{a.moisture.toFixed(2)}%</strong> acima do limite de{" "}
            <strong>{a.limit.toFixed(1)}%</strong>
          </span>
          {a.simulated && <SimulatedBadge />}
        </div>
      ))}
    </div>
  );
}
