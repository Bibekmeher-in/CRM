import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getUserId } from "@/lib/auth";
import { Contact, Deal } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { dealId } = await request.json();
    if (!mongoose.isValidObjectId(dealId)) return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    await connectToDatabase();
    const deal = await Deal.findOne({ _id: dealId, userId }).lean();
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    const contact = await Contact.findOne({ _id: deal.contactId, userId }).lean();
    if (!contact) return NextResponse.json({ error: "Deal contact not found" }, { status: 404 });

    const key = process.env.OPENAI_API_KEY;
    const context = `Contact: ${contact.name}\nCompany: ${contact.company || deal.company}\nJob title: ${contact.jobTitle}\nDeal: ${deal.title}\nStage: ${deal.stage}\nValue: $${deal.value.toLocaleString()}\nNotes: ${deal.notes || "None"}`;
    if (key) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Write a concise, professional, personalized sales follow-up email. Return JSON with subject and body strings. Do not invent facts or add a signature." },
            { role: "user", content: context },
          ],
        }),
      });
      if (!response.ok) return NextResponse.json({ error: "The AI email service is unavailable. Try again shortly." }, { status: 502 });
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (!content) return NextResponse.json({ error: "The AI service returned an empty email." }, { status: 502 });
      const email = JSON.parse(content);
      if (typeof email.subject !== "string" || typeof email.body !== "string") throw new Error("Invalid AI response");
      return NextResponse.json({ subject: email.subject, body: email.body, fallback: false });
    }

    const subject = `Following up on ${deal.title}`;
    const body = `Hi ${contact.name.split(" ")[0]},\n\nI wanted to follow up on ${deal.title}${deal.company ? ` at ${deal.company}` : ""}. ${deal.notes || `Would you be available to discuss next steps?`}\n\nI would be glad to answer any questions and keep things moving.\n\nBest,`;
    return NextResponse.json({ subject, body, fallback: true });
  } catch {
    return NextResponse.json({ error: "Unable to generate the follow-up email" }, { status: 503 });
  }
}