import { NextResponse } from "next/server";
import { getCategorySummary } from "@/lib/products";

export async function GET() {
  const summary = getCategorySummary();
  return NextResponse.json({ summary });
}
