import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        
        const { 
            customerName, 
            email, 
            type,  
            status, 
            score,
            cin, 
            documentType, 
            nationality, 
            dateOfBirth,
            phoneNumber, 
            userId
        } = body;

        if (!customerName || !email || !cin || !userId) {
            return NextResponse.json({
                error: "Missing required fields: Name, Email, CIN, and User ID are mandatory.",
            }, { status: 400 });
        }

        const newRequest = await prisma.verificationRequest.create({
            data: {
                customerName: customerName,
                email: email,
                type: type || "Identity",
                cin: cin,
                documentType: documentType || "CIN",
                nationality: nationality || "Not specified",
                dateOfBirth: dateOfBirth || "Not specified",
                phoneNumber: phoneNumber || null,
                status: status || "pending",
                score: score || "--",
                userId: userId,
            },
        });

        return NextResponse.json({
            message: "Verification request created successfully", 
            data: newRequest 
        }, { status: 201 });

    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json(
                { error: "This CIN is already registered in our system. Duplicate accounts are not allowed." }, 
                { status: 409 }
            );
        }

        console.error("Error creating verification request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limitParam = searchParams.get("limit");
        const pageParam = searchParams.get("page");

        const page = pageParam ? parseInt(pageParam, 10) : 1;
        const limit = limitParam ? parseInt(limitParam, 10) : 10;

        const skip = (page - 1) * limit;

        const [requests, total] = await Promise.all([
            prisma.verificationRequest.findMany({
                take: limit,
                skip: skip,
                orderBy: {
                    submittedAt: "desc",
                },
            }),
            prisma.verificationRequest.count()
        ]);

        return NextResponse.json({
            requests,
            total,
            page,
            limit
        });

    } catch (error: any) {
        console.error("Error fetching verification requests:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}