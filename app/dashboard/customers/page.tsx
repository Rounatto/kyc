"use client"

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import VerificationLogTable from "@/components/VerificationLogTable";
import { User, Loader2, Download, ListFilter, ShieldCheck, ClipboardClock, TriangleAlert, SlidersHorizontal, X, TrendingUp, TrendingDown, Minus, AlertCircle, ArrowRight } from "lucide-react";
import CustomerHeader from "@/components/HeaderCustomers";
import NewVerificationButton from "@/components/NewVerificationButton";
import Link from "next/link";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

function CustomerPageContent() {
    const searchParams = useSearchParams();
    
    // Lecture de l'URL pour le bouton Review Anomalies
    const initialRisk = searchParams.get("risk") || "all";
    const initialStatus = searchParams.get("status") || "all";

    const [customers, setCustomers] = useState<any[]>([]);
    const [highRiskProfiles, setHighRiskProfiles] = useState<any[]>([]); 
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [LimitPerPage, setLimitPerPage] = useState(5);
    
    const [stats, setStats] = useState({ totalCustomers: 0, verifiedToday: 0, pendingReviews: 0, highRisk: 0 });
    const [trends, setTrends] = useState({ totalDelta: 0, verifiedDelta: 0, pendingDelta: 0, highRiskDelta: 0 });
    const [chartData, setChartData] = useState<any[]>([]); 

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    
    const [draftFilters, setDraftFilters] = useState({ status: initialStatus, risk: initialRisk, sort: 'oldest' });
    const [activeFilters, setActiveFilters] = useState({ status: initialStatus, risk: initialRisk, sort: 'oldest' });

    const hasActiveFilters = activeFilters.status !== 'all' || activeFilters.risk !== 'all' || activeFilters.sort !== 'oldest';

    const getNumericScore = (score: unknown) => {
        const match = String(score ?? "").match(/\d+/);
        return match ? parseInt(match[0], 10) : NaN;
    };

    const formatScore = (score: unknown) => {
        const numericScore = getNumericScore(score);
        return Number.isNaN(numericScore) ? "N/A" : `${numericScore}/100`;
    };

    useEffect(() => {
        async function fetchTrends() {
            try {
                const res = await fetch('/api/dashboard/stats?range=30d');
                if (res.ok) {
                    const data = await res.json();
                    setTrends(data.trends);
                    setChartData(data.chartData || []);
                }
            } catch (error) {
                console.error("Failed to load trends:", error);
            }
        }
        fetchTrends();
    }, []);

    useEffect(() => {
        async function fetchCustomers() {
            setLoading(true);
            try{
                const url = `/api/customers?page=${currentPage}&limit=${LimitPerPage}&status=${activeFilters.status}&risk=${activeFilters.risk}&sort=${activeFilters.sort}`;
                const response = await fetch(url);
                const data = await response.json();

                if (response.ok && data.requests) {
                    const formattedData = data.requests.map((req: any) => {
                        const initials = req.customerName ? req.customerName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "??";
                        
                        let dateFormatted = "N/A";
                        if (req.submittedAt) {
                            const d = new Date(req.submittedAt);
                            if (!isNaN(d.getTime())) {
                                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                dateFormatted = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                            }
                        }
                        
                        let risk = "Low"; // 💡 Par défaut, le risque est faible
                        const parsedScore = getNumericScore(req.score);
                        
                        // 💡 CORRECTION: Le score de 50+ est High Risk, 20-49 est Medium.
                        if (!isNaN(parsedScore)) {
                            if (parsedScore >= 50) risk = "High";
                            else if (parsedScore >= 20) risk = "Medium";
                        }

                        return {
                            id: req.id,
                            Avatar: initials,
                            Nom: req.customerName,
                            Email: req.email,
                            Status: req.status ? req.status.toLowerCase() : "pending",
                            Score: formatScore(req.score),
                            RiskLevel: risk,
                            DateAdded: dateFormatted,
                            parsedScore 
                        };
                    });
                    
                    setCustomers(formattedData);
                    setTotalItems(data.total);
                    setTotalPages(Math.ceil(data.total / LimitPerPage));
                    if (data.stats) setStats(data.stats);

                }
            } catch (error) {
                console.error("Error fetching customers:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchCustomers();   
    }, [currentPage, LimitPerPage, activeFilters]);

    useEffect(() => {
        async function fetchLiveCriticalRisks() {
            try {
                const response = await fetch("/api/customers?page=1&limit=3&status=all&risk=high&sort=highest_score");
                const data = await response.json();

                if (response.ok && data.requests) {
                    const criticalProfiles = data.requests.map((req: any) => ({
                        id: req.id,
                        Nom: req.customerName,
                        Email: req.email,
                        Score: formatScore(req.score)
                    }));

                    setHighRiskProfiles(criticalProfiles);
                }
            } catch (error) {
                console.error("Error fetching live critical risks:", error);
            }
        }

        fetchLiveCriticalRisks();
    }, []);

    const handleExportCSV = async () => {
        try {
            const url = `/api/customers?page=1&limit=1000&status=${activeFilters.status}&risk=${activeFilters.risk}&sort=${activeFilters.sort}`;
            const response = await fetch(url);
            const data = await response.json();

            if (response.ok && data.requests) {
                const headers = ["ID", "Customer Name", "Email", "Procedure Type", "Document Type", "ID Number", "Nationality", "Risk Score", "Status", "Date Submitted"];
                
                const csvRows = data.requests.map((req: any) => {
                    return [
                        req.id,
                        `"${req.customerName}"`,
                        req.email,
                        req.type,
                        req.documentType,
                        req.cin,
                        req.nationality || "N/A",
                        req.score || "N/A",
                        req.status,
                        new Date(req.submittedAt).toLocaleString()
                    ].join(",");
                });

                const csvString = "\uFEFF" + [headers.join(","), ...csvRows].join("\n");
                const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
                const link = document.createElement("a");
                const urlObj = URL.createObjectURL(blob);
                
                link.setAttribute("href", urlObj);
                link.setAttribute("download", `kyc_directory_export_${activeFilters.status}_risk_${activeFilters.risk}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error("CSV Export failure:", error);
        }
    };

    const handleApplyFilters = () => {
        setActiveFilters(draftFilters);
        setCurrentPage(1);
        setIsFilterOpen(false);
    };

    const handleResetFilters = () => {
        const defaultFilters = { status: 'all', risk: 'all', sort: 'oldest' };
        setDraftFilters(defaultFilters);
        setActiveFilters(defaultFilters);
        setCurrentPage(1);
        setIsFilterOpen(false);
    };

    const handleNextPage = () => { if (currentPage < totalPages) { setCurrentPage((prev) => prev + 1); } };
    const handlePrevPage = () => { if (currentPage > 1) { setCurrentPage((prev) => prev - 1); } };
    const handleLimitChange = (newLimit: number) => { setLimitPerPage(newLimit); setCurrentPage(1); }

    const TrendIndicator = ({ value, invertColors = false, neutral = false }: { value: number, invertColors?: boolean, neutral?: boolean }) => {
        const isPositive = value > 0;
        const isZero = value === 0;
        
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
            <div className={`flex items-center justify-center rounded-sm px-2 py-1 text-[10px] font-bold gap-1 ${colorClass} truncate`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : isZero ? <Minus className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isPositive ? '+' : ''}{value.toFixed(1)}%
            </div>
        );
    };

    return (
        <div className="w-full">
            <CustomerHeader />
            
            <div className="flex flex-col gap-8 mb-8 bg-gray-100 px-8 lg:px-12 mt-8">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end bg-gray-100 gap-4 lg:gap-0">
                    <div className="flex flex-col mb-2">
                        <p className="text-sm text-gray-700">Organization / <span className="text-blue-700">Customers</span></p>
                        <h2 className="text-2xl font-bold text-gray-900">Customer Directory</h2>
                        <p className="text-sm text-gray-500">Manage identity verifications and monitor entreprise risk profiles.</p>
                    </div>
                    
                    <div className="flex flex-row gap-3 w-full lg:w-auto items-center">
                        <NewVerificationButton />
                        
                        <div className="relative flex-1 lg:flex-none">
                            <button 
                                onClick={() => setIsFilterOpen(!isFilterOpen)} 
                                className={`w-full flex items-center gap-2 px-2 md:px-4 py-2 border rounded-lg text-sm font-medium transition-colors cursor-pointer lg:w-36 h-12 justify-center
                                ${hasActiveFilters ? 'bg-blue-50 border-blue-600 text-blue-700 hover:bg-blue-100' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                                <ListFilter className="w-4 h-4" />
                                <p className="text-xs md:text-sm whitespace-nowrap">Filter</p>
                                {hasActiveFilters && <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>}
                            </button>

                            {isFilterOpen && (
                                <div className="absolute left-0 lg:right-0 lg:left-auto mt-2 w-[320px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                        <div className="flex items-center gap-2 text-gray-800 font-bold text-sm">
                                            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                                            Advanced Filters
                                        </div>
                                        <button onClick={() => setIsFilterOpen(false)} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="p-4 flex flex-col gap-5">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</label>
                                            <div className="flex gap-2 flex-wrap">
                                                {['all', 'pending', 'verified', 'rejected'].map((s) => (
                                                    <button 
                                                        key={s}
                                                        onClick={() => setDraftFilters({...draftFilters, status: s})}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer capitalize
                                                        ${draftFilters.status === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">AI Risk Level</label>
                                            <div className="flex gap-2 flex-wrap">
                                                {['all', 'high', 'medium', 'low'].map((r) => (
                                                    <button 
                                                        key={r}
                                                        onClick={() => setDraftFilters({...draftFilters, risk: r})}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer capitalize
                                                        ${draftFilters.risk === r ? (r === 'high' ? 'bg-red-600 text-white border-red-600' : r === 'low' ? 'bg-green-600 text-white border-green-600' : r === 'medium' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-gray-800 text-white border-gray-800') : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                                                    >
                                                        {r}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sort Directory By</label>
                                            <select 
                                                value={draftFilters.sort}
                                                onChange={(e) => setDraftFilters({...draftFilters, sort: e.target.value})}
                                                className="w-full border border-gray-300 bg-white rounded-lg py-2 px-3 text-sm outline-none focus:border-blue-500 text-gray-800 cursor-pointer"
                                            >
                                                <option value="oldest">Oldest First (SLA)</option>
                                                <option value="newest">Newest First (SLA)</option>
                                                {/* 💡 CORRECTION DU TEXTE DE FILTRE */}
                                                <option value="highest_score">Riskiest Profiles (High Score)</option>
                                                <option value="lowest_score">Safest Profiles (Low Score)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex gap-3">
                                        <button onClick={handleResetFilters} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">Reset</button>
                                        <button onClick={handleApplyFilters} className="flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors shadow-sm cursor-pointer">Apply Filters</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={handleExportCSV}
                            className="flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-blue-700 border border-blue-800 rounded-lg text-sm font-medium text-white hover:bg-blue-800 cursor-pointer lg:w-36 h-12 justify-center transition-colors shadow-sm"
                        >
                            <span className="flex items-center justify-center text-white"><Download className="w-4 h-4"/></span>
                            <p className="text-xs md:text-sm font-medium text-white whitespace-nowrap">Export CSV</p>
                        </button>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 w-full mt-8">
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Total Customers</p>
                            <div className="text-blue-800 text-sm font-bold flex items-center justify-center"><User className="w-5 h-5"/></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.totalCustomers}</p>
                            <TrendIndicator value={trends.totalDelta} />
                        </div>
                    </div>
                    
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Verified Profiles</p>
                            <div className="text-green-700 text-sm font-bold flex items-center justify-center"><ShieldCheck className="w-5 h-5"/></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.verifiedToday}</p>
                            <TrendIndicator value={trends.verifiedDelta} />
                        </div>
                    </div>
                    
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Pending Reviews</p>
                            <div className="text-yellow-500 text-sm font-bold flex items-center justify-center"><ClipboardClock className="w-5 h-5"/></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.pendingReviews}</p>
                            <TrendIndicator value={trends.pendingDelta} neutral={true} />
                        </div>
                    </div>
                    
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">High Risk Flagged</p>
                            <div className="text-red-700 text-sm font-bold flex items-center justify-center"><TriangleAlert className="w-5 h-5"/></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.highRisk}</p>
                            <TrendIndicator value={trends.highRiskDelta} invertColors={true} />
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
                    
                    <div className="flex flex-col w-full lg:w-[35%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between gap-6 hover:shadow-md hover:-translate-y-1 transition-all duration-300 bg-white">
                        <div>
                            <div className="flex flex-row items-center mb-4">
                                <h2 className="font-bold text-gray-900">Live Critical Risks</h2>
                                <button 
                                    onClick={() => {
                                        setDraftFilters({...draftFilters, risk: 'high'});
                                        setActiveFilters({...activeFilters, risk: 'high'});
                                    }} 
                                    className="text-xs font-bold text-blue-700 ml-auto hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    Filter All <ArrowRight className="w-3 h-3" />
                                </button>
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
                                                <p className="text-sm font-bold text-gray-700 truncate transition-colors ">{profile.Nom}</p>
                                                <p className="text-xs text-red-600 font-medium">Risk Score: {profile.Score}</p>
                                            </div>
                                        </Link>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-xs text-gray-400 font-medium flex flex-col items-center">
                                        <ShieldCheck className="w-8 h-8 mb-2 opacity-30" />
                                        No critical anomalies detected in the active pipeline.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div> 
                </div>

                {loading ? (
                    <div className="w-full bg-white border border-gray-400 rounded-md p-8 text-center flex flex-col items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                        <p className="text-gray-500 font-medium">Loading recent compliance logs...</p>
                    </div>
                ) : (
                    <VerificationLogTable 
                        data={customers} 
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        currentLimit={LimitPerPage}
                        onNextPage={handleNextPage}
                        onPrevPage={handlePrevPage}
                        onLimitChange={handleLimitChange}
                    />
                )}
            </div>
        </div>
    );
}

export default function CustomerPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center text-blue-600">
                <Loader2 className="w-10 h-10 animate-spin" />
            </div>
        }>
            <CustomerPageContent />
        </Suspense>
    );
}