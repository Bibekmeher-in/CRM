import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { Contact } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const search = new URL(request.url).searchParams.get("q")?.trim();
    const filter = search
      ? { userId, $or: ["name", "email", "company", "jobTitle"].map((field) => ({ [field]: { $regex: search, $options: "i" } })) }
      : { userId };
    const contacts = await Contact.find(filter).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ error: "Unable to load contacts" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
    }
    await connectToDatabase();
    const contact = await Contact.create({
      userId,
      name,
      email,
      phone: typeof body.phone === "string" ? body.phone.trim() : "",
      company: typeof body.company === "string" ? body.company.trim() : "",
      jobTitle: typeof body.jobTitle === "string" ? body.jobTitle.trim() : "",
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "This email is already in your contacts." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create contact" }, { status: 503 });
  }
}