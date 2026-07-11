"use client";

import { useState, useEffect } from "react";
import { Users, UserPlus, Trash2, ShieldCheck, ShieldAlert, Loader2, Mail, Lock, User as UserIcon } from "lucide-react";

interface TeamMember {
    id: string;
    fullName: string;
    email: string;
    role: string;
    createdAt: string;
    totpEnabled: boolean;
}

export default function TeamSetting() {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // États du formulaire
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
                body: JSON.stringify({ fullName, email, password }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create agent");

            setStatusMessage({ type: "success", text: "Agent account successfully created." });
            setMembers([...members, data.member]);
            
            // Reset form
            setFullName("");
            setEmail("");
            setPassword("");
            setTimeout(() => {
                setIsModalOpen(false);
                setStatusMessage(null);
            }, 2000);

        } catch (error: any) {
            setStatusMessage({ type: "error", text: error.message });
        } finally {
            setIsSubmitting(false);
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

            <div className="flex flex-col w-full bg-white rounded-sm border border-gray-300 shadow-sm overflow-hidden">
                <div className="bg-gray-100 border-b border-gray-300 px-6 py-3 flex flex-row items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-700">Active Personnel</h3>
                    <span className="text-xs font-semibold text-gray-500">{members.length} Total Member(s)</span>
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
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900">{member.fullName}</span>
                                                <span className="text-xs text-gray-500">{member.email}</span>
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
                                            {member.totpEnabled ? (
                                                <span className="flex items-center gap-1.5 text-green-600 font-semibold text-xs"><ShieldCheck className="w-4 h-4"/> Enabled</span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-red-500 font-semibold text-xs"><ShieldAlert className="w-4 h-4"/> Vulnerable</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {member.role !== "COMPANY_ADMIN" && (
                                                <button 
                                                    onClick={() => handleRevokeAgent(member.id)}
                                                    className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-sm transition-colors border border-red-100"
                                                    title="Revoke Access"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL D'INVITATION */}
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
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-700">Temporary Password</label>
                                <div className="flex items-center gap-2 border border-gray-300 rounded-sm py-2 px-3 focus-within:border-blue-500 bg-white">
                                    <Lock className="w-4 h-4 text-gray-400" />
                                    <input type="password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 12 characters" className="w-full outline-none text-sm" />
                                </div>
                                <p className="text-[10px] text-gray-500">Provide this to the agent securely. They must change it upon first login.</p>
                            </div>

                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-sm transition-colors">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="flex justify-center items-center px-5 py-2 bg-blue-700 text-white text-sm font-bold rounded-sm hover:bg-blue-800 transition-colors min-w-[120px] disabled:opacity-50">
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Provision Agent"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}