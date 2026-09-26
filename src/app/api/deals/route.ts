import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getUserId } from "@/lib/auth";
import { Contact, Deal } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

const stages = ["New", "Contacted", "Qualified", "Won", "Lost"] as const;

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const deals = await Deal.find({ userId }).populate("contactId", "name email company jobTitle").sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ deals });
  } catch {
    return NextResponse.json({ error: "Unable to load deals" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const value = Number(body.value);
    if (!title || !mongoose.isValidObjectId(body.contactId) || !Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "Title, contact, and a non-negative value are required." }, { status: 400 });
    }
    if (body.stage && !stages.includes(body.stage)) return NextResponse.json({ error: "Invalid deal stage" }, { status: 400 });
    await connectToDatabase();
    const contact = await Contact.findOne({ _id: body.contactId, userId });
    if (!contact) return NextResponse.json({ error: "Choose one of your own contacts." }, { status: 400 });
    const deal = await Deal.create({
      userId,
      contactId: contact.id,
      title,
      company: typeof body.company === "string" ? body.company.trim() : contact.company,
      value,
      stage: body.stage ?? "New",
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
    });
    return NextResponse.json({ deal: await deal.populate("contactId", "name email company jobTitle") }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create deal" }, { status: 503 });
  }
}