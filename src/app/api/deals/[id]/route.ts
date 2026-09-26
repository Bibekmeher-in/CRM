import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getUserId } from "@/lib/auth";
import { Contact, Deal } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

type Context = { params: Promise<{ id: string }> };
const stages = ["New", "Contacted", "Qualified", "Won", "Lost"];

export async function PATCH(request: Request, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
  try {
    const body = await request.json();
    const update: Record<string, unknown> = {};
    if ("title" in body) {
      if (typeof body.title !== "string" || !body.title.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
      update.title = body.title.trim();
    }
    if ("value" in body) {
      const value = Number(body.value);
      if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "Deal value must be non-negative." }, { status: 400 });
      update.value = value;
    }
    if ("stage" in body) {
      if (!stages.includes(body.stage)) return NextResponse.json({ error: "Invalid deal stage" }, { status: 400 });
      update.stage = body.stage;
    }
    for (const field of ["company", "notes"]) {
      if (field in body) {
        if (typeof body[field] !== "string") return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
        update[field] = body[field].trim();
      }
    }
    if ("contactId" in body) {
      if (!mongoose.isValidObjectId(body.contactId)) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
      await connectToDatabase();
      const contact = await Contact.findOne({ _id: body.contactId, userId });
      if (!contact) return NextResponse.json({ error: "Choose one of your own contacts." }, { status: 400 });
      update.contactId = contact.id;
    } else {
      await connectToDatabase();
    }
    const deal = await Deal.findOneAndUpdate({ _id: id, userId }, update, { new: true, runValidators: true })
      .populate("contactId", "name email company jobTitle").lean();
    return deal ? NextResponse.json({ deal }) : NextResponse.json({ error: "Deal not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Unable to update deal" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
  try {
    await connectToDatabase();
    const deal = await Deal.findOneAndDelete({ _id: id, userId });
    return deal ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Deal not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Unable to delete deal" }, { status: 503 });
  }
}