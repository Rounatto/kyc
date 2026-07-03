"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react"; 
import { useRouter } from "next/navigation";
import Image from "next/image"; 
import { ArrowLeft, Loader2, Check, X, FileText, ShieldAlert, User, Clock, History, Maximize2, ZoomIn, ZoomOut, RotateCcw, AlertCircle, ShieldCheck, Mail, Phone, Calendar, Flag, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";
import { toast } from "sonner";

// 💡 Raisons de refus professionnelles
const PREDEFINED_REASONS = [
    "The provided ID document is blurry, pixelated or unreadable.",
    "The edges of the document are cropped or cut off.",
    "The face on the identification document does not match the biometric selfie.",
    "The identification document has expired.",
    "The name on the document does not match the registered profile name."
];

export default function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const customerId = resolvedParams.id;
    
    const { data: session } = useSession(); 
    const router = useRouter();

    const [customer, setCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // États pour le "Verification Studio"
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [idZoom, setIdZoom] = useState(1);
    const [selfieZoom, setSelfieZoom] = useState(1);

    // États pour la Modal de Rejet
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [selectedReason, setSelectedReason] = useState(PREDEFINED_REASONS[0]);
    const [customReason, setCustomReason] = useState("");
    const [isCustom, setIsCustom] = useState(false);

    useEffect(() => {
        async function loadCustomer() {
            try {
                const res = await fetch(`/api/customers/${customerId}`);
                if (res.ok) setCustomer(await res.json());
                else router.push("/dashboard/customers");
            } catch (err) { 
                console.error("Loading error", err); 
            } finally { 
                setLoading(false); 
            }
        }
        loadCustomer();
    }, [customerId, router]);

    const handleDecision = async (newStatus: "verified" | "rejected", reasonText?: string) => {
        setActionLoading(newStatus);
        
        if (newStatus === "rejected") {
            setIsRejectModalOpen(false);
        }

        const actionPromise = new Promise(async (resolve, reject) => {
            try {
                const res = await fetch(`/api/customers/${customerId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        status: newStatus,
                        agentId: session?.user?.id || null, 
                        rejectionReason: reasonText
                    }),
                });
                
                if (res.ok) {
                    const updatedCustomer = await res.json();
                    setCustomer(updatedCustomer);
                    resolve(updatedCustomer);
                } else {
                    const errData = await res.json();
                    reject(errData.message || "Failed to update profile status.");
                }
            } catch (err) {
                reject("Network error. Please try again.");
            } finally {
                setActionLoading(null);
            }
        });

        toast.promise(actionPromise, {
            loading: `Updating compliance record to ${newStatus}...`,
            success: () => `Profile successfully ${newStatus === "verified" ? "approved" : "rejected"}!`,
            error: (err) => `${err}`,
        });
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center flex-col gap-4"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /><p className="text-gray-500 font-medium">Loading compliance file...</p></div>;
    if (!customer) return <div className="min-h-screen flex items-center justify-center text-gray-500">Customer not found.</div>;

    const riskColors = {
        High: "bg-red-50 border-red-200 text-red-700",
        Medium: "bg-yellow-50 border-yellow-200 text-yellow-700",
        Low: "bg-green-50 border-green-200 text-green-700"
    };
    const currentRiskColor = riskColors[customer.riskLevel as keyof typeof riskColors] || riskColors.Medium;
    const isHighRisk = customer.riskLevel === "High";
    const isMediumRisk = customer.riskLevel === "Medium";

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <Header />
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                
                {/* BACK BUTTON & EN-TÊTE PAGE */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <Link href="/dashboard/customers" className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium transition-colors w-max">
                        <ArrowLeft className="w-4 h-4" /> Back to Directory
                    </Link>
                </div>

                {/* 💡 LA NOUVELLE GRILLE RESPONSIVE */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* ============================================================ */}
                    {/* COLONNE GAUCHE (DOCUMENTS & METADATA) - Prend 8 colonnes sur 12 */}
                    {/* ============================================================ */}
                    <div className="lg:col-span-8 flex flex-col gap-6">
                        
                        {/* EN-TÊTE PROFIL */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold shrink-0 shadow-inner">
                                    {customer.customerName?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">{customer.customerName}</h1>
                                    <p className="text-sm text-gray-500 font-mono mt-0.5">Case ID: {customer.id}</p>
                                </div>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm border ${
                                customer.status === "verified" ? "bg-green-100 text-green-800 border-green-200" :
                                customer.status === "rejected" ? "bg-red-100 text-red-800 border-red-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"
                            }`}>
                                {customer.status}
                            </span>
                        </div>

                        {/* DOCUMENTS */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-5">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
                                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-gray-800">
                                    <FileText className="w-4 h-4 text-blue-600" /> Provided Documents
                                </h3>
                                {(customer.idCardUrl || customer.selfieUrl) && (
                                    <button onClick={() => setIsViewerOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors cursor-pointer w-full sm:w-auto justify-center">
                                        <Maximize2 className="w-3.5 h-3.5" /> Compare & Verify
                                    </button>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                {/* Front ID */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-bold uppercase text-gray-500 pl-1">Front ID Document</p>
                                    <div className="border border-gray-200 rounded-xl bg-gray-50 h-56 relative overflow-hidden group">
                                        {customer.idCardUrl ? (
                                            <>
                                                <Image src={customer.idCardUrl} alt="ID Card" fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized />
                                                <button onClick={() => setIsViewerOpen(true)} className="absolute inset-0 w-full h-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                    <div className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform shadow-lg">
                                                        <Maximize2 className="w-4 h-4" /> Open Studio
                                                    </div>
                                                </button>
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                <FileText className="w-8 h-8 mb-2 opacity-50" />
                                                <p className="text-xs font-medium">No document</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Selfie */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-bold uppercase text-gray-500 pl-1">Biometric Selfie</p>
                                    <div className="border border-gray-200 rounded-xl bg-gray-50 h-56 relative overflow-hidden group">
                                        {customer.selfieUrl ? (
                                            <>
                                                <Image src={customer.selfieUrl} alt="Selfie" fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized />
                                                <button onClick={() => setIsViewerOpen(true)} className="absolute inset-0 w-full h-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                    <div className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform shadow-lg">
                                                        <Maximize2 className="w-4 h-4" /> Open Studio
                                                    </div>
                                                </button>
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                <User className="w-8 h-8 mb-2 opacity-50" />
                                                <p className="text-xs font-medium">No selfie</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* METADATA */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 mb-6 border-b border-gray-100 pb-3 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-600" /> Applicant Metadata
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <div className="flex items-start gap-3">
                                    <User className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Full Name</p><p className="text-gray-900 font-medium mt-1">{customer.customerName}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <ShieldAlert className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">ID Number (CIN)</p><p className="text-gray-900 font-medium mt-1">{customer.cin}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div className="min-w-0 flex-1"><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Email Address</p><p className="text-gray-900 font-medium truncate mt-1" title={customer.email}>{customer.email}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Date of Birth</p><p className="text-gray-900 font-medium mt-1">{customer.dateOfBirth || "N/A"}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Phone Number</p><p className="text-gray-900 font-medium mt-1">{customer.phoneNumber || "N/A"}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Flag className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Nationality</p><p className="text-gray-900 font-medium mt-1">{customer.nationality || "N/A"}</p></div>
                                </div>
                            </div>
                        </div>

                        {/* AUDIT LOGS */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-gray-800 border-b border-gray-100 pb-3">
                                <History className="w-4 h-4 text-blue-600" /> System Audit Trail
                            </h3>
                            <div className="flex flex-col gap-5 pl-2">
                                {customer.auditLogs && customer.auditLogs.length > 0 ? (
                                    customer.auditLogs.map((log: any, index: number) => (
                                        <div key={log.id} className={`flex gap-5 relative border-l-2 ${index === customer.auditLogs.length - 1 ? 'border-transparent' : 'border-gray-200'} pl-6 pb-2`}>
                                            <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ring-4 ring-white ${
                                                log.action === "CREATED" ? "bg-blue-500" :
                                                log.action === "APPROVED" ? "bg-green-500" :
                                                log.action === "REJECTED" ? "bg-red-500" : "bg-gray-400"
                                            }`}></span>
                                            <div className="flex flex-col">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                                    <p className="text-sm font-bold text-gray-900">{log.action}</p>
                                                    <span className="text-[10px] text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100 flex items-center gap-1 w-max">
                                                        <Clock className="w-3 h-3" /> {new Date(log.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{log.details}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg border border-gray-100">No audit logs available for this profile.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ============================================================ */}
                    {/* COLONNE DROITE (IA & DÉCISIONS) - Prend 4 colonnes sur 12 */}
                    {/* ============================================================ */}
                    <div className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-6">
                        
                        {/* WIDGET : AI SCORE */}
                        <div className={`p-6 rounded-2xl border shadow-sm flex flex-col transition-colors ${currentRiskColor}`}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2">
                                {isHighRisk ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />} AI Risk Analysis
                            </h3>
                            <div className="flex items-baseline gap-1 mb-2">
                                <span className="text-7xl font-black tracking-tighter">{parseInt(customer.score)}</span>
                                <span className="text-2xl opacity-50 font-bold">/100</span>
                            </div>
                            <div className="flex items-center gap-2 mb-6">
                                <span className="w-2 h-2 rounded-full bg-current opacity-70 animate-pulse"></span>
                                <p className="text-xs font-bold uppercase tracking-widest opacity-80">{customer.riskLevel} Risk Detected</p>
                            </div>
                            <div className="bg-white/60 rounded-xl p-5 border border-black/5 shadow-inner">
                                <p className="text-sm font-medium leading-relaxed opacity-90">{customer.aiRationale}</p>
                            </div>
                        </div>

                        {/* WIDGET : DÉCISION AGENT */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 mb-2 border-b border-gray-100 pb-3">Compliance Decision</h3>
                            
                            {customer.status === "pending" ? (
                                <div className="flex flex-col gap-3">
                                    <button 
                                        onClick={() => handleDecision("verified")} 
                                        disabled={actionLoading !== null} 
                                        className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-transparent hover:border-green-800 cursor-pointer"
                                    >
                                        {actionLoading === "verified" ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />} Approve Profile
                                    </button>
                                    <button 
                                        onClick={() => setIsRejectModalOpen(true)} 
                                        disabled={actionLoading !== null} 
                                        className="w-full bg-white border-2 border-red-100 text-red-600 font-bold py-3.5 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                                    >
                                        {actionLoading === "rejected" ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />} Reject Profile
                                    </button>
                                    <p className="text-[10px] text-gray-400 text-center leading-tight mt-2">Decision is permanently recorded in the immutable audit trail.</p>
                                </div>
                            ) : (
                                <div className={`p-4 rounded-xl flex items-center justify-center gap-2 font-bold ${
                                    customer.status === "verified" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                                }`}>
                                    {customer.status === "verified" ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                    Profile {customer.status}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALE DE REJET */}
            {isRejectModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full border border-gray-200 shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-red-600 border-b border-gray-100 pb-3">
                            <AlertCircle className="w-6 h-6" />
                            <h3 className="text-lg font-bold text-gray-900">Specify Rejection Reason</h3>
                        </div>
                        <p className="text-sm text-gray-500">Select the non-compliance marker. This precise text will be sent to the client via an automated email notification.</p>
                        
                        <div className="flex flex-col gap-3 my-2">
                            {PREDEFINED_REASONS.map((reason, idx) => (
                                <label key={idx} className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                                    <input 
                                        type="radio" 
                                        name="rejection_reason" 
                                        checked={!isCustom && selectedReason === reason} 
                                        onChange={() => { setIsCustom(false); setSelectedReason(reason); }} 
                                        className="mt-1 accent-blue-600" 
                                    />
                                    <span className="text-sm text-gray-700 font-medium">{reason}</span>
                                </label>
                            ))}
                            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                                <input 
                                    type="radio" 
                                    name="rejection_reason" 
                                    checked={isCustom} 
                                    onChange={() => setIsCustom(true)} 
                                    className="mt-1 accent-blue-600" 
                                />
                                <span className="text-sm text-gray-700 font-bold">Custom Reason...</span>
                            </label>
                        </div>

                        {isCustom && (
                            <textarea 
                                value={customReason} 
                                onChange={(e) => setCustomReason(e.target.value)} 
                                placeholder="Type the specific regulatory compliance failure reason..." 
                                className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:border-blue-600 h-24 text-gray-800 transition-all resize-none shadow-inner" 
                            />
                        )}

                        <div className="flex gap-3 justify-end border-t border-gray-100 pt-4 mt-2">
                            <button 
                                onClick={() => setIsRejectModalOpen(false)} 
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => handleDecision("rejected", isCustom ? customReason : selectedReason)} 
                                disabled={isCustom && !customReason.trim()} 
                                className="px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                            >
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VERIFICATION STUDIO (MODAL IMAGE) */}
            {isViewerOpen && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col backdrop-blur-md">
                    <div className="h-16 border-b border-white/10 flex justify-between items-center px-6 shrink-0">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="w-5 h-5 text-blue-400" />
                            <h2 className="font-bold tracking-widest uppercase text-sm text-white">Verification Studio : Face Matching</h2>
                        </div>
                        <button onClick={() => { setIsViewerOpen(false); setIdZoom(1); setSelfieZoom(1); }} className="p-2 text-gray-400 hover:text-white hover:bg-red-500 rounded-full transition-all cursor-pointer">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
                        <div className="flex-1 bg-gray-900 rounded-2xl border border-white/10 flex flex-col relative overflow-hidden">
                            <div className="absolute top-4 left-4 z-10 bg-black/70 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center gap-4 shadow-xl">
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Front ID</span>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setIdZoom(z => Math.max(0.5, z - 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomOut className="w-4 h-4"/></button>
                                <span className="text-xs font-mono text-white w-8 text-center">{Math.round(idZoom * 100)}%</span>
                                <button onClick={() => setIdZoom(z => Math.min(4, z + 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomIn className="w-4 h-4"/></button>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setIdZoom(1)} className="text-gray-400 hover:text-white cursor-pointer"><RotateCcw className="w-4 h-4"/></button>
                            </div>
                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                {customer.idCardUrl ? (
                                    <img src={customer.idCardUrl} alt="ID Document" className="max-w-full max-h-full object-contain transition-transform duration-200" style={{ transform: `scale(${idZoom})`, transformOrigin: 'center' }} />
                                ) : (
                                    <p className="text-gray-600 font-medium">No document provided</p>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 bg-gray-900 rounded-2xl border border-white/10 flex flex-col relative overflow-hidden">
                            <div className="absolute top-4 left-4 z-10 bg-black/70 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center gap-4 shadow-xl">
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Live Selfie</span>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setSelfieZoom(z => Math.max(0.5, z - 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomOut className="w-4 h-4"/></button>
                                <span className="text-xs font-mono text-white w-8 text-center">{Math.round(selfieZoom * 100)}%</span>
                                <button onClick={() => setSelfieZoom(z => Math.min(4, z + 0.5))} className="text-gray-400 hover:text-white cursor-pointer"><ZoomIn className="w-4 h-4"/></button>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setSelfieZoom(1)} className="text-gray-400 hover:text-white cursor-pointer"><RotateCcw className="w-4 h-4"/></button>
                            </div>
                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                {customer.selfieUrl ? (
                                    <img src={customer.selfieUrl} alt="Selfie" className="max-w-full max-h-full object-contain transition-transform duration-200" style={{ transform: `scale(${selfieZoom})`, transformOrigin: 'center' }} />
                                ) : (
                                    <p className="text-gray-600 font-medium">No selfie provided</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}