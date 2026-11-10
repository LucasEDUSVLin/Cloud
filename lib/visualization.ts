import { TREATMENT_OPTIONS, type Treatment } from "./treatment";
import type { StuckRecord } from "./stuck";

type ChartRecord = Pick<StuckRecord, "tracking" | "days">;

export function chartCounts(records: readonly ChartRecord[], treatments: ReadonlyMap<string, Treatment>) {
  const days = { below: 0, atLimit: 0, above: 0 };
  const classification = new Map<Treatment, number>(TREATMENT_OPTIONS.map((option) => [option, 0]));
  let unclassified = 0;

  for (const record of records) {
    if (record.days < 15) days.below++;
    else if (record.days === 15) days.atLimit++;
    else days.above++;

    const treatment = treatments.get(record.tracking);
    if (treatment) classification.set(treatment, classification.get(treatment)! + 1);
    else unclassified++;
  }
  return { days, classification, unclassified };
}
