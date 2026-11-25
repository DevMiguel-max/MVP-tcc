const labels: Record<string, string> = {
  ok: "Dentro do limite",
  atencao: "Atenção",
  alerta: "Alerta",
  sem_dados: "Sem dados",
};

export function StatusDot({ status }: { status: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`status-dot ${status}`} />
      <span className="text-sm">{labels[status] ?? status}</span>
    </span>
  );
}
