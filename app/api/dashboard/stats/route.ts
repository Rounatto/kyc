import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") || "30d";

        const days = range === "90d" ? 90 : range === "1y" ? 365 : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - days);

        const [total, verified, pending, highRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "pending", submittedAt: { gte: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: startDate } } }),
        ]);

        const [prevTotal, prevVerified, prevPending, prevHighRisk] = await Promise.all([
            prisma.verificationRequest.count({ where: { submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "verified", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { status: "pending", submittedAt: { gte: prevStartDate, lt: startDate } } }),
            prisma.verificationRequest.count({ where: { riskLevel: "High", submittedAt: { gte: prevStartDate, lt: startDate } } }),
        ]);

        const calcDelta = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return (((curr - prev) / prev) * 100);
        };

        return NextResponse.json({
            stats: { total, verified, pending, highRisk },
            trends: {
                totalDelta: calcDelta(total, prevTotal),
                verifiedDelta: calcDelta(verified, prevVerified),
                pendingDelta: calcDelta(pending, prevPending),
                highRiskDelta: calcDelta(highRisk, prevHighRisk)
            }
        });
    } catch (error: any) {
        console.error("Dashboard Stats Error:", error);
        return NextResponse.json({ error: "Failed to load dashboard metrics" }, { status: 500 });
    }
}