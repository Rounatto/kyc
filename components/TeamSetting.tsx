"use client";

// ============================================================================
// 🧑‍🤝‍🧑 ONGLET SETTINGS — GESTION D'ÉQUIPE (COMPANY_ADMIN uniquement)
// ============================================================================
// Miroir frontend de api/settings/team. Le formulaire d'invitation ne demande
// QUE nom + email ("Zéro-Knowledge : plus de mot de passe" — l'admin ne
// choisit jamais le mot de passe d'un agent, c'est ce dernier qui le fait via
// le lien d'activation reçu par email). La colonne "Security (2FA)" affiche
// "Vulnerable" en rouge pour tout agent sans 2FA active — un signal visuel
// utile pour l'admin, dérivé de `totpEnabled` renvoyé par l'API.
//
// 🆕 L'API ne renvoie PLUS `invitationToken` (un token vaut un mot de passe
// temporaire : l'exposer au navigateur le rendait visible dans les outils
// réseau, les logs de proxy et le cache). Elle renvoie à la place deux
// booléens calculés côté serveur — `invitationPending` et `invitationExpired` —
// qui donnent l'INFORMATION sans le SECRET.
//
// 🆕 Bouton "Resend invitation" ajouté : un agent qui perdait son email ou dont
// le lien expirait (24 h) était dans une impasse. L'admin devait supprimer le
// compte et le recréer, ce qui effaçait la trace de la première invitation dans
// la piste d'audit et changeait l'identifiant de l'agent.
import { useState, useEffect } from "react";
import { Users, UserPlus, Trash2, ShieldCheck, ShieldAlert, Loader2, Mail, User as UserIcon, Send, Clock, AlertTriangle } from "lucide-react";

interface TeamMember {
    id: string;
    fullName: string;
    email: string;
    role: string;
    createdAt: string;
    totpEnabled: boolean;
    // 🆕 L'agent n'a pas encore choisi son mot de passe (déduit côté serveur de
    // `password === null`, plus fiable que la présence d'un token — lequel peut
    // avoir été consommé ou simplement expiré).
    invitationPending?: boolean;
    // 🆕 Son lien d'activation a dépassé les 24 h : il ne peut plus s'en servir,
    // l'admin doit lui en renvoyer un.
    invitationExpired?: boolean;
}

