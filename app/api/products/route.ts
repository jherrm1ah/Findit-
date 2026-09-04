import { NextResponse } from "next/server";
import { listProducts } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ products: listProducts() });
}
