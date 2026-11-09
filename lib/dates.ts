export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function csvDate(value: string): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[4]) > 23 || Number(match[5]) > 59) return null;
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  return isIsoDate(result) ? result : null;
}

export function mondayOfWeek(value: string): string {
  if (!isIsoDate(value)) throw new Error("Data inválida.");
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  if (!isIsoDate(value)) throw new Error("Data inválida.");
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
