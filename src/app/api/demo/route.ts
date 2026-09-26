import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { Contact, Deal } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

const sampleContacts = [
  { name: "Olivia Chen", email: "olivia.chen@example.com", phone: "+1 415 555 0142", company: "Northstar Labs", jobTitle: "VP of Operations", notes: "Evaluating a team-wide rollout this quarter." },
  { name: "Marcus Reed", email: "marcus.reed@example.com", phone: "+1 212 555 0187", company: "Meridian Health", jobTitle: "Director of Procurement", notes: "Needs security review before final approval." },
  { name: "Priya Nair", email: "priya.nair@example.com", phone: "+1 312 555 0126", company: "Fieldstone", jobTitle: "Head of Sales", notes: "Interested in onboarding the regional team." },
  { name: "Ethan Brooks", email: "ethan.brooks@example.com", phone: "+1 617 555 0114", company: "Juniper & Co.", jobTitle: "COO", notes: "Asked for a revised proposal with annual pricing." },
  { name: "Sofia Martinez", email: "sofia.martinez@example.com", phone: "+1 206 555 0159", company: "Atlas Freight", jobTitle: "Sales Enablement Lead", notes: "Strong fit for the new workflow." },
];

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    if (await Contact.exists({ userId })) return NextResponse.json({ error: "Your workspace already has contacts." }, { status: 409 });
    const contacts = await Contact.insertMany(sampleContacts.map((contact) => ({ ...contact, userId })));
    await Deal.insertMany([
      { userId, contactId: contacts[0]._id, title: "Operations platform rollout", company: contacts[0].company, value: 42000, stage: "Qualified", notes: "Pilot proposal shared; follow up on rollout timing." },
      { userId, contactId: contacts[1]._id, title: "Clinical procurement workflow", company: contacts[1].company, value: 28500, stage: "Contacted", notes: "Security documentation requested." },
      { userId, contactId: contacts[2]._id, title: "Regional sales enablement", company: contacts[2].company, value: 18000, stage: "New", notes: "Intro call scheduled next week." },
      { userId, contactId: contacts[3]._id, title: "Annual team subscription", company: contacts[3].company, value: 36000, stage: "Won", notes: "Closed for the full sales org." },
      { userId, contactId: contacts[4]._id, title: "Freight sales workspace", company: contacts[4].company, value: 12500, stage: "Lost", notes: "Revisit after the busy season." },
    ]);
    return NextResponse.json({ ok: true, contacts: contacts.length, deals: 5 }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to add demo data" }, { status: 503 });
  }
}