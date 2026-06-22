import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    const { email, password, fullName, companyName } = await req.json();

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return NextResponse.json({ error: "Email déja utilisé" }, {status: 400});
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: { email: email , password: hashedPassword, fullName: fullName, companyName: companyName },
    });

    return NextResponse.json({ message: "Utilisateur crée avec succès" });
}