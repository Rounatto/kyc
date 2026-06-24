import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request ) {
    try {
        const body = await req.json();
        const { customerName, email, type, status, score, userId } = body;

        if (!customerName || !email || !type || !userId) {
            return NextResponse.json({
                error: "Missing required fields",
            }, { status: 400 });
        }
        const newRequest = await prisma.verificationRequest.create({
            data: {
                customerName: customerName,
                email: email,
                type: type,
                status: status || "pending",
                score: score || "--",
                userId: userId,
            },
        });
        return NextResponse.json({
            message: "Verification request created successfully", data: newRequest }, { status: 201 });
    } catch (error: any) {
        console.error("Error creating verification request:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const requests = await prisma.verificationRequest.findMany({
            orderBy: {
                submittedAt: "desc",
            },
        });
        return NextResponse.json(requests);
    } catch (error: any) {
        console.error("Error fetching verification requests:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

}