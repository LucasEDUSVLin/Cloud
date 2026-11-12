import { TREATMENT_OPTIONS, type Treatment } from "./treatment";
import type { StuckRecord } from "./stuck";

type ChartRecord = Pick<StuckRecord, "tracking" | "days">;

export type DayCounts = { below: number; atLimit: number; above: number };
export type ChartFilter =
  | { kind: "days"; value: keyof DayCounts }
  | { kind: "treatment"; value: Treatment | null };

function dayBucket(days: number): keyof DayCounts {
  return days < 15 ? "below" : days === 15 ? "atLimit" : "above";
}

export function matchesChartFilter(record: ChartRecord, treatment: Treatment | undefined, filter: ChartFilter) {
  return filter.kind === "days"
    ? dayBucket(record.days) === filter.value
    : (treatment ?? null) === filter.value;
}

export function chartCounts(records: readonly ChartRecord[], treatments: ReadonlyMap<string, Treatment>) {
  const days: DayCounts = { below: 0, atLimit: 0, above: 0 };
  const classification = new Map<Treatment, number>(TREATMENT_OPTIONS.map((option) => [option, 0]));
  let unclassified = 0;

  for (const record of records) {
    days[dayBucket(record.days)]++;

    const treatment = treatments.get(record.tracking);
    if (treatment) classification.set(treatment, classification.get(treatment)! + 1);
    else unclassified++;
  }
  return { days, classification, unclassified };
}
