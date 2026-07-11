"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, Clock, User, Activity, FileText, AlertTriangle } from "lucide-react";

// Définition stricte de la forme d'un Log tel que renvoyé par Prisma
interface AuditLog {
    id: string;
    action: string;
    details: string;
    timestamp: string;
    requestId: string | null;
    agent: {
        fullName: string;
        email: string;
        role: string;
    } | null;
}

export default function AuditSetting() {
    const { data: session } = useSession();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 🛡️ VERROU FRONTEND : Seul le COMPANY_ADMIN a le droit d'être ici
    const isAdmin = (session?.user as any)?.role === "COMPANY_ADMIN";

    useEffect(() => {
        if (isAdmin) {
            fetchLogs();
        } else {
            setIsLoading(false);
        }
    }, [isAdmin]);

    const fetchLogs = async () => {
        try {
            const res = await fetch("/api/settings/audit?limit=100");
            if (!res.ok) throw new Error("Failed to load secure audit logs");
            const data = await res.json();
            setLogs(data.logs);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Outil pour mettre en couleur les actions selon leur criticité
    const getActionBadge = (action: string) => {
        if (action.includes("FAILED") || action.includes("REJECTED") || action.includes("FLAGGED")) {
            return <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-sm uppercase tracking-wider">{action}</span>;
        }
        if (action.includes("SUCCESS") || action.includes("APPROVED")) {
            return <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-sm uppercase tracking-wider">{action}</span>;
        }
        if (action.includes("CREATED") || action.includes("UPDATED")) {
            return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-sm uppercase tracking-wider">{action}</span>;
        }
        return <span className="px-2.5 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded-sm uppercase tracking-wider">{action}</span>;
    };

    if (!isAdmin && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-10 text-center gap-4">
                <ShieldAlert className="w-16 h-16 text-red-500" />
                <h2 className="text-2xl font-bold text-gray-900">Clearance Level Insufficient</h2>
                <p className="text-sm text-gray-500 max-w-md">The Unified Audit Trail is restricted to Organization Administrators (SOC2 Compliance). Your current role does not grant access to this registry.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full p-6 md:p-8 bg-gray-50 overflow-y-auto">
            <div className="flex flex-col mb-8 gap-2">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <ShieldAlert className="w-8 h-8 text-blue-700" />
                    Unified Audit Trail
                </h1>
                <p className="text-sm text-gray-500 max-w-3xl">
                    Immutable security registry. All critical actions performed by agents within your organization are securely logged here for compliance and auditing purposes.
                </p>
            </div>

            <div className="flex flex-col w-full bg-white rounded-sm border border-gray-300 shadow-sm overflow-hidden">
                <div className="bg-gray-100 border-b border-gray-300 px-6 py-3 flex flex-row items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-700">Live System Registry</h3>
                    <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" /> Latest 100 events
                    </span>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
                        <p className="text-sm font-medium">Decrypting secure logs...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-600">
                        <AlertTriangle className="w-8 h-8" />
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                        <p className="text-sm font-medium">No audit logs recorded yet.</p>
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                    <th className="px-6 py-4 whitespace-nowrap">Timestamp</th>
                                    <th className="px-6 py-4 whitespace-nowrap">Agent Identity</th>
                                    <th className="px-6 py-4 whitespace-nowrap">Action Type</th>
                                    <th className="px-6 py-4">Security Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors text-sm">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            {new Date(log.timestamp).toLocaleString('en-GB', { 
                                                day: '2-digit', month: 'short', year: 'numeric', 
                                                hour: '2-digit', minute: '2-digit', second: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {log.agent ? (
                                                <div className="flex items-center gap-2">
                                                    <User className="w-4 h-4 text-gray-400" />
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-900">{log.agent.fullName}</span>
                                                        <span className="text-[10px] text-gray-500">{log.agent.email}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-500 italic flex items-center gap-1.5"><Activity className="w-4 h-4" /> System Action</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getActionBadge(log.action)}
                                        </td>
                                        <td className="px-6 py-4 text-gray-700">
                                            <div className="flex flex-col gap-1">
                                                <span>{log.details}</span>
                                                {log.requestId && (
                                                    <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1">
                                                        <FileText className="w-3 h-3" /> KYC Ref: {log.requestId}
                                                    </span>
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
        </div>
    );
}