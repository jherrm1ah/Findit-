import { NextRequest, NextResponse } from "next/server";
import { createUser, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: {
    phone?: string;
    password?: string;
    name?: string;
    role?: string;
    businessName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { phone, password, name, role, businessName } = body;
  if (!phone || phone.trim().length < 10) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters." },
      { status: 400 }
    );
  }
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }
  if (role !== "buyer" && role !== "seller") {
    return NextResponse.json({ error: "Choose an account type." }, { status: 400 });
  }
  if (role === "seller" && (!businessName || !businessName.trim())) {
    return NextResponse.json({ error: "Enter your business name." }, { status: 400 });
  }

  try {
    const user = createUser({
      phone,
      password,
      name: name.trim(),
      role,
      businessName: role === "seller" ? businessName!.trim() : null,
    });
    const token = createSession(user.id);
    const res = NextResponse.json({ user });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create that account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
