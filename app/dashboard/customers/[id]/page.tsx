"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react"; 
import { useRouter } from "next/navigation";
import Image from "next/image"; 
import { ArrowLeft, Loader2, Check, X, FileText, ShieldAlert, User, Clock, History, Maximize2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";

export default function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const customerId = resolvedParams.id;
    
    const { data: session } = useSession(); 
    const router = useRouter();

    const [customer, setCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // 💡 NOUVEAU : États pour le "Verification Studio" (Modal de comparaison et Zoom)
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [idZoom, setIdZoom] = useState(1);
    const [selfieZoom, setSelfieZoom] = useState(1);

    useEffect(() => {
        async function loadCustomer() {
            try {
                const res = await fetch(`/api/customers/${customerId}`);
                if (res.ok) setCustomer(await res.json());
            } catch (err) { 
                console.error("Loading error"); 
            } finally { 
                setLoading(false); 
            }
        }
        loadCustomer();
    }, [customerId]);

    const handleDecision = async (newStatus: "verified" | "rejected") => {
        setActionLoading(newStatus);
        try {
            const res = await fetch(`/api/customers/${customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    status: newStatus,
                    agentId: (session?.user as any)?.id 
                }),
            });
            
            if (res.ok) {
                const updatedCustomer = await res.json();
                setCustomer(updatedCustomer);
            }
        } finally { 
            setActionLoading(null); 
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /></div>;
    if (!customer) return <div className="min-h-screen flex items-center justify-center text-gray-500">Customer not found.</div>;

    const riskColors = {
        High: "bg-red-50 border-red-200 text-red-700",
        Medium: "bg-yellow-50 border-yellow-200 text-yellow-700",
        Low: "bg-green-50 border-green-200 text-green-700"
    };
    const currentRiskColor = riskColors[customer.riskLevel as keyof typeof riskColors] || riskColors.Medium;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <Header />
            <div className="max-w-6xl mx-auto px-4 py-8 relative">
                <Link href="/dashboard/customers" className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Directory
                </Link>

                <div className="flex flex-wrap items-start gap-6">
                    
                    {/* Colonne Gauche (Données) */}
                    <div className="flex-[2_1_600px] flex flex-col gap-6">
                        
                        {/* Section Identité */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-6">
                            <div className="flex flex-wrap justify-between items-start gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold shrink-0 shadow-inner">
                                        {customer.customerName?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <h1 className="text-2xl font-bold text-gray-900">{customer.customerName}</h1>
                                        <p className="text-sm text-gray-500 font-mono break-all mt-0.5">ID: {customer.id}</p>
                                    </div>
                                </div>
                                <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${
                                    customer.status === "verified" ? "bg-green-100 text-green-800 border border-green-200" :
                                    customer.status === "rejected" ? "bg-red-100 text-red-800 border border-red-200" : "bg-yellow-100 text-yellow-800 border border-yellow-200"
                                }`}>
                                    {customer.status}
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-x-12 gap-y-6 pt-5 border-t border-gray-100">
                                <div className="flex-1 min-w-[120px]"><p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Document ID</p><p className="font-bold text-gray-900 text-lg">{customer.cin}</p></div>
                                <div className="flex-1 min-w-[150px]"><p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Email</p><p className="font-medium text-gray-800 break-all">{customer.email}</p></div>
                                <div className="flex-1 min-w-[120px]"><p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Nationality</p><p className="font-medium text-gray-800">{customer.nationality || "N/A"}</p></div>
                                <div className="flex-1 min-w-[120px]"><p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Phone</p><p className="font-medium text-gray-800">{customer.phoneNumber || "N/A"}</p></div>
                            </div>
                        </div>

                        {/* SECTION DOCUMENTS */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-5">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-gray-800"><FileText className="w-4 h-4 text-blue-600" /> Provided Documents</h3>
                                {/* 💡 Bouton pour ouvrir le Verification Studio */}
                                {(customer.idCardUrl || customer.selfieUrl) && (
                                    <button onClick={() => setIsViewerOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                                        <Maximize2 className="w-3.5 h-3.5" /> Compare & Verify
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-5">
                                {/* Aperçu Carte d'identité */}
                                <div className="flex-1 flex flex-col gap-2">
                                    <p className="text-xs font-bold uppercase text-gray-500 pl-1">Front ID Document</p>
                                    <div className="border border-gray-200 rounded-xl bg-gray-50 h-48 relative overflow-hidden group">
                                        {customer.idCardUrl ? (
                                            <>
                                                <Image src={customer.idCardUrl} alt="ID Card" fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized />
                                                <button onClick={() => setIsViewerOpen(true)} className="absolute inset-0 w-full h-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                    <div className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
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

                                {/* Aperçu Selfie */}
                                <div className="flex-1 flex flex-col gap-2">
                                    <p className="text-xs font-bold uppercase text-gray-500 pl-1">Biometric Selfie</p>
                                    <div className="border border-gray-200 rounded-xl bg-gray-50 h-48 relative overflow-hidden group">
                                        {customer.selfieUrl ? (
                                            <>
                                                <Image src={customer.selfieUrl} alt="Selfie" fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized />
                                                <button onClick={() => setIsViewerOpen(true)} className="absolute inset-0 w-full h-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                    <div className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
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

                        {/* Piste d'Audit */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-gray-800"><History className="w-4 h-4 text-blue-600" /> Audit Trail</h3>
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
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold text-gray-900">{log.action}</p>
                                                    <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> {new Date(log.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1">{log.details}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg border border-gray-100">No audit logs available for this profile.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Colonne Droite (Décision & IA) */}
                    <div className="flex-[1_1_300px] flex flex-col gap-6">
                        <div className={`p-6 rounded-2xl border shadow-sm flex flex-col transition-colors ${currentRiskColor}`}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> AI Risk Analysis</h3>
                            <div className="flex items-baseline gap-1 mb-1">
                                <span className="text-6xl font-black tracking-tighter">{customer.score}</span>
                                <span className="text-2xl opacity-50 font-bold">/100</span>
                            </div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-full bg-current opacity-70 animate-pulse"></span>
                                <p className="text-xs font-bold uppercase tracking-widest opacity-80">{customer.riskLevel} Risk Detected</p>
                            </div>
                            <div className="bg-white/60 rounded-xl p-4 border border-black/5 shadow-inner">
                                <p className="text-sm font-medium leading-relaxed opacity-90">{customer.aiRationale}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-5 sticky top-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800">Compliance Decision</h3>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => handleDecision("verified")} disabled={actionLoading !== null || customer.status === "verified"} className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-transparent hover:border-green-800">
                                    {actionLoading === "verified" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Approve Profile
                                </button>
                                <button onClick={() => handleDecision("rejected")} disabled={actionLoading !== null || customer.status === "rejected"} className="w-full bg-white border-2 border-red-100 text-red-600 font-bold py-3.5 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                                    {actionLoading === "rejected" ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />} Reject Profile
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 text-center px-4 leading-tight">By clicking Approve or Reject, your identity will be permanently recorded in the immutable audit trail.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 💡 LE VERIFICATION STUDIO (MODAL PLEIN ÉCRAN) */}
            {isViewerOpen && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col backdrop-blur-md">
                    {/* Header du Studio */}
                    <div className="h-16 border-b border-white/10 flex justify-between items-center px-6 shrink-0">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="w-5 h-5 text-blue-400" />
                            <h2 className="font-bold tracking-widest uppercase text-sm text-white">Verification Studio : Face Matching</h2>
                        </div>
                        <button 
                            onClick={() => { setIsViewerOpen(false); setIdZoom(1); setSelfieZoom(1); }} 
                            className="p-2 text-gray-400 hover:text-white hover:bg-red-500 rounded-full transition-all"
                            title="Close Studio"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Zone de comparaison (Flexbox) */}
                    <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
                        
                        {/* Panneau Gauche : Document d'Identité */}
                        <div className="flex-1 bg-gray-900 rounded-2xl border border-white/10 flex flex-col relative overflow-hidden">
                            {/* Barre d'outils de Zoom */}
                            <div className="absolute top-4 left-4 z-10 bg-black/70 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center gap-4 shadow-xl">
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Front ID</span>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setIdZoom(z => Math.max(0.5, z - 0.5))} className="text-gray-400 hover:text-white"><ZoomOut className="w-4 h-4"/></button>
                                <span className="text-xs font-mono text-white w-8 text-center">{Math.round(idZoom * 100)}%</span>
                                <button onClick={() => setIdZoom(z => Math.min(4, z + 0.5))} className="text-gray-400 hover:text-white"><ZoomIn className="w-4 h-4"/></button>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setIdZoom(1)} className="text-gray-400 hover:text-white" title="Reset Zoom"><RotateCcw className="w-4 h-4"/></button>
                            </div>
                            
                            {/* Zone Image avec défilement si zoomée */}
                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                {customer.idCardUrl ? (
                                    <img 
                                        src={customer.idCardUrl} 
                                        alt="ID Document" 
                                        className="max-w-full max-h-full object-contain transition-transform duration-200" 
                                        style={{ transform: `scale(${idZoom})`, transformOrigin: 'center' }} 
                                    />
                                ) : (
                                    <p className="text-gray-600 font-medium">No document provided</p>
                                )}
                            </div>
                        </div>

                        {/* Panneau Droit : Selfie */}
                        <div className="flex-1 bg-gray-900 rounded-2xl border border-white/10 flex flex-col relative overflow-hidden">
                            {/* Barre d'outils de Zoom */}
                            <div className="absolute top-4 left-4 z-10 bg-black/70 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center gap-4 shadow-xl">
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Live Selfie</span>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setSelfieZoom(z => Math.max(0.5, z - 0.5))} className="text-gray-400 hover:text-white"><ZoomOut className="w-4 h-4"/></button>
                                <span className="text-xs font-mono text-white w-8 text-center">{Math.round(selfieZoom * 100)}%</span>
                                <button onClick={() => setSelfieZoom(z => Math.min(4, z + 0.5))} className="text-gray-400 hover:text-white"><ZoomIn className="w-4 h-4"/></button>
                                <div className="w-px h-4 bg-white/20"></div>
                                <button onClick={() => setSelfieZoom(1)} className="text-gray-400 hover:text-white" title="Reset Zoom"><RotateCcw className="w-4 h-4"/></button>
                            </div>
                            
                            {/* Zone Image avec défilement si zoomée */}
                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                {customer.selfieUrl ? (
                                    <img 
                                        src={customer.selfieUrl} 
                                        alt="Selfie" 
                                        className="max-w-full max-h-full object-contain transition-transform duration-200" 
                                        style={{ transform: `scale(${selfieZoom})`, transformOrigin: 'center' }} 
                                    />
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