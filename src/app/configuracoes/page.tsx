"use client";

import { useState, useEffect } from "react";

interface PointConfig {
  id: string;
  name: string;
  limit: number;
}

export default function ConfiguracoesPage() {
  const [points, setPoints] = useState<PointConfig[]>([]);
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editingLimit, setEditingLimit] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/points")
      .then((r) => r.json())
      .then((d) => {
        const pts = d.points.map((p: any) => ({ id: p.id, name: p.name, limit: p.limit }));
        setPoints(pts);
        const limMap: Record<string, string> = {};
        const nameMap: Record<string, string> = {};
        for (const p of pts) {
          limMap[p.id] = String(p.limit);
          nameMap[p.id] = p.name;
        }
        setEditingLimit(limMap);
        setEditingName(nameMap);
      })
      .catch(() => {});

    // Lê a chave de API do banco (via settings endpoint)
    fetch("/api/settings/api-key")
      .then((r) => r.json())
      .then((d) => setApiKey(d.apiKey ?? ""))
      .catch(() => {});
  }, []);

  // Detectar se o simulador está rodando (se últimas leituras são simuladas e recentes)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/readings?limit=5&order=desc");
        const data = await res.json();
        const recent = data.readings?.filter(
          (r: any) => r.simulated && Date.now() - r.ts < 15000,
        );
        setSimRunning(recent?.length > 0);
      } catch {}
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const savePoint = async (id: string) => {
    const limit = parseFloat(editingLimit[id]);
    const name = editingName[id]?.trim();
    if (isNaN(limit) || limit <= 0 || limit > 100 || !name) {
      setMessage({ type: "err", text: "Limite deve ser entre 0 e 100; nome não pode ser vazio." });
      return;
    }
    try {
      const res = await fetch(`/api/points/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, limit }),
      });
      if (res.ok) {
        const data = await res.json();
        setPoints(points.map((p) => (p.id === id ? { ...p, name: data.point.name, limit: data.point.limit } : p)));
        setMessage({ type: "ok", text: `Ponto ${id} atualizado.` });
      } else {
        const data = await res.json();
        setMessage({ type: "err", text: data.message ?? "Erro." });
      }
    } catch {
      setMessage({ type: "err", text: "Erro de conexão." });
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-accent mb-6">Configurações</h1>

      {/* Mensagem */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === "ok"
              ? "bg-accent/10 text-accent border border-accent/30"
              : "bg-red-500/10 text-red-400 border border-red-500/30"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Simulador */}
      <div className="card mb-6">
        <h2 className="font-display text-lg font-semibold mb-3">Simulador</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`status-dot ${simRunning ? "ok" : "sem_dados"}`} />
            <span className="text-sm">
              {simRunning ? "Simulador ativo — leituras chegando" : "Simulador inativo"}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Inicie o simulador com <code className="text-accent">npm run sim</code> em outro terminal.
          Para o cenário de alerta: <code className="text-accent">npm run sim:alert</code>
        </p>
      </div>

      {/* Chave de API */}
      <div className="card mb-6">
        <h2 className="font-display text-lg font-semibold mb-3">Chave de API</h2>
        <div className="flex items-center gap-3">
          <code
            className={`bg-navy-700 px-3 py-2 rounded text-sm font-mono flex-1 ${showKey ? "text-slate-200" : "text-transparent select-none"}`}
            style={!showKey ? { textShadow: "0 0 8px rgba(255,255,255,0.3)" } : undefined}
          >
            {showKey ? apiKey : "•".repeat(48)}
          </code>
          <button
            onClick={() => setShowKey(!showKey)}
            className="text-sm text-accent hover:text-accent-light transition-colors"
          >
            {showKey ? "Ocultar" : "Mostrar"}
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(apiKey); setMessage({ type: "ok", text: "Chave copiada!" }); }}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Copiar
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Esta chave é usada pelo firmware e pelo simulador no cabeçalho <code>x-api-key</code>.
        </p>
      </div>

      {/* Pontos */}
      <div className="card">
        <h2 className="font-display text-lg font-semibold mb-4">Pontos de Medição</h2>
        <div className="space-y-4">
          {points.map((p) => (
            <div key={p.id} className="flex flex-wrap items-end gap-3 p-3 bg-white/5 rounded-lg">
              <div className="font-mono text-sm text-slate-400 w-12">{p.id}</div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome</label>
                <input
                  type="text"
                  value={editingName[p.id] ?? p.name}
                  onChange={(e) => setEditingName({ ...editingName, [p.id]: e.target.value })}
                  className="bg-navy-700 border border-white/15 rounded px-2 py-1.5 text-sm text-slate-100 w-40"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Limite (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingLimit[p.id] ?? p.limit}
                  onChange={(e) => setEditingLimit({ ...editingLimit, [p.id]: e.target.value })}
                  className="bg-navy-700 border border-white/15 rounded px-2 py-1.5 text-sm text-slate-100 w-20 font-mono"
                />
              </div>
              <button
                onClick={() => savePoint(p.id)}
                className="bg-accent hover:bg-accent-dark text-navy font-semibold px-4 py-1.5 rounded text-sm transition-colors"
              >
                Salvar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
