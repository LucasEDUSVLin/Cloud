export const TREATMENT_OPTIONS = [
  "Débito base",
  "Débito entregador",
  "Em análise",
  "Aguardando resposta",
  "Perdido",
  "Entregue",
  "Cliente recebeu",
  "Cliente não recebeu",
  "Item danificado",
] as const;

export type Treatment = typeof TREATMENT_OPTIONS[number];

export function isTreatment(value: unknown): value is Treatment {
  return typeof value === "string" && TREATMENT_OPTIONS.some((option) => option === value);
}
