import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { Contact, Deal } from "@/lib/models";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const [totalContacts, totalDeals, wonDeals, pipeline, recentContacts, recentDeals, distribution] = await Promise.all([
      Contact.countDocuments({ userId }),
      Deal.countDocuments({ userId }),
      Deal.countDocuments({ userId, stage: "Won" }),
      Deal.aggregate([
        { $match: { userId: (await import("mongoose")).default.Types.ObjectId.createFromHexString(userId) } },
        { $group: { _id: "$stage", total: { $sum: "$value" }, count: { $sum: 1 } } },
      ]),
      Contact.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
      Deal.find({ userId }).populate("contactId", "name company").sort({ updatedAt: -1 }).limit(5).lean(),
      Deal.aggregate([
        { $match: { userId: (await import("mongoose")).default.Types.ObjectId.createFromHexString(userId) } },
        { $group: { _id: "$stage", count: { $sum: 1 } } },
      ]),
    ]);
    const openDeals = pipeline.filter((row: { _id: string }) => !["Won", "Lost"].includes(row._id));
    return NextResponse.json({
      stats: {
        totalContacts,
        totalDeals,
        openDeals: openDeals.reduce((sum: number, row: { count: number }) => sum + row.count, 0),
        wonDeals,
        pipelineValue: openDeals.reduce((sum: number, row: { total: number }) => sum + row.total, 0),
        wonRevenue: pipeline.find((row: { _id: string }) => row._id === "Won")?.total ?? 0,
      },
      recentContacts,
      recentDeals,
      distribution,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load dashboard data" }, { status: 503 });
  }
}