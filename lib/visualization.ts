import { TREATMENT_OPTIONS, type Treatment } from "./treatment";
import type { StuckRecord } from "./stuck";

type ChartRecord = Pick<StuckRecord, "tracking" | "days">;

export type DayCounts = { below: number; atLimit: number; above: number };

export function chartCounts(records: readonly ChartRecord[], treatments: ReadonlyMap<string, Treatment>) {
  const days: DayCounts = { below: 0, atLimit: 0, above: 0 };
  const classification = new Map<Treatment, number>(TREATMENT_OPTIONS.map((option) => [option, 0]));
  let unclassified = 0;

  for (const record of records) {
    const bucket = record.days < 15 ? "below" : record.days === 15 ? "atLimit" : "above";
    days[bucket]++;

    const treatment = treatments.get(record.tracking);
    if (treatment) classification.set(treatment, classification.get(treatment)! + 1);
    else unclassified++;
  }
  return { days, classification, unclassified };
}
