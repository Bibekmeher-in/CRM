import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getUserId } from "@/lib/auth";
import { Contact } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  try {
    await connectToDatabase();
    const contact = await Contact.findOne({ _id: id, userId }).lean();
    return contact ? NextResponse.json({ contact }) : NextResponse.json({ error: "Contact not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Unable to load contact" }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  try {
    const body = await request.json();
    const update: Record<string, string> = {};
    for (const field of ["name", "email", "phone", "company", "jobTitle", "notes"]) {
      if (field in body) {
        if (typeof body[field] !== "string") return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
        update[field] = body[field].trim();
      }
    }
    if ("name" in update && !update.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if ("email" in update) {
      update.email = update.email.toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(update.email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }
    await connectToDatabase();
    const contact = await Contact.findOneAndUpdate({ _id: id, userId }, update, { new: true, runValidators: true }).lean();
    return contact ? NextResponse.json({ contact }) : NextResponse.json({ error: "Contact not found" }, { status: 404 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "This email is already in your contacts." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update contact" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  try {
    await connectToDatabase();
    const contact = await Contact.findOneAndDelete({ _id: id, userId });
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    await mongoose.model("Deal").deleteMany({ contactId: id, userId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete contact" }, { status: 503 });
  }
}