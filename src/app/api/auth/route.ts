import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/lib/models";
import { clearSession, createSession, getUserId } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ user: null });
    await connectToDatabase();
    const user = await User.findById(userId).select("name email").lean();
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Unable to verify your session" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = body.mode === "signup" ? "signup" : "login";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || (mode === "signup" && !name)) {
      return NextResponse.json({ error: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
    }

    await connectToDatabase();
    let user = await User.findOne({ email });
    if (mode === "signup") {
      if (user) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    } else if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: mode === "signup" ? 201 : 200 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    const details = error instanceof Error
      ? error.message.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "mongodb://[redacted]")
      : "Unknown authentication error";
    console.error("POST /api/auth failed:", error instanceof Error ? error.name : typeof error);
    return NextResponse.json({
      error: "Authentication is temporarily unavailable. Check your database configuration.",
      ...(process.env.NODE_ENV !== "production" ? { details } : {}),
    }, { status: 503 });
  }
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}