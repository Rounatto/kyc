"use client"

// ============================================================================
// 🏠 DASHBOARD PRINCIPAL — KPIs + GRAPHIQUE 7 JOURS + DERNIERS DOSSIERS
// ============================================================================
// Combine 2 appels API en parallèle au montage : /api/dashboard/stats (KPIs,
// tendances, graphique) et /api/customers (les 10 derniers dossiers, dont on
// affiche 5 en table + jusqu'à 3 en "profils à haut risque"). Le time-range
// choisi dans le <select> ne recharge QUE les stats, pas la table du bas.
//
// ⚠️ DEUX INCOHÉRENCES FRONTEND ⟷ BACKEND TROUVÉES ICI :
//   1. Le <select> propose "1y" (Last Year), mais app/api/dashboard/stats
//      NE RECONNAÎT PAS cette valeur (seulement 7d/30d/90d/all) — elle tombe
//      silencieusement dans le cas par défaut (30 jours). Choisir "Last Year"
//      affiche donc en réalité les 30 derniers jours, sans aucune erreur visible.
//   2. `trends.pendingDelta` est lu ici avec un fallback à 0, mais l'API
//      dashboard/stats ne renvoie JAMAIS ce champ (seulement totalDelta,
//      verifiedDelta, highRiskDelta) — la pastille de tendance sur la carte
//      "Pending Review" affiche donc toujours "0.0%" (icône neutre), jamais
//      une vraie évolution.
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import VerificationTable from "@/components/VerificationTable";
import { Calendar, Download, UserRoundCheck, ClipboardClock, Clock, ShieldCheck, TriangleAlert, AlertCircle, ArrowRight, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Header from "@/components/header";
import NewVerificationButton from "@/components/NewVerificationButton";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
    const router = useRouter();
    const [requestsData, setRequestsData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [highRiskProfiles, setHighRiskProfiles] = useState<any[]>([]);
    
    const [timeRange, setTimeRange] = useState("30d");
    const [stats, setStats] = useState({ total: 0, verified: 0, pending: 0, highRisk: 0 });
    const [trends, setTrends] = useState({ totalDelta: 0, verifiedDelta: 0, pendingDelta: 0, highRiskDelta: 0 });
    const [chartData, setChartData] = useState<any[]>([]);

    useEffect(() => {
        async function fetchDashboardData() {
            setLoading(true);
            try {
                const statsRes = await fetch(`/api/dashboard/stats?range=${timeRange}`);
                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    // 💡 GARDE-FOU : On s'assure que si une donnée manque, on met 0 par défaut
                    setStats({
                        total: statsData.stats?.total || 0,
                        verified: statsData.stats?.verified || 0,
                        pending: statsData.stats?.pending || 0,
                        highRisk: statsData.stats?.highRisk || 0
                    });
                    setTrends({
                        totalDelta: statsData.trends?.totalDelta || 0,
                        verifiedDelta: statsData.trends?.verifiedDelta || 0,
                        pendingDelta: statsData.trends?.pendingDelta || 0, // Fallback de sécurité
                        highRiskDelta: statsData.trends?.highRiskDelta || 0
                    });
                    setChartData(statsData.chartData || []);
                }

                const response = await fetch("/api/customers?limit=10&sort=newest");
                const data = await response.json();

                if (response.ok && data.requests) {
                    const formattedData = data.requests.map((req: any) => {
                        const initials = req.customerName
                            ? req.customerName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                            : "??";

                        let dateFormatted = "Unknown Date";
                        if (req.submittedAt) {
                            const d = new Date(req.submittedAt);
                            if (!isNaN(d.getTime())) {
                                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                dateFormatted = `${months[d.getMonth()]} ${d.getDate()}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                            }
                        }

                        let parsedScore = parseInt(String(req.score).match(/\d+/)?.[0] || "0", 10);

                        return {
                            id: req.id,
                            Avatar: initials,
                            Nom: req.customerName,
                            Email: req.email,
                            Type: req.type,
                            Submitted: dateFormatted, 
                            Status: req.status ? req.status.toLowerCase() : "pending",
                            Score: req.score || "--",
                            rawDate: req.submittedAt,
                            parsedScore
                        };
                    });

                    setRequestsData(formattedData.slice(0, 5));
                    
                    const criticalProfiles = formattedData.filter((req: any) => req.parsedScore >= 50);
                    setHighRiskProfiles(criticalProfiles.slice(0, 3));
                }
            } catch (error) {
                console.error("Error fetching requests:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchDashboardData();
    }, [timeRange]);

    // Génère un CSV/texte 100% côté client à partir des données déjà chargées
    // en state (aucun appel serveur dédié) et déclenche son téléchargement via
    // un lien <a> temporaire. Le préfixe "﻿" (BOM) force Excel à détecter
    // l'UTF-8 correctement plutôt que d'afficher les accents corrompus.
    const handleExportDashboardReport = () => {
        const timestamp = new Date().toLocaleString();
        
        const reportSections = [
            "==================================================",
            "   KYC/AML COMPLIANCE PLATFORM EXECUTIVE REPORT   ",
            `   Generated on: ${timestamp}                     `,
            "==================================================",
            "",
            "1. GLOBAL PLATFORM METRICS (KPIs)",
            `- Total Identity Check Inventions: ${stats.total}`,
            `- Total Verified Profiles: ${stats.verified}`,
            `- Current Active Pending Review Queue: ${stats.pending}`,
            `- Critical High Risk Flagged Alerts: ${stats.highRisk}`,
            "",
            "2. LIVE CRITICAL ANOMALIES DETECTED",
            highRiskProfiles.length > 0 
                ? highRiskProfiles.map(p => `- ALERT: ${p.Nom} (${p.Email}) - AI Risk Score: ${p.Score}/100`).join("\n")
                : "- No critical security anomalies detected in this session.",
            "",
            "3. RECENT PIPELINE ACTIVITY LOG",
            "ID,Customer Name,Email,Procedure Type,Status,AI Score,Date Submitted"
        ];
        
        const tableRows = requestsData.map((req: any) => {
            return [
                req.id,
                `"${req.Nom}"`,
                req.Email,
                req.Type,
                req.Status.toUpperCase(),
                req.Score,
                req.rawDate ? new Date(req.rawDate).toLocaleString() : "N/A"
            ].join(",");
        });

        const finalReportString = "\uFEFF" + [...reportSections, ...tableRows].join("\n");
        const blob = new Blob([finalReportString], { type: "text/plain;charset=utf-8;" });
        const link = document.createElement("a");
        const urlObj = URL.createObjectURL(blob);
        
        link.setAttribute("href", urlObj);
        link.setAttribute("download", `executive_compliance_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Petite pastille +/-X% à côté de chaque KPI. `invertColors` sert pour les
    // métriques où une hausse est MAUVAISE (ex: Risk Alerts en hausse = rouge,
    // pas vert) — sans ce flag, +12% serait affiché en vert par défaut.
    // GARDE-FOU : "value" est recasté en Number avant toFixed() car il peut
    // arriver `undefined`/`NaN` selon la réponse API.
    const TrendIndicator = ({ value = 0, invertColors = false, neutral = false }: { value?: number, invertColors?: boolean, neutral?: boolean }) => {
        const safeValue = Number(value) || 0; 
        const isPositive = safeValue > 0;
        const isZero = safeValue === 0;
        
        let colorClass = "text-gray-500 bg-gray-100";
        if (!isZero) {
            if (neutral) {
                colorClass = "text-orange-700 bg-yellow-300/40"; 
            } else if (invertColors) {
                colorClass = isPositive ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100";
            } else {
                colorClass = isPositive ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100";
            }
        }

        return (
            <div className={`flex justify-center items-center rounded-sm px-2 py-1 text-[10px] font-bold gap-1 ${colorClass}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : isZero ? <Minus className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isPositive ? '+' : ''}{safeValue.toFixed(1)}%
            </div>
        );
    };

    return (
        <div className="w-full">
            <Header />
            <NewVerificationButton mobileOnly />

            <div className="flex flex-col gap-8 mb-8 bg-gray-100 px-8 lg:px-12 mt-8 ">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end bg-gray-100 gap-4 lg:gap-0">
                    <div className="flex flex-col mb-2">
                        <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
                        <p className="text-sm text-gray-500">Real-time status of your compliance network.</p>
                    </div>
                    <div className="flex flex-row gap-3 w-full lg:w-auto">
                        <div className="relative flex-1 lg:flex-none">
                            <select 
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value)}
                                className="w-full lg:w-40 appearance-none flex items-center gap-2 px-10 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer h-12 outline-none shadow-sm"
                            >
                                <option value="30d">Last 30 Days</option>
                                <option value="90d">Last Quarter</option>
                                {/* ⚠️ "1y" n'est pas géré par /api/dashboard/stats, voir note en tête de fichier */}
                                <option value="1y">Last Year</option>
                            </select>
                            <Calendar className="w-4 h-4 text-gray-500 absolute left-4 top-4 pointer-events-none" />
                        </div>
                        
                        <button 
                            onClick={handleExportDashboardReport}
                            className="flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-blue-700 border border-blue-800 rounded-lg text-sm font-medium text-white hover:bg-blue-800 cursor-pointer lg:w-36 h-12 justify-center transition-colors shadow-sm"
                        >
                            <Download className="w-4 h-4 text-white" />
                            <p className="text-xs md:text-sm font-medium text-white whitespace-nowrap">Export Report</p>
                        </button>
                    </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap gap-4 md:gap-6 w-full mt-8">
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-blue-600/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <UserRoundCheck className="text-blue-800" />
                            </div>
                            <TrendIndicator value={trends.totalDelta} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Total Verifications</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.total}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-yellow-400/30 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <ClipboardClock className="text-orange-600" />
                            </div>
                            <TrendIndicator value={trends.pendingDelta} neutral={true} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Pending Review</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.pending}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-green-500/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <ShieldCheck className="text-green-700" />
                            </div>
                            <TrendIndicator value={trends.verifiedDelta} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Approved Profiles</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.verified}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-red-600/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <TriangleAlert className="text-red-700" />
                            </div>
                            <TrendIndicator value={trends.highRiskDelta} invertColors={true} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Risk Alerts</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.highRisk}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row justify-between gap-4 mt-7">
                    <div className="flex flex-col w-full lg:w-[65%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between hover:shadow-md hover:-translate-y-1 transition-all duration-300 bg-white">
                        <div className="flex flex-row justify-between items-center mb-4">
                            <h2 className="font-bold">Verification Activity (Last 7 Days)</h2>
                            <div className="flex flex-row text-xs font-semibold gap-3 text-gray-600">
                                <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full"></span> Approved
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span> Risk
                                </span>
                            </div>
                        </div>
                        <div className="w-full h-[250px] mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorApprove" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Area type="monotone" dataKey="Approved" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorApprove)" />
                                    <Area type="monotone" dataKey="Risk" stroke="#dc2626" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    
                    <div className="flex flex-col w-full lg:w-[35%] bg-blue-600 rounded-xl shadow-sm p-5 md:p-6 text-white justify-between hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-col gap-4">
                            <svg viewBox="0 0 24 24" className="h-8 w-8 text-white" fill="currentColor">
                                <path d="M11.64 5.23a.75.75 0 0 1 1.44 0l1.24 3.86a.75.75 0 0 0 .52.52l3.86 1.24a.75.75 0 0 1 0 1.44l-3.86 1.24a.75.75 0 0 0-.52.52l-1.24 3.86a.75.75 0 0 1-1.44 0l-1.24-3.86a.75.75 0 0 0-.52-.52l-3.86-1.24a.75.75 0 0 1 0-1.44l3.86-1.24a.75.75 0 0 0 .52-.52z"/>
                                <path d="M19.32 2.68a.5.5 0 0 1 .96 0l.4 1.2a.5.5 0 0 0 .34.34l1.2.4a.5.5 0 0 1 0 .96l-1.2.4a.5.5 0 0 0-.34-.34l-.4 1.2a.5.5 0 0 1-.96 0l-.4-1.2a.5.5 0 0 0-.34-.34l-1.2-.4a.5.5 0 0 1 0-.96l1.2-.4a.5.5 0 0 0 .34-.34z"/>
                            </svg>
                            <h3 className="font-bold text-lg md:text-xl">AI Risk Scoring</h3>
                            <p className="text-blue-100 text-sm md:text-base leading-relaxed">
                                Our new neural engine has flagged <span className="font-bold text-white">{stats.highRisk}</span> potential anomalies in the system. Manual review recommended.
                            </p>
                        </div>
                        <button 
                            onClick={() => router.push('/dashboard/customers?risk=high')}
                            className="mt-6 w-full py-2.5 bg-blue-500 hover:bg-blue-400 transition-colors border border-blue-400 rounded-lg font-medium text-sm cursor-pointer"
                        >
                            Review Anomalies
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="w-full bg-white border border-gray-400 rounded-md p-8 text-center flex flex-col items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                        <p className="text-gray-500 font-medium">Loading recent compliance logs...</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center px-1">
                            <h3 className="font-bold text-gray-800 text-lg">Recent Verification Requests</h3>
                            <Link href="/dashboard/customers" className="text-sm font-bold text-blue-700 hover:underline flex items-center gap-1">
                                View Directory <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <VerificationTable data={requestsData} />
                    </div>
                )}
            </div>
        </div>
    );
}