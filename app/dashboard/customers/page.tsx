"use client"

import { useState, useEffect } from "react";
import VerificationLogTable from "@/components/VerificationLogTable";
import { User, Download, ListFilter, ShieldCheck, ClipboardClock, TriangleAlert, SlidersHorizontal, X, Search } from "lucide-react";
import CustomerHeader from "@/components/HeaderCustomers";
import NewVerificationButton from "@/components/NewVerificationButton";

export default function CustomerPage() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [LimitPerPage, setLimitPerPage] = useState(5);
    const [stats, setStats] = useState({ totalCustomers: 0, verifiedToday: 0, pendingReviews: 0, highRisk: 0 });

    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [draftFilters, setDraftFilters] = useState({ status: 'all', risk: 'all', sort: 'newest' });
    const [activeFilters, setActiveFilters] = useState({ status: 'all', risk: 'all', sort: 'newest' });

    const hasActiveFilters = activeFilters.status !== 'all' || activeFilters.risk !== 'all' || activeFilters.sort !== 'newest';

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setCurrentPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        async function fetchCustomers() {
            setLoading(true);
            try {
                const url = `/api/customers?page=${currentPage}&limit=${LimitPerPage}&status=${activeFilters.status}&risk=${activeFilters.risk}&sort=${activeFilters.sort}&search=${encodeURIComponent(debouncedSearch)}`;
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
                        
                        let risk = "Medium";
                        let parsedScore = parseInt(String(req.score).match(/\d+/)?.[0] || "0", 10);
                        
                        if (parsedScore >= 80) risk = "Low";
                        else if (parsedScore <= 50) risk = "High";

                        return {
                            id: req.id,
                            Avatar: initials,
                            Nom: req.customerName,
                            Email: req.email,
                            Status: req.status ? req.status.toLowerCase() : "pending",
                            RiskLevel: risk,
                            DateAdded: dateFormatted,
                            Score: req.score || "--", // 💡 CORRECTION : Ajout du champ manquant pour le tableau
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
    }, [currentPage, LimitPerPage, activeFilters, debouncedSearch]); 

    const handleExportCSV = async () => {
        try {
            const url = `/api/customers?page=1&limit=1000&status=${activeFilters.status}&risk=${activeFilters.risk}&sort=${activeFilters.sort}&search=${encodeURIComponent(debouncedSearch)}`;
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
                link.setAttribute("download", `kyc_directory_export_${new Date().toISOString().slice(0,10)}.csv`);
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
        const defaultFilters = { status: 'all', risk: 'all', sort: 'newest' };
        setDraftFilters(defaultFilters);
        setActiveFilters(defaultFilters);
        setCurrentPage(1);
        setIsFilterOpen(false);
    };

    const handleNextPage = () => { if (currentPage < totalPages) { setCurrentPage((prev) => prev + 1); } };
    const handlePrevPage = () => { if (currentPage > 1) { setCurrentPage((prev) => prev - 1); } };
    const handleLimitChange = (newLimit: number) => { setLimitPerPage(newLimit); setCurrentPage(1); }

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
                        <div className="relative flex-1 lg:flex-none lg:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search Name, Email, ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600 h-12 outline-none transition-all shadow-sm text-gray-800"
                            />
                        </div>

                        <div className="relative">
                            <button 
                                onClick={() => setIsFilterOpen(!isFilterOpen)} 
                                className={`w-full flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors cursor-pointer lg:w-36 h-12 justify-center shadow-sm
                                ${hasActiveFilters ? 'bg-blue-50 border-blue-600 text-blue-700 hover:bg-blue-100' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                                <ListFilter className="w-4 h-4" />
                                <p className="text-sm whitespace-nowrap">Filter</p>
                                {hasActiveFilters && <span className="w-2 h-2 bg-blue-600 rounded-full"></span>}
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
                                                        type="button"
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
                                                        type="button"
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
                                                <option value="newest">Newest First (SLA)</option>
                                                <option value="oldest">Oldest First (SLA)</option>
                                                <option value="highest_score">Safest Profiles (High Score)</option>
                                                <option value="lowest_score">Riskiest Profiles (Low Score)</option>
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
                            className="flex-1 lg:flex-none flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer h-12 justify-center transition-colors shadow-sm"
                        >
                            <Download className="w-4 h-4 text-gray-500"/>
                            <p className="text-sm font-medium whitespace-nowrap">Export CSV</p>
                        </button>

                        <NewVerificationButton />
                    </div>
                </div>
                
                {/* Widgets statistiques */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 w-full mt-8">
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Total Customers</p>
                            <div className="text-blue-800 text-sm font-bold flex items-center justify-center"><User /></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.totalCustomers}</p>
                            <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">+4.2%</div>
                        </div>
                    </div>
                    
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Verified Today</p>
                            <div className="text-green-700 text-sm font-bold flex items-center justify-center"><ShieldCheck /></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.verifiedToday}</p>
                            <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">+12%</div>
                        </div>
                    </div>
                    
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Pending Reviews</p>
                            <div className="text-yellow-500 text-sm font-bold flex items-center justify-center"><ClipboardClock /></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.pendingReviews}</p>
                            <div className="text-gray-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate"><p className="text-gray-700">-2.1%</p></div>
                        </div>
                    </div>
                    
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">High Risk Flagged</p>
                            <div className="text-red-700 text-sm font-bold flex items-center justify-center"><TriangleAlert /></div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.highRisk}</p>
                            <div className="text-red-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate"><p className="text-red-700">Action Req.</p></div>
                        </div>
                    </div>
                </div>

                {/* Log Table Container */}
                {loading ? (
                    <div className="w-full bg-white border border-gray-200 rounded-xl p-12 text-center flex flex-col items-center justify-center shadow-sm h-[400px]">
                        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-gray-500 font-medium">Loading filtered compliance data...</p>
                    </div>
                ) : customers.length === 0 ? (
                    <div className="w-full bg-white border border-gray-200 rounded-xl p-12 text-center flex flex-col items-center justify-center shadow-sm h-[400px]">
                        <p className="text-gray-950 font-bold text-lg">No profiles found</p>
                        <p className="text-gray-500 text-sm mt-1">Try adjusting your search query or filters.</p>
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
                
                <div className="grid flex-col lg:flex-row gap-4 md:gap-6 w-full mt-8">
                    <div className="flex flex-col w-full lg:w-[70%] bg-white border border-gray-200 rounded-xl shadow-sm p-5 md:p-6">
                        <div className="flex flex-row justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-900 text-base md:text-lg">Verification Velocity</h3>
                            <span className="text-xs md:text-sm text-gray-500 font-medium">Last 30 Days</span>
                        </div>
                        <div className="w-full bg-slate-50/50 rounded-lg h-[200px] flex items-center justify-center relative overflow-hidden border border-gray-100">
                            <svg viewBox="0 0 500 150" className="w-full h-full absolute inset-0 preserve-aspect-ratio-none" preserveAspectRatio="none">
                                <path d="M-10,120 C40,120 70,70 120,60 C170,50 200,100 250,110 C300,120 340,30 380,20 C420,10 470,80 510,100 L510,160 L-10,160 Z" fill="#eff6ff" opacity="0.6" />
                                <path d="M-10,120 C40,120 70,70 120,60 C170,50 200,100 250,110 C300,120 340,30 380,20 C420,10 470,80 510,100" fill="none" stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round" />
                            </svg>
                            <span className="text-xs md:text-sm text-gray-600 italic relative z-10 font-medium">Real-time processing volume visualization</span>
                        </div>
                    </div>

                    <div className="flex flex-col w-full lg:w-[30%] bg-blue-600 rounded-xl shadow-sm p-5 md:p-6 text-white justify-between">
                        <div className="flex flex-col gap-4">
                            <svg viewBox="0 0 24 24" className="h-8 w-8 text-white" fill="currentColor">
                                <path d="M11.64 5.23a.75.75 0 0 1 1.44 0l1.24 3.86a.75.75 0 0 0 .52.52l3.86 1.24a.75.75 0 0 1 0 1.44l-3.86 1.24a.75.75 0 0 0-.52.52l-1.24 3.86a.75.75 0 0 1-1.44 0l-1.24-3.86a.75.75 0 0 0-.52-.52l-3.86-1.24a.75.75 0 0 1 0-1.44l3.86-1.24a.75.75 0 0 0 .52-.52z"/>
                            </svg>
                            <h3 className="font-bold text-lg md:text-xl">AI Risk Scoring</h3>
                            <p className="text-blue-100 text-sm md:text-base leading-relaxed">
                                Our new neural engine has flagged potential anomalies. Manual review recommended.
                            </p>
                        </div>
                        <button className="mt-6 w-full py-2.5 bg-blue-500 hover:bg-blue-400 transition-colors border border-blue-400 rounded-lg font-medium text-sm cursor-pointer">
                            Review Anomalies
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}