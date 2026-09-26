import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getUserId } from "@/lib/auth";
import { Contact, Deal, User } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

const dealStages = ["New", "Contacted", "Qualified", "Won", "Lost"] as const;
type DealStage = (typeof dealStages)[number];
type EmailContent = {
  subject: string;
  body: string;
  personalization_points: string[];
  call_to_action: string;
};
type EmailDraft = EmailContent & {
  fallback: boolean;
  fallbackReason?: "upstream-unavailable";
  generationWarning?: string;
};
type OpenAIResponse = {
  choices?: { message?: { content?: string | null } }[];
};
type OpenAIErrorResponse = {
  error?: { code?: string | null; type?: string | null };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEmailContent(value: unknown): EmailContent | null {
  if (!isRecord(value)) return null;
  const { subject, body, personalization_points, call_to_action: callToAction } = value;
  if (
    typeof subject !== "string" ||
    typeof body !== "string" ||
    !Array.isArray(personalization_points) ||
    !personalization_points.every((point) => typeof point === "string") ||
    typeof callToAction !== "string"
  ) return null;
  if (!subject.trim() || !body.trim() || !callToAction.trim()) return null;
  return { subject: subject.trim(), body: body.trim(), personalization_points, call_to_action: callToAction.trim() };
}

function templateEmail({
  contactName,
  companyName,
  dealTitle,
  dealStage,
  dealNotes,
  contactNotes,
  senderName,
}: {
  contactName: string;
  companyName: string;
  dealTitle: string;
  dealStage: DealStage;
  dealNotes: string;
  contactNotes: string;
  senderName: string;
}): EmailDraft {
  const firstName = contactName.trim().split(/\s+/)[0];
  const relevantNote = dealNotes || contactNotes;
  const openerByStage: Record<DealStage, string> = {
    New: `I’m following up about ${dealTitle}${companyName ? ` at ${companyName}` : ""}.`,
    Contacted: `Following up on ${relevantNote || dealTitle}${relevantNote ? ` and our conversation about ${dealTitle}` : ""}.`,
    Qualified: `For ${dealTitle},${relevantNote ? ` your notes mention ${relevantNote}.` : " I’m ready to discuss the next step when useful."}`,
    Won: `Thank you for choosing us for ${dealTitle}${companyName ? ` at ${companyName}` : ""}.`,
    Lost: `I understand ${dealTitle} is not moving forward right now.`,
  };
  const valueLine = dealStage === "Won"
    ? "I’m available to coordinate the next steps."
    : dealStage === "Lost"
      ? "If priorities change, I’d be glad to revisit the conversation."
      : "I’d be glad to discuss a practical next step.";
  const callToAction = dealStage === "Won"
    ? "Would you be available to align on onboarding next steps?"
    : dealStage === "Lost"
      ? "Would it be useful if I checked back at a better time?"
      : "Would you be open to a brief conversation about next steps?";
  const body = `Hi ${firstName},\n\n${openerByStage[dealStage]}${relevantNote && dealStage !== "Contacted" && dealStage !== "Qualified" ? ` ${relevantNote}` : ""}\n\n${valueLine}\n\n${callToAction}\n\nBest,${senderName ? `\n${senderName}` : ""}`;
  return {
    subject: `${dealStage === "Won" ? "Next steps for" : dealStage === "Lost" ? "Revisiting" : "Following up on"} ${dealTitle}`,
    body,
    personalization_points: [dealTitle, ...(relevantNote ? [relevantNote] : []), ...(companyName ? [companyName] : [])],
    call_to_action: callToAction,
    fallback: true,
    fallbackReason: "upstream-unavailable",
  };
}

function upstreamErrorMessage(status: number, code?: string | null) {
  if (status === 401 || status === 403) return "OpenAI rejected the configured API key or its permissions.";
  if (["credit_balance_exhausted", "insufficient_quota", "billing_not_active", "billing_hard_limit_reached"].includes(code || "")) {
    return "OpenAI API billing has no available credits. Update billing or use a funded API key; a CRM-based draft is ready instead.";
  }
  if (status === 429) return "OpenAI rate limits or usage quota prevented email generation.";
  return `OpenAI could not generate the email (HTTP ${status}). A contextual template is ready instead.`;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isRecord(requestBody) || typeof requestBody.dealId !== "string" || !mongoose.isValidObjectId(requestBody.dealId)) {
    return NextResponse.json({ error: "A valid dealId is required." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const deal = await Deal.findOne({ _id: requestBody.dealId, userId }).lean();
    if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    const contact = await Contact.findOne({ _id: deal.contactId, userId }).lean();
    if (!contact) return NextResponse.json({ error: "Deal contact not found." }, { status: 404 });
    const sender = await User.findById(userId).select("name").lean();

    const missingFields = [
      ...(!contact.name?.trim() ? ["contact name"] : []),
      ...(!contact.email?.trim() ? ["contact email"] : []),
      ...(!deal.title?.trim() ? ["deal title"] : []),
      ...(!dealStages.includes(deal.stage as DealStage) ? ["valid deal stage"] : []),
    ];
    if (missingFields.length) {
      return NextResponse.json({ error: `Cannot generate an email; missing required CRM data: ${missingFields.join(", ")}.` }, { status: 422 });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 503 });

    const stage = deal.stage as DealStage;
    const companyName = contact.company?.trim() || deal.company?.trim() || "";
    const dealNotes = deal.notes?.trim() || "";
    const contactNotes = contact.notes?.trim() || "";
    const crmContext = {
      contact_name: contact.name,
      contact_first_name: contact.name.trim().split(/\s+/)[0],
      contact_job_title: contact.jobTitle?.trim() || "Not provided",
      contact_company: companyName || "Not provided",
      contact_email: contact.email,
      deal_title: deal.title,
      deal_stage: stage,
      deal_value: Number.isFinite(deal.value) ? deal.value : "Not provided",
      deal_notes: dealNotes || "Not provided",
      previous_interaction_or_context: [contactNotes, dealNotes].filter(Boolean).join("\n") || "Not provided",
      sender_name: sender?.name?.trim() || "Not provided",
      sender_company_name: "Not provided",
      product_or_service: [dealNotes, contactNotes].filter(Boolean).join("\n") || "Not provided; no dedicated product/service field exists in the CRM.",
    };
    const stageGuidance: Record<DealStage, string> = {
      New: "Briefly introduce only the product or service explicitly present in the notes and connect it to a need explicitly stated there. If none is present, keep the introduction conservative.",
      Contacted: "Continue the conversation using previous interaction/context when supplied; never imply a specific meeting or promise that is not recorded.",
      Qualified: "Focus on stated requirements in CRM notes and propose a concrete next step supported by those notes.",
      Won: "Write a professional thank-you/onboarding note and ask one clear question about coordinating next steps.",
      Lost: "Write respectful, low-pressure re-engagement. Acknowledge the closed/lost status without contradicting CRM notes.",
    };
    const systemPrompt = `You are an experienced B2B sales representative writing personalized follow-up emails. Your job is to transform verified CRM information into a concise, natural email. Personalization must come from the supplied CRM data. Never invent facts.

Write a professional, concise, human-sounding B2B email for the supplied deal stage. Use the contact's job title only when relevant. Use company information and one or two specific details from notes naturally. Explain a value proposition only when the CRM data supports it; do not invent product capabilities, customer needs, metrics, commitments, meetings, dates, or company facts. Never mention AI. Avoid excessive marketing language and these generic openings: "I hope this email finds you well", "I wanted to reach out", "Just checking in", and "I hope you're doing well". Return a subject of 5-10 words and 2-4 short body paragraphs, including a greeting using the contact's first name, one clear specific call-to-action, and a professional sign-off. Use the supplied sender name only when provided. Keep the email conservative when personalization data is limited.

Stage-specific guidance: ${stageGuidance[stage]}

Before returning, check that every factual claim is supported, the email is stage-appropriate, concise, personalized, natural, has one clear CTA, and has a relevant subject. Return only the required JSON object.`;

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.4,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "sales_follow_up_email",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                  body: { type: "string" },
                  personalization_points: { type: "array", items: { type: "string" } },
                  call_to_action: { type: "string" },
                },
                required: ["subject", "body", "personalization_points", "call_to_action"],
                additionalProperties: false,
              },
            },
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Verified CRM data ("Not provided" means the value is absent; do not infer it):\n${JSON.stringify(crmContext, null, 2)}` },
          ],
        }),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "request timed out" : "network request failed";
      console.error(`OpenAI email generation ${reason}.`);
      const fallbackEmail = templateEmail({ contactName: contact.name, companyName, dealTitle: deal.title, dealStage: stage, dealNotes, contactNotes, senderName: sender?.name?.trim() || "" });
      return NextResponse.json({ ...fallbackEmail, generationWarning: `OpenAI ${reason}. A contextual template is ready instead.` });
    }

    if (!response.ok) {
      const upstreamError = await response.json().catch(() => null) as OpenAIErrorResponse | null;
      const errorCode = upstreamError?.error?.code || upstreamError?.error?.type;
      console.error(`OpenAI email generation failed with HTTP ${response.status}${errorCode ? ` (${errorCode})` : ""}.`);
      const fallbackEmail = templateEmail({ contactName: contact.name, companyName, dealTitle: deal.title, dealStage: stage, dealNotes, contactNotes, senderName: sender?.name?.trim() || "" });
      return NextResponse.json({ ...fallbackEmail, generationWarning: upstreamErrorMessage(response.status, upstreamError?.error?.code) });
    }

    const result = await response.json() as OpenAIResponse;
    const content = result.choices?.[0]?.message?.content;
    let emailContent: EmailContent | null = null;
    try {
      emailContent = content ? parseEmailContent(JSON.parse(content) as unknown) : null;
    } catch {
      emailContent = null;
    }
    if (!emailContent) {
      console.error("OpenAI returned an invalid structured email response.");
      const fallbackEmail = templateEmail({ contactName: contact.name, companyName, dealTitle: deal.title, dealStage: stage, dealNotes, contactNotes, senderName: sender?.name?.trim() || "" });
      return NextResponse.json({ ...fallbackEmail, generationWarning: "OpenAI returned an invalid email draft. A contextual template is ready instead." });
    }

    return NextResponse.json({ ...emailContent, fallback: false });
  } catch (error) {
    console.error("Unable to generate follow-up email from CRM data.", error instanceof Error ? error.message : "Unknown server error");
    return NextResponse.json({ error: "Unable to generate the follow-up email from CRM data." }, { status: 503 });
  }
}