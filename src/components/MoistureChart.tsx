"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

interface Reading {
  ts: number;
  moisture: number;
}

interface Props {
  readings: Reading[];
  limit: number;
  pointName: string;
  color?: string;
}

export function MoistureChart({ readings, limit, pointName, color = "#22c55e" }: Props) {
  const data = readings.map((r) => ({
    time: new Date(r.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    ts: r.ts,
    moisture: r.moisture,
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={{ stroke: "#475569" }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={{ stroke: "#475569" }}
            label={{ value: "%", position: "insideLeft", fill: "#94a3b8", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0b1f3a",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              color: "#f1f5f9",
              fontSize: 13,
            }}
            formatter={(value: number) => [`${value.toFixed(2)}%`, "Umidade"]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            y={limit}
            stroke="#ef4444"
            strokeDasharray="6 3"
            strokeWidth={2}
            label={{ value: `Limite ${limit}%`, fill: "#ef4444", fontSize: 11, position: "right" }}
          />
          <Line
            type="monotone"
            dataKey="moisture"
            stroke={color}
            strokeWidth={2}
            dot={false}
            name={pointName}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
