"use client"

import Link from "next/link";
import { useState, useEffect } from "react";
import VerificationTable from "@/components/VerificationTable";
import { Calendar, Download, UserRoundCheck, ClipboardClock, Clock, ShieldCheck, TriangleAlert, AlertCircle, ArrowRight } from "lucide-react";
import Header from "@/components/header";
import NewVerificationButton from "@/components/NewVerificationButton"; 

export default function DashboardPage() {
    const [requestsData, setRequestsData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalCustomers: 0, verifiedToday: 0, pendingReviews: 0, highRisk: 0 });
    const [highRiskProfiles, setHighRiskProfiles] = useState<any[]>([]);

    useEffect(() => {
        async function fetchDashboardData() {
            try {
                const response = await fetch("/api/customers?limit=10");
                const data = await response.json();

                if (response.ok && data.requests) {
                    const formattedData = data.requests.map((req: any) => {
                        const initials = req.customerName
                            ? req.customerName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                            : "??";

                        let dateFormatted = "Date inconnue";
                        if (req.submittedAt) {
                            const d = new Date(req.submittedAt);
                            if (!isNaN(d.getTime())) {
                                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                dateFormatted = `${months[d.getMonth()]} ${d.getDate()}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                            }
                        }

                        return {
                            id: req.id,
                            Avatar: initials,
                            Nom: req.customerName,
                            Email: req.email,
                            Type: req.type,
                            Submitted: dateFormatted, 
                            Status: req.status ? req.status.toLowerCase() : "pending",
                            Score: req.score || "--",
                            rawDate: req.submittedAt
                        };
                    });

                    setRequestsData(formattedData.slice(0, 5));

                    const criticalProfiles = data.requests.filter((req: any) => {
                        if (!req.score) return false;
                        const match = String(req.score).match(/\d+/);
                        if (!match) return false;
                        const parsedScore = parseInt(match[0], 10);
                        return parsedScore <= 50;
                    });
                    setHighRiskProfiles(criticalProfiles.slice(0, 3));

                    if (data.stats) {
                        setStats(data.stats);
                    }
                }
            } catch (error) {
                console.error("Error fetching requests:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchDashboardData();
    }, []);

    // --- ENGIN DE GÉNÉRATION DE RAPPORT EXÉCUTIF (DASHBOARD) ---
    const handleExportDashboardReport = () => {
        const timestamp = new Date().toLocaleString();
        
        // 1. Construction d'une entête de rapport d'audit financier/conformité ultra propre
        const reportSections = [
            "==================================================",
            "   KYC/AML COMPLIANCE PLATFORM EXECUTIVE REPORT   ",
            `   Generated on: ${timestamp}                     `,
            "==================================================",
            "",
            "1. GLOBAL PLATFORM METRICS (KPIs)",
            `- Total Identity Check Inventions: ${stats.totalCustomers}`,
            `- Total Verified Profiles Today: ${stats.verifiedToday}`,
            `- Current Active Pending Review Queue: ${stats.pendingReviews}`,
            `- Critical High Risk Flagged Alerts: ${highRiskProfiles.length}`,
            "",
            "2. LIVE CRITICAL ANOMALIES DETECTED",
            highRiskProfiles.length > 0 
                ? highRiskProfiles.map(p => `- ALERT: ${p.customerName} (${p.email}) - AI Risk Score: ${p.score}/100`).join("\n")
                : "- No critical security anomalies detected in this session.",
            "",
            "3. RECENT PIPELINE ACTIVITY LOG",
            "ID,Customer Name,Email,Procedure Type,Status,AI Score,Date Submitted"
        ];
        
        // 2. Injection des lignes de données du tableau
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

        // 3. Assemblage final (Le \uFEFF force Excel à s'ouvrir proprement sans casser les accents)
        const finalReportString = "\uFEFF" + [...reportSections, ...tableRows].join("\n");
        
        const blob = new Blob([finalReportString], { type: "text/plain;charset=utf-8;" });
        const link = document.createElement("a");
        const urlObj = URL.createObjectURL(blob);
        
        link.setAttribute("href", urlObj);
        // On l'enregistre en .csv ou .txt, Excel saura le lire comme un vrai rapport chapitré
        link.setAttribute("download", `executive_compliance_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                        <button className="flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer lg:w-36 h-12 justify-center">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <p className="text-xs md:text-sm font-medium text-gray-700 whitespace-nowrap">Last 30 days</p>
                        </button>
                        
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
                            <div className="bg-green-500/20 flex justify-center items-center rounded-sm px-2 py-1 text-green-700 text-[10px] font-bold">+12%</div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Total Verifications</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.totalCustomers}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-yellow-400/30 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <ClipboardClock className="text-orange-600" />
                            </div>
                            <div className="bg-yellow-400/30 flex justify-center items-center rounded-sm px-2 py-1 text-orange-600 text-[10px] font-bold"><Clock className="w-3 h-3 inline mr-1" />8m avg</div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Pending Review</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.pendingReviews}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-green-500/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <ShieldCheck className="text-green-700" />
                            </div>
                            <div className="bg-green-500/20 flex justify-center items-center rounded-sm px-2 py-1 text-green-700 text-[10px] font-bold">99.2% Rate</div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Approved</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.verifiedToday}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-red-600/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <TriangleAlert className="text-red-700" />
                            </div>
                            <div className="bg-red-600/20 flex justify-center items-center rounded-sm px-2 py-1 text-red-700 text-[10px] font-bold truncate">High Priority</div>
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
                            <h2 className="font-bold">Verification Activity</h2>
                            <div className="flex flex-row text-xs font-semibold gap-3 text-gray-600">
                                <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full"></span> Approved
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span> Risk
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-row justify-between w-full px-2 mt-auto text-xs font-bold text-gray-400">
                            <p>Monday</p><p>Tuesday</p><p>Wednesday</p><p>Thursday</p><p>Friday</p><p>Saturday</p><p>Sunday</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col w-full lg:w-[35%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between gap-6 hover:shadow-md hover:-translate-y-1 transition-all duration-300 bg-white">
                        <div>
                            <div className="flex flex-row items-center mb-4">
                                <h2 className="font-bold text-gray-900">Live Critical Risks</h2>
                                <Link href="/dashboard/customers" className="text-xs font-bold text-blue-700 ml-auto hover:underline">View All</Link>
                            </div>
                            <div className="flex flex-col gap-3">
                                {highRiskProfiles.length > 0 ? (
                                    highRiskProfiles.map((profile) => (
                                        <Link 
                                            href={`/dashboard/customers/${profile.id}`} 
                                            key={profile.id}
                                            className="flex flex-row items-center gap-3 p-2.5 border border-red-200 bg-red-50/40 hover:bg-red-50 transition-all rounded-lg cursor-pointer group"
                                        >
                                            <div className="bg-red-100 p-2 rounded-lg text-red-700 shrink-0">
                                                <AlertCircle className="w-4 h-4" />
                                            </div>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <p className="text-sm font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{profile.customerName}</p>
                                                <p className="text-xs text-red-600 font-medium">Risk Score: {profile.score}/100</p>
                                            </div>
                                        </Link>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-xs text-gray-400 font-medium">
                                        No critical anomalies detected in the database.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 bg-gray-100 p-4 rounded-lg">
                            <p className="text-xs font-medium text-gray-600">AI-driven risk scoring engine is monitoring active directory logs.</p>
                            <div className="w-full bg-white h-1.5 rounded-full overflow-hidden">
                                <div className="bg-blue-700 h-full w-[75%] rounded-full" ></div>
                            </div>
                        </div>
                    </div> 
                </div>

                {loading ? (
                    <div className="w-full bg-white border border-gray-400 rounded-md p-8 text-center text-gray-500 font-medium">
                        Loading KYC analysis data...
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <VerificationTable data={requestsData} />
                    </div>
                )}
            </div>
        </div>
    );
}