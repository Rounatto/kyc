// ============================================================================
// 📂 DOSSIER KYC INDIVIDUEL — DÉTAIL (GET) + DÉCISION AGENT (PATCH)
// ============================================================================
// GET renvoie un dossier avec tout son historique d'audit (pour l'écran de
// détail). PATCH est LA route où un agent humain rend sa décision finale
// (approuver/rejeter) après avoir revu le score automatique du moteur KYC —
// c'est le point de contrôle humain du pipeline (human-in-the-loop), et
// chaque décision déclenche en cascade : ligne d'audit, notification interne
// dashboard, email aux agents abonnés, email au client final.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendKYCEmail, sendAgentNotificationEmail } from "@/lib/mail";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { enforceRole } from "@/lib/rbac";

export async function GET(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId } = guard;
        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        const customer = await prisma.verificationRequest.findUnique({
            where: { 
                id: customerId,
                companyId: companyId!
            },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' },
                    include: { agent: { select: { fullName: true } } }
                }
            }
        });

        if (!customer) {
            return NextResponse.json({ message: "Customer not found or unauthorized access." }, { status: 404 });
        }
        
        return NextResponse.json(customer);
    } catch (error: any) {
        console.error("GET Error:", error);
        return NextResponse.json({ message: "Internal server error." }, { status: 500 });
    }
}

export async function PATCH(
    req: Request, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        
        const guard = enforceRole(session, ["COMPANY_ADMIN", "COMPANY_AGENT"]);
        if (!guard.isValid) return guard.response!;

        const { companyId, userId: serverAgentId } = guard;
        const serverAgentName = session?.user?.name || "Unknown Agent";

        const resolvedParams = await params;
        const customerId = resolvedParams.id;

        const existingCustomer = await prisma.verificationRequest.findUnique({
            where: { id: customerId, companyId: companyId! }
        });

        if (!existingCustomer) {
            return NextResponse.json({ message: "Customer not found or unauthorized." }, { status: 404 });
        }

        const body = await req.json();

        // --- LOGIQUE DE FLAG MANUEL (AUDIT) ---
        // Un agent peut signaler un dossier pour revue interne SANS changer
        // son statut KYC (ex: doute sur un dossier déjà "verified"). Ça ne
        // fait qu'ajouter une ligne d'audit + alerter les abonnés "Alerts".
        if (body.action === "FLAG_AUDIT") {
            const flaggedCustomer = await prisma.verificationRequest.update({
                where: { id: customerId },
                data: {
                    auditLogs: {
                        create: {
                            action: "FLAGGED",
                            details: `Profile manually flagged for internal security audit by ${serverAgentName}. Immediate attention required.`,
                            agentId: serverAgentId!,
                            companyId: companyId!
                        }
                    }
                }
            });

            // 💡 NOTIFICATION PAR EMAIL (Routage selon Settings: emailNotifAlerts)
            const alertSubscribers = await prisma.user.findMany({
                where: { companyId: companyId!, emailNotifAlerts: true }
            });
            for (const admin of alertSubscribers) {
                sendAgentNotificationEmail(admin.email, "ALERT", existingCustomer.customerName, serverAgentName).catch(console.error);
            }

            return NextResponse.json(flaggedCustomer);
        }

        // --- DÉCISION FINALE DE L'AGENT (le vrai changement de statut KYC) ---
        const { status, rejectionReason } = body;

        if (!status || !["verified", "rejected", "pending"].includes(status)) {
            return NextResponse.json({ message: "Invalid status value." }, { status: 400 });
        }

        let actionName = "UPDATED";
        let logDetails = `Status changed to ${status} by ${serverAgentName}.`;

        if (status === "verified") {
            actionName = "APPROVED";
            logDetails = `KYC Profile manually approved by ${serverAgentName}.`;
        } else if (status === "rejected") {
            actionName = "REJECTED";
            logDetails = `KYC Profile rejected by ${serverAgentName}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        }
        
        const updatedCustomer = await prisma.verificationRequest.update({
            where: { id: customerId },
            data: { 
                status,
                auditLogs: {
                    create: {
                        action: actionName,
                        details: logDetails,
                        agentId: serverAgentId!,
                        companyId: companyId!
                    }
                }
            },
            include: {
                auditLogs: {
                    orderBy: { timestamp: 'desc' } 
                }
            }
        });

        // 💡 NOTIFICATIONS TEMPS RÉEL SUR LE DASHBOARD
        if (status === "verified") {
            await prisma.notification.create({
                data: {
                    type: "SUCCESS",
                    title: "KYC Profile Approved",
                    message: `The profile for ${existingCustomer.customerName} was manually verified and approved by ${serverAgentName}.`,
                    companyId: companyId!
                }
            });
        } else if (status === "rejected") {
            await prisma.notification.create({
                data: {
                    type: "SYSTEM",
                    title: "KYC Profile Rejected",
                    message: `The profile for ${existingCustomer.customerName} was rejected by ${serverAgentName}.`,
                    companyId: companyId!
                }
            });
        }

        // 💡 NOTIFICATION PAR EMAIL (Pour les Agents, basé sur les Settings)
        try {
            const subscribers = await prisma.user.findMany({
                where: { 
                    companyId: companyId!, 
                    OR: [
                        { emailNotifSuccess: status === "verified" },
                        { emailNotifAlerts: status === "rejected" }
                    ]
                }
            });

            const emailType = status === "verified" ? "SUCCESS" : "ALERT";
            
            // On envoie à tous les agents abonnés de manière asynchrone pour ne pas ralentir le serveur
            for (const sub of subscribers) {
                sendAgentNotificationEmail(sub.email, emailType, existingCustomer.customerName, serverAgentName).catch(console.error);
            }
        } catch (subError) {
            console.error("Failed to query notification subscribers:", subError);
        }

        // 💡 EMAIL EXTERNE (Pour le Client final)
        // `customerName`/`rejectionReason` finissent interpolés tels quels dans
        // le HTML du template (voir lib/mail.ts) — pas d'échappement HTML ici.
        // ⚠️ Piège JS : `sendKYCEmail(...)` n'est PAS "await"é, donc le
        // try/catch autour ne sert à rien pour une erreur d'envoi réelle (le
        // bloc try est déjà sorti avant que la promesse ne se résolve/rejette) —
        // une éventuelle erreur SMTP deviendrait une "unhandled promise
        // rejection" silencieuse plutôt que d'être loguée ici.
        if (status === "verified" || status === "rejected") {
            try {
                sendKYCEmail(
                    updatedCustomer.email, 
                    status, 
                    updatedCustomer.customerName, 
                    rejectionReason
                );
            } catch (emailError) {
                console.error("Async Email Dispatch Failure:", emailError);
            }
        }

        return NextResponse.json(updatedCustomer);
    } catch (error: any) {
        console.error("PATCH Error:", error);
        return NextResponse.json({ message: "Failed to update customer status." }, { status: 500 });
    }
}