export default function TeamSetting() {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // États du formulaire (Zéro-Knowledge : plus de mot de passe)
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // 🆕 Identifiant de l'agent dont le renvoi est en cours.
    // 💡 On stocke l'ID plutôt qu'un simple booléen : ça permet de n'afficher le
    // spinner que sur LA ligne concernée. Un booléen global ferait tourner tous
    // les boutons de la liste en même temps.
    const [resendingId, setResendingId] = useState<string | null>(null);

    // 🆕 Message affiché au-dessus du tableau (succès ou échec d'un renvoi).
    // Distinct de `statusMessage`, qui appartient à la modale d'invitation :
    // les deux peuvent être visibles simultanément sans se marcher dessus.
    const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        fetchTeam();
    }, []);

    const fetchTeam = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/settings/team");
            if (res.ok) {
                const data = await res.json();
                setMembers(data.members || []);
            }
        } catch (error) {
            console.error("Failed to fetch team:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusMessage(null);
        setIsSubmitting(true);

        try {
            const res = await fetch("/api/settings/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName, email }), // 💡 On n'envoie que le nom et l'email
            });

            const data = await res.json();

            // 🆕 Le rate limiting (10 invitations/heure) doit être distingué d'un
            // vrai échec. Sans ce cas, l'admin lirait un message générique et
            // croirait à un bug, alors qu'il lui suffit d'attendre. Le serveur
            // renvoie déjà un message contenant le délai exact.
            if (res.status === 429) {
                throw new Error(data.error || "Too many invitations sent. Please wait before trying again.");
            }

            if (!res.ok) throw new Error(data.error || "Failed to create agent");

            setStatusMessage({ type: "success", text: "Secure invitation link sent to agent's email." });
            setMembers([...members, data.member]);
            
            // Reset form
            setFullName("");
            setEmail("");
            
            setTimeout(() => {
                setIsModalOpen(false);
                setStatusMessage(null);
            }, 2500);

        } catch (error: any) {
            setStatusMessage({ type: "error", text: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    // ========================================================================
    // 🆕 RENVOI D'UNE INVITATION
    // ========================================================================
    // Appelle PATCH /api/settings/team, qui génère un token NEUF (l'ancien
    // devient caduc) et renvoie l'email.
    //
    // 💡 On ne recharge PAS toute la liste après un renvoi : rien n'a changé
    // dans l'affichage (l'agent reste "en attente"), seule la date d'expiration
    // du token a bougé côté serveur. On met simplement à jour localement le
    // drapeau `invitationExpired`, puisqu'un renvoi remet le compteur de 24 h à
    // zéro — le badge rouge "Expired" doit redevenir orange "Pending".
    const handleResendInvite = async (member: TeamMember) => {
        setResendingId(member.id);
        setActionMessage(null);

        try {
            const res = await fetch("/api/settings/team", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: member.id }),
            });

            const data = await res.json();

            if (res.status === 429) {
                throw new Error(data.error || "Too many invitations sent. Please wait before trying again.");
            }

            if (!res.ok) throw new Error(data.error || "Failed to resend the invitation.");

            setActionMessage({
                type: "success",
                text: `A new activation link has been sent to ${member.email}.`,
            });

            // Le nouveau lien est valable 24 h : l'agent n'est plus "expiré".
            setMembers((prev) =>
                prev.map((m) =>
                    m.id === member.id ? { ...m, invitationExpired: false } : m
                )
            );
        } catch (error: any) {
            setActionMessage({ type: "error", text: error.message });
        } finally {
            setResendingId(null);
        }
    };

    const handleRevokeAgent = async (userId: string) => {
        if (!confirm("Are you sure you want to permanently revoke this agent's access? This action is irreversible.")) return;

        try {
            const res = await fetch("/api/settings/team", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });

            if (res.ok) {
                setMembers(members.filter((m) => m.id !== userId));
            } else {
                const data = await res.json();
                alert(data.error || "Failed to revoke agent.");
            }
        } catch (error) {
            console.error("Revocation failed:", error);
        }
    };

    // 🆕 Compteur d'invitations en attente, affiché dans l'en-tête du tableau.
    // 💡 C'est l'information que l'admin cherche en premier quand il revient sur
    // cette page : "qui n'a pas encore activé son compte ?".
    const pendingCount = members.filter((m) => m.invitationPending).length;

    return (
        <div className="flex flex-col w-full h-full p-6 md:p-8 bg-gray-50 overflow-y-auto relative">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <Users className="w-8 h-8 text-blue-700" />
                        Team Management
                    </h1>
                    <p className="text-sm text-gray-500 max-w-2xl">
                        Manage your compliance team. Add agents to review KYC pipelines and revoke access when necessary.
                    </p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center gap-2 bg-blue-700 text-white px-5 py-2.5 rounded-sm font-bold text-sm hover:bg-blue-800 transition-colors shadow-sm shrink-0"
                >
                    <UserPlus className="w-4 h-4" /> Add New Agent
                </button>
            </div>

            {/* 🆕 Retour visuel des actions de renvoi, avec possibilité de fermer.
                Placé au-dessus du tableau plutôt que dans une alerte native
                (`alert()`), qui bloque l'interface et coupe la lecture. */}
            {actionMessage && (
                <div className={`mb-4 px-4 py-3 rounded-sm text-sm font-semibold border flex items-start justify-between gap-4 ${
                    actionMessage.type === "success"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                }`}>
                    <span>{actionMessage.text}</span>
                    <button
                        onClick={() => setActionMessage(null)}
                        className="text-lg leading-none opacity-60 hover:opacity-100 shrink-0"
                        aria-label="Dismiss message"
                    >
                        &times;
                    </button>
                </div>
            )}

            <div className="flex flex-col w-full bg-white rounded-sm border border-gray-300 shadow-sm overflow-hidden">
                <div className="bg-gray-100 border-b border-gray-300 px-6 py-3 flex flex-row items-center justify-between">
                    {/* 🆕 "Active Personnel" était trompeur : la liste contient
                        aussi des agents qui n'ont jamais activé leur compte. */}
                    <h3 className="text-sm font-bold text-gray-700">Team Members</h3>
                    <span className="text-xs font-semibold text-gray-500">
                        {members.length} Total Member(s)
                        {pendingCount > 0 && (
                            <span className="text-amber-600"> · {pendingCount} pending</span>
                        )}
                    </span>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center py-20 text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
                    </div>
                ) : members.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                        <p className="text-sm font-medium">No team members found.</p>
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                    <th className="px-6 py-4 whitespace-nowrap">Identity</th>
                                    <th className="px-6 py-4 whitespace-nowrap">Role</th>
                                    <th className="px-6 py-4 whitespace-nowrap">Security (2FA)</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {members.map((member) => (
                                    <tr key={member.id} className="hover:bg-blue-50/30 transition-colors text-sm">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-bold text-gray-900">{member.fullName}</span>
                                                <span className="text-xs text-gray-500">{member.email}</span>

                                                {/* 🆕 BADGE DE STATUT D'INVITATION.
                                                    Placé ici plutôt que dans une 5e colonne : le tableau
                                                    en a déjà 4, et une de plus le rendrait inconfortable
                                                    sur écran moyen. Sous l'email, l'information reste
                                                    immédiatement lisible.
                                                    💡 Deux niveaux distincts, car ils appellent des
                                                    actions différentes : "Pending" = on attend l'agent,
                                                    "Expired" = l'admin DOIT agir, son lien est mort. */}
                                                {member.invitationExpired ? (
                                                    <span className="flex items-center gap-1 w-max px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-sm border border-red-200">
                                                        <AlertTriangle className="w-3 h-3" /> INVITATION EXPIRED
                                                    </span>
                                                ) : member.invitationPending ? (
                                                    <span className="flex items-center gap-1 w-max px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-sm border border-amber-200">
                                                        <Clock className="w-3 h-3" /> PENDING ACTIVATION
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {member.role === "COMPANY_ADMIN" ? (
                                                <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-sm border border-purple-200">ADMINISTRATOR</span>
                                            ) : (
                                                <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-sm border border-blue-200">KYC AGENT</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {/* 🆕 "Vulnerable" n'a de sens que pour un compte ACTIF.
                                                Afficher une alerte 2FA rouge sur un agent qui n'a même
                                                pas encore de mot de passe est trompeur : il ne peut
                                                évidemment pas avoir configuré sa 2FA. On affiche donc
                                                un état neutre tant que le compte n'est pas activé. */}
                                            {member.invitationPending ? (
                                                <span className="text-xs text-gray-400 font-medium">—</span>
                                            ) : member.totpEnabled ? (
                                                <span className="flex items-center gap-1.5 text-green-600 font-semibold text-xs"><ShieldCheck className="w-4 h-4"/> Enabled</span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-red-500 font-semibold text-xs"><ShieldAlert className="w-4 h-4"/> Vulnerable</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {/* 🆕 BOUTON DE RENVOI — visible uniquement si le compte
                                                    n'est pas encore activé. Le serveur refuse de toute
                                                    façon un renvoi sur un compte actif (générer un lien
                                                    d'activation valide sur le compte d'un agent en
                                                    exercice permettrait d'y accéder à sa place), mais
                                                    autant ne pas proposer un bouton voué à échouer. */}
                                                {member.invitationPending && (
                                                    <button
                                                        onClick={() => handleResendInvite(member)}
                                                        disabled={resendingId === member.id}
                                                        className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-2 rounded-sm transition-colors border border-blue-100 disabled:opacity-50"
                                                        title="Resend activation link"
                                                        aria-label="Resend activation link"
                                                    >
                                                        {resendingId === member.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Send className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                )}

                                                {member.role !== "COMPANY_ADMIN" && (
                                                    <button 
                                                        onClick={() => handleRevokeAgent(member.id)}
                                                        className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-sm transition-colors border border-red-100"
                                                        title="Revoke Access"
                                                        aria-label="Revoke access"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL D'INVITATION SÉCURISÉE */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-md shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-200">
                        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-900">Provision New Agent</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700 font-bold text-xl leading-none">&times;</button>
                        </div>
                        
                        <form onSubmit={handleCreateAgent} className="p-6 flex flex-col gap-5">
                            {statusMessage && (
                                <div className={`p-3 rounded-sm text-xs font-bold border ${statusMessage.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                                    {statusMessage.text}
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-700">Agent Full Name</label>
                                <div className="flex items-center gap-2 border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 bg-white">
                                    <UserIcon className="w-4 h-4 text-gray-400" />
                                    <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" className="w-full outline-none text-sm" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-700">Corporate Email</label>
                                <div className="flex items-center gap-2 border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 bg-white">
                                    <Mail className="w-4 h-4 text-gray-400" />
                                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane.doe@company.com" className="w-full outline-none text-sm" />
                                </div>
                                {/* 🆕 Mention du délai : l'admin doit savoir que le lien
                                    n'est pas éternel, et qu'un bouton de renvoi existe. */}
                                <p className="text-[10px] text-gray-500 mt-1">
                                    A secure activation link will be sent to this address. It expires after 24 hours — you can resend it from the list at any time.
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-sm transition-colors">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="flex justify-center items-center px-5 py-2 bg-blue-700 text-white text-sm font-bold rounded-sm hover:bg-blue-800 transition-colors min-w-[150px] disabled:opacity-50">
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Invitation Link"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}