// ============================================================================
// 🔐 WEBAUTHN — ENREGISTREMENT D'UNE NOUVELLE PASSKEY, ÉTAPE 1/2
// ============================================================================
// ⚠️ Ne pas confondre avec app/api/auth/passkey/generate-login (Lot 2) : cette
// route-ci sert à un utilisateur DÉJÀ CONNECTÉ qui veut AJOUTER une nouvelle
// clé biométrique depuis ses Settings (`generateRegistrationOptions`), alors
// que l'autre sert à un visiteur NON connecté qui veut SE CONNECTER avec une
// clé déjà enregistrée (`generateAuthenticationOptions`). Deux cérémonies
// WebAuthn différentes, deux jeux d'API SimpleWebAuthn différents.
// `excludeCredentials` empêche de ré-enregistrer une clé déjà connue du compte.
//
// ✅ [PHASE B — RÉSOLU] Le challenge expire désormais (voir CHALLENGE_TTL_MS).
import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const rpName = "TrustVerify KYC B2B";

// ============================================================================
// 🆕 [PHASE B] DURÉE DE VIE DU CHALLENGE — 5 MINUTES ICI, CONTRE 2 AU LOGIN
// ============================================================================
// Même correctif que dans generate-login (un challenge sans expiration reste
// rejouable indéfiniment), mais avec une fenêtre VOLONTAIREMENT PLUS LONGUE.
//
// Pourquoi cette différence : la connexion se fait avec une clé DÉJÀ
// configurée — un doigt sur le capteur, quelques secondes. L'ENREGISTREMENT,
// lui, peut être la toute première fois que l'utilisateur crée une passkey :
// Windows Hello peut lui demander de définir un code PIN, d'enrôler une
// empreinte, parfois de traverser plusieurs écrans système. Deux minutes
// suffiraient rarement, et un échec ici serait particulièrement frustrant :
// l'utilisateur aurait fait tout le parcours pour rien.
//
// 5 minutes reste très loin de l'exposition illimitée d'avant, et le risque est
// moindre : cette route exige déjà une session valide, contrairement au login
// qui est ouvert à un visiteur non authentifié.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
    try {
        // 🔒 Sécurité : On s'assure que la session est valide avec authOptions
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            include: { passkeys: true }
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const excludeCredentials = user.passkeys.map(passkey => ({
            id: passkey.credentialID,
            type: "public-key" as const,
            transports: passkey.transports ? (passkey.transports.split(',') as any[]) : undefined,
        }));

        const userIDBuffer = new TextEncoder().encode(user.id);

        // 💡 SÉCURITÉ : Faille de Claude n°5 corrigée
        const rpID = process.env.WEBAUTHN_RPID || "localhost";

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: userIDBuffer,
            userName: user.email,
            userDisplayName: user.fullName,
            attestationType: "none",
            excludeCredentials,
            authenticatorSelection: {
                residentKey: "preferred",
                // 💡 SÉCURITÉ MILITAIRE : On FORCE Windows/Apple à demander le PIN ou la biométrie !
                userVerification: "required", 
            },
        });

        // 🆕 [PHASE B] Challenge ET date d'expiration écrits dans la même
        // opération, pour qu'aucun challenge ne puisse exister sans limite de
        // validité, même une fraction de seconde.
        await prisma.user.update({
            where: { id: user.id },
            data: {
                currentChallenge: options.challenge,
                challengeExpires: new Date(Date.now() + CHALLENGE_TTL_MS),
            },
        });

        return NextResponse.json(options);
    } catch (error: any) {
        console.error("Passkey Generate Error:", error);
        return NextResponse.json({ error: "Failed to generate passkey challenge" }, { status: 500 });
    }
}