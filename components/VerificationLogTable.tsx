"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Eye, Copy, Mail, Flag, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";

interface VerificationLogTableProps {
    data: any[];
    currentPage: number;
    totalPages: number;
    totalItems: number;
    currentLimit: number;
    onNextPage: () => void;
    onPrevPage: () => void;
    onLimitChange: (limit: number) => void;
}

export default function VerificationLogTable({
    data,
    currentPage,
    totalPages,
    totalItems,
    currentLimit,
    onNextPage,
    onPrevPage,
    onLimitChange
}: VerificationLogTableProps) {
    const router = useRouter();
    
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleCopyId = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); 
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleMailTo = (e: React.MouseEvent, email: string) => {
        e.stopPropagation();
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${email}`, '_blank');
        setOpenMenuId(null);
    };

    const toggleMenu = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setOpenMenuId(openMenuId === id ? null : id);
    };

    const handleFlagAudit = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setOpenMenuId(null);

        const flagPromise = new Promise(async (resolve, reject) => {
            try {
                const res = await fetch(`/api/customers/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "FLAG_AUDIT" })
                });
                if (res.ok) resolve("Success");
                else reject("Failure");
            } catch (error) {
                reject("Network Error");
            }
        });

        toast.promise(flagPromise, {
            loading: "Flagging profile for security audit...",
            success: "Profile successfully flagged! Audit trail updated.",
            error: "Failed to flag profile. Please try again."
        });
    };

    return (
        <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white">
                <h3 className="font-bold text-gray-900 text-lg">Verification Log</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>Show</span>
                    <select 
                        value={currentLimit} 
                        onChange={(e) => onLimitChange(Number(e.target.value))}
                        className="border border-gray-300 rounded-md px-2 py-1 outline-none focus:border-blue-500 cursor-pointer"
                    >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                    </select>
                    <span>rows</span>
                </div>
            </div>

            <div className="overflow-x-auto min-h-[350px]" ref={menuRef}>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold">
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">AI Risk Level</th>
                            <th className="px-6 py-4">Score</th>
                            <th className="px-6 py-4">Submitted At</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.length > 0 ? (
                            data.map((item) => (
                                <tr 
                                    key={item.id} 
                                    onClick={() => router.push(`/dashboard/customers/${item.id}`)}
                                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                                                {item.Avatar}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900 text-sm">{item.Nom}</span>
                                                <span className="text-xs text-gray-500">{item.Email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                                            ${item.Status === 'verified' ? 'bg-green-100 text-green-700' : 
                                              item.Status === 'rejected' ? 'bg-red-100 text-red-700' : 
                                              'bg-yellow-100 text-yellow-700'}`}
                                        >
                                            {item.Status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold
                                            ${item.RiskLevel === 'Low' ? 'text-green-600' : 
                                              item.RiskLevel === 'High' ? 'text-red-600' : 
                                              'text-yellow-600'}`}
                                        >
                                            <span className={`w-2 h-2 rounded-full 
                                                ${item.RiskLevel === 'Low' ? 'bg-green-500' : 
                                                  item.RiskLevel === 'High' ? 'bg-red-500' : 
                                                  'bg-yellow-500'}`}
                                            ></span>
                                            {item.RiskLevel} Risk
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                        {/* 💡 CORRECTION DES COULEURS : >= 50 Rouge, >= 20 Jaune, < 20 Vert */}
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold
                                            ${parseInt(item.Score) >= 50 ? 'text-red-600' : 
                                              parseInt(item.Score) >= 20 ? 'text-yellow-600' : 
                                              'text-green-600'}`}
                                        >
                                            {item.Score}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                        {item.DateAdded}
                                    </td>
                                    <td className="px-6 py-4 text-right relative">
                                        <button 
                                            onClick={(e) => toggleMenu(e, item.id)}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                        >
                                            <MoreVertical className="w-5 h-5" />
                                        </button>

                                        {openMenuId === item.id && (
                                            <div className="absolute right-8 top-10 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2 flex flex-col text-left overflow-hidden">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/customers/${item.id}`); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                >
                                                    <Eye className="w-4 h-4 text-gray-400" /> Review Profile
                                                </button>
                                                
                                                <button 
                                                    onClick={(e) => handleCopyId(e, item.id)}
                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                >
                                                    {copiedId === item.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                                                    {copiedId === item.id ? "ID Copied!" : "Copy Case ID"}
                                                </button>

                                                <button 
                                                    onClick={(e) => handleMailTo(e, item.Email)}
                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                >
                                                    <Mail className="w-4 h-4 text-gray-400" /> Contact Applicant
                                                </button>

                                                <div className="h-[1px] bg-gray-100 my-1 w-full"></div>

                                                <button 
                                                    onClick={(e) => handleFlagAudit(e, item.id)}
                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium cursor-pointer"
                                                >
                                                    <Flag className="w-4 h-4" /> Flag for Audit
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium">
                                    No records found matching your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between mt-auto">
                <p className="text-sm text-gray-500 font-medium">
                    Showing <span className="font-bold text-gray-900">{data.length === 0 ? 0 : (currentPage - 1) * currentLimit + 1}</span> to <span className="font-bold text-gray-900">{Math.min(currentPage * currentLimit, totalItems)}</span> of <span className="font-bold text-gray-900">{totalItems}</span> entries
                </p>
                <div className="flex gap-2">
                    <button 
                        onClick={onPrevPage} 
                        disabled={currentPage === 1}
                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                    <button 
                        onClick={onNextPage} 
                        disabled={currentPage >= totalPages || totalPages === 0}
                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white cursor-pointer"
                    >
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                    </button>
                </div>
            </div>
        </div>
    );
}