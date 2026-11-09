import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { addDays, isIsoDate, mondayOfWeek } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "Informe uma data válida." }, { status: 400 });
  }
  const start = mondayOfWeek(date);
  const end = addDays(start, 6);
  const counts = getDatabase().weeklyCounts(start, end);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(start, index);
    return {
      date: day,
      received: counts.received.find((item) => item.day === day)?.count ?? 0,
      delivered: counts.delivered.find((item) => item.day === day)?.count ?? 0,
    };
  });
  return NextResponse.json({ days }, { headers: { "Cache-Control": "private, no-store" } });
}
