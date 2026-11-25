/** Etiqueta obrigatória para dados simulados. */
export function SimulatedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`badge-simulated ${className}`} title="Dado gerado pelo simulador, não é uma medição real">
      SIMULADO
    </span>
  );
}
