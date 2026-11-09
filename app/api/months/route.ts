import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { months: getDatabase().listMonths() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
