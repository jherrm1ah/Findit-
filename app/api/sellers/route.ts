import { NextResponse } from "next/server";
import { listSellers } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ sellers: listSellers() });
}
