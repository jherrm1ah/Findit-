import { NextRequest, NextResponse } from "next/server";
import { listProducts } from "@/lib/products";
import { Status } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const status = (searchParams.get("status") as Status | null) ?? undefined;
  const testBatchOnly = searchParams.get("testBatchOnly") === "true";
  const search = searchParams.get("search") ?? undefined;

  const products = listProducts({ category, status, testBatchOnly, search });
  return NextResponse.json({ products });
}
