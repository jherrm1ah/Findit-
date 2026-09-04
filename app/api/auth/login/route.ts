import { NextRequest, NextResponse } from "next/server";
import { verifyLogin, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { phone?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.phone || !body.password) {
    return NextResponse.json({ error: "Enter your phone and password." }, { status: 400 });
  }

  const user = verifyLogin(body.phone, body.password);
  if (!user) {
    return NextResponse.json(
      { error: "Phone number or password is incorrect." },
      { status: 401 }
    );
  }

  const token = createSession(user.id);
  const res = NextResponse.json({ user });
  setSessionCookie(res, token);
  return res;
}
