"use client"
import Link from "next/link";
import { 
    Calendar, Download, ChevronDown, Shield,
    Clock, ShieldCheck, TriangleAlert, 
    TrendingUp, TrendingDown, Minus, RefreshCw,
    Loader2, FileText
} from "lucide-react";
import Header from "@/components/header";
import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Report() {
    const [loading, setLoading] = useState(true);
    const [recentReports, setRecentReports] = useState<any[]>([]); 
    const [dateRange, setDateRange] = useState("30d"); 
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false); 

    const [stats, setStats] = useState({
        total: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        highRisk: 0,
        successRate: 0,
        avgProcessingTime: 0,
        chartData: []
    });

    const [trends, setTrends] = useState({
        totalDelta: 0,
        verifiedDelta: 0,
        highRiskDelta: 0
    });

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const statsRes = await fetch(`/api/dashboard/stats?range=${dateRange}`);
                if (statsRes.ok) {
                    const data = await statsRes.json();
                    
                    const s = data.stats;
                    const resolvedCases = s.verified + s.rejected;
                    const successRate = resolvedCases > 0 ? ((s.verified / resolvedCases) * 100).toFixed(1) : 0;

                    setStats({
                        total: s.total,
                        approved: s.verified,
                        rejected: s.rejected,
                        pending: s.pending,
                        highRisk: s.highRisk,
                        successRate: Number(successRate),
                        avgProcessingTime: data.avgProcessingTime, 
                        chartData: data.chartData || []
                    });

                    setTrends({
                        totalDelta: data.trends?.totalDelta || 0,
                        verifiedDelta: data.trends?.verifiedDelta || 0,
                        highRiskDelta: data.trends?.highRiskDelta || 0
                    });
                }

                const reportsRes = await fetch('/api/customers?limit=5&sort=newest');
                if (reportsRes.ok) {
                    const reportsData = await reportsRes.json();
                    setRecentReports(reportsData.requests || reportsData.data || []);
                }

            } catch (error) {
                console.error("Failed to fetch reports data:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [dateRange]);

    const handleGlobalExport = async () => {
        setIsExporting(true);
        try {
            const htmlToImage = await import('html-to-image');
            const { jsPDF } = await import('jspdf');

            const element = document.getElementById('dashboard-report-content');
            if (!element) return;

            const dataUrl = await htmlToImage.toPng(element, {
                quality: 1,
                backgroundColor: '#f9fafb',
                pixelRatio: 2, 
                height: element.scrollHeight,
                filter: (node: any) => node.id !== 'action-buttons'
            });
            
            const pdfWidth = 210; 
            const pdfHeight = (element.scrollHeight * pdfWidth) / element.scrollWidth;
            
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: [pdfWidth, pdfHeight] 
            });
            
            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`KYC_Analytics_Report_${dateRange}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error("Global PDF Export failed", error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleSingleExport = async (report: any) => {
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            
            doc.setFontSize(22);
            doc.setTextColor(37, 99, 235);
            doc.text(`Compliance Audit Report`, 20, 20);
            
            doc.setFontSize(12);
            doc.setTextColor(100, 100, 100);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 30);
            
            doc.setDrawColor(200, 200, 200);
            doc.line(20, 35, 190, 35);
            
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.text(`Applicant Details`, 20, 45);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.text(`Full Name: ${report.customerName}`, 20, 55);
            doc.text(`Email: ${report.email}`, 20, 65);
            doc.text(`Nationality: ${report.nationality || 'N/A'}`, 20, 75);
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(`Document & Status`, 20, 90);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.text(`Document Type: ${report.documentType || 'N/A'}`, 20, 100);
            doc.text(`ID Number: ${report.cin}`, 20, 110);
            doc.text(`Calculated Risk: ${report.riskLevel || 'Low'}`, 20, 120);
            doc.text(`Final Status: ${report.status.toUpperCase()}`, 20, 130);
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(`AI Rationale & Audit Trail`, 20, 145);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            const splitText = doc.splitTextToSize(report.aiRationale || "Manual review required. No AI rationale generated.", 170);
            doc.text(splitText, 20, 155);

            doc.save(`Audit_${report.customerName.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error("Single PDF Export failed", error);
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center flex-col gap-4"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /><p className="text-gray-500 font-medium">Synchronizing Database...</p></div>;

    const approvedPct = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    const pendingPct = stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0;
    const rejectedPct = stats.total > 0 ? Math.round((stats.rejected / stats.total) * 100) : 0;

    return (
        <div className="w-full min-h-screen bg-gray-50 pb-12">
            <Header />
            
            <div id="dashboard-report-content" className="flex flex-col gap-8 mb-8 px-4 md:px-8 lg:px-12 mt-8 max-w-7xl mx-auto pt-4 relative">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 lg:gap-0">
                    <div className="flex flex-col mb-2">
                        <h2 className="text-2xl font-bold text-gray-900">Reports and Analytics</h2>
                        <p className="text-sm text-gray-500">Overview of compliance performance and verifications</p>
                    </div>
                    
                    <div id="action-buttons" className="flex flex-row gap-3 w-full lg:w-auto">
                        
                        <div className="relative flex-1 lg:flex-none">
                            <button 
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer lg:w-40 h-12 justify-center transition-colors"
                            >
                                <Calendar className="w-4 h-4 text-gray-600 shrink-0" />
                                <p className="text-xs md:text-sm font-medium text-gray-700 truncate">
                                    {dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : dateRange === '90d' ? 'Last 90 days' : 'All time'}
                                </p>
                                <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" />
                            </button>
                            
                            {isDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                                    <div className="absolute right-0 top-full mt-2 w-full lg:w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden py-1">
                                        <button onClick={() => {setDateRange('7d'); setIsDropdownOpen(false)}} className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-blue-50 hover:text-blue-700 ${dateRange === '7d' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>Last 7 days</button>
                                        <button onClick={() => {setDateRange('30d'); setIsDropdownOpen(false)}} className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-blue-50 hover:text-blue-700 ${dateRange === '30d' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>Last 30 days</button>
                                        <button onClick={() => {setDateRange('90d'); setIsDropdownOpen(false)}} className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-blue-50 hover:text-blue-700 ${dateRange === '90d' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>Last 90 days</button>
                                        <button onClick={() => {setDateRange('all'); setIsDropdownOpen(false)}} className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-blue-50 hover:text-blue-700 ${dateRange === 'all' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>All time</button>
                                    </div>
                                </>
                            )}
                        </div>

                        <button 
                            onClick={handleGlobalExport}
                            disabled={isExporting}
                            className="flex-1 lg:flex-none flex items-center gap-2 px-4 py-2 bg-blue-700 border border-blue-700 rounded-lg text-sm font-bold text-white hover:bg-blue-800 cursor-pointer lg:w-36 h-12 justify-center transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            <p className="text-xs md:text-sm font-medium">{isExporting ? 'Generating...' : 'Export PDF'}</p>
                        </button>
                    </div>
                </div>

                {/* 💡 NOUVEAU [FLEXBOX] : Remplacement de CSS Grid par Flexbox fluide (flex-wrap + flex-1) */}
                <div className="flex flex-row flex-wrap gap-4 md:gap-6 w-full mt-2">
                    <div className="flex-1 min-w-[240px] bg-white p-5 md:p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[144px] hover:border-blue-300 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1 w-[70%]">
                                <p className="text-xs md:text-sm font-medium text-gray-500 truncate">Total Verifications</p>
                                <p className="text-2xl md:text-3xl font-black text-gray-900 truncate">{(stats.total || 0).toLocaleString()}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                                <Shield className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 mt-2 md:mt-1">
                            {trends.totalDelta >= 0 ? <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-600 shrink-0" />}
                            <p className={`text-[10px] md:text-xs font-medium truncate ${trends.totalDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {trends.totalDelta > 0 ? '+' : ''}{trends.totalDelta.toFixed(1)}% vs previous
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-w-[240px] bg-white p-5 md:p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[144px] hover:border-blue-300 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1 w-[70%]">
                                <p className="text-xs md:text-sm font-medium text-gray-500 truncate">Avg Processing Time</p>
                                <p className="text-2xl md:text-3xl font-black text-gray-900 truncate">
                                    {stats.avgProcessingTime < 60 
                                        ? stats.avgProcessingTime 
                                        : stats.avgProcessingTime < 3600 
                                            ? (stats.avgProcessingTime / 60).toFixed(1) 
                                            : (stats.avgProcessingTime / 3600).toFixed(1)}
                                    <span className="text-sm md:text-lg font-bold text-gray-500 ml-1">
                                        {stats.avgProcessingTime < 60 ? 'sec' : stats.avgProcessingTime < 3600 ? 'min' : 'hrs'}
                                    </span>
                                </p>
                            </div>
                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                                <Clock className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 mt-2 md:mt-1">
                            {stats.avgProcessingTime < 5 ? <TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600 shrink-0" /> : <Minus className="w-3.5 h-3.5 md:w-4 md:h-4 text-yellow-600 shrink-0" />}
                            <p className={`text-[10px] md:text-xs font-medium truncate ${stats.avgProcessingTime < 5 ? 'text-green-600' : 'text-yellow-600'}`}>
                                {stats.avgProcessingTime < 5 ? 'Fully Automated' : 'Manual Review Noted'}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-w-[240px] bg-white p-5 md:p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[144px] hover:border-blue-300 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1 w-[70%]">
                                <p className="text-xs md:text-sm font-medium text-gray-500 truncate">Success Rate</p>
                                <p className="text-2xl md:text-3xl font-black text-gray-900 truncate">{stats.successRate || 0}%</p>
                            </div>
                            <div className="p-2 rounded-lg bg-green-50 text-green-600 shrink-0">
                                <ShieldCheck className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 mt-2 md:mt-1">
                            {trends.verifiedDelta > 0 ? <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600 shrink-0" /> : <Minus className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400 shrink-0" />}
                            <p className={`text-[10px] md:text-xs font-medium truncate ${trends.verifiedDelta > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                {trends.verifiedDelta > 0 ? `+${trends.verifiedDelta.toFixed(1)}% volume` : 'Stable conversion'}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-w-[240px] bg-white p-5 md:p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[144px] hover:border-red-300 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1 w-[70%]">
                                <p className="text-xs md:text-sm font-medium text-gray-500 truncate">High Risk Alerts</p>
                                <p className="text-2xl md:text-3xl font-black text-red-600 truncate">{stats.highRisk}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-red-50 text-red-600 animate-pulse shrink-0">
                                <TriangleAlert className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 mt-2 md:mt-1">
                            {trends.highRiskDelta > 0 ? <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-600 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600 shrink-0" />}
                            <p className={`text-[10px] md:text-xs font-medium truncate ${trends.highRiskDelta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {trends.highRiskDelta > 0 ? `+${trends.highRiskDelta.toFixed(1)}% risk increment` : 'Risk dropping'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row justify-between gap-6 mt-2">
                    <div className="flex flex-col w-full lg:w-[65%] border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300">
                        <h2 className="font-bold text-lg mb-6 text-gray-800">Verification Volume Over Time</h2>
                        <div className="h-72 w-full">
                            {stats.chartData && stats.chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}
                                        />
                                        <Area type="monotone" dataKey="Approved" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorApproved)" />
                                        <Area type="monotone" dataKey="Risk" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-400 font-medium border-2 border-dashed border-gray-100 rounded-xl">
                                    No data available for this period.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col w-full lg:w-[35%] border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300">
                        <h2 className="font-bold text-lg mb-4 text-gray-800">Status Distribution</h2>
                        
                        <div className="flex-1 flex flex-col items-center justify-center w-full relative my-4">
                            <div className="w-48 h-48 rounded-full border-[16px] border-gray-100 relative flex items-center justify-center">
                                <div className="absolute inset-[-16px] rounded-full border-[16px] border-green-500" style={{ clipPath: `polygon(0 0, 100% 0, 100% ${approvedPct}%, 0 ${approvedPct}%)` }}></div>
                                <div className="absolute inset-[-16px] rounded-full border-[16px] border-yellow-500" style={{ clipPath: `polygon(0 ${approvedPct}%, 100% ${approvedPct}%, 100% ${approvedPct + pendingPct}%, 0 ${approvedPct + pendingPct}%)` }}></div>
                                <div className="absolute inset-[-16px] rounded-full border-[16px] border-red-500" style={{ clipPath: `polygon(0 ${approvedPct + pendingPct}%, 100% ${approvedPct + pendingPct}%, 100% 100%, 0 100%)` }}></div>
                                
                                <div className="flex flex-col items-center z-10 bg-white w-32 h-32 rounded-full justify-center shadow-inner">
                                    <span className="text-3xl font-black text-gray-900">{stats.total}</span>
                                    <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">TOTAL</span>
                                </div>
                            </div>
                        </div>

                        {/* 💡 NOUVEAU [FLEXBOX] : Remplacement du grid par flex pour la légende */}
                        <div className="flex flex-wrap justify-between gap-y-4 w-full mt-auto px-2 border-t border-gray-100 pt-6">
                            <div className="flex items-center gap-3 basis-[48%]">
                                <div className="w-3 h-3 bg-green-500 rounded-sm shrink-0"></div>
                                <div className="flex flex-col">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Approved</p>
                                    <p className="text-sm font-bold text-gray-900">{approvedPct}%</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 basis-[48%]">
                                <div className="w-3 h-3 bg-yellow-500 rounded-sm shrink-0"></div>
                                <div className="flex flex-col">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Pending</p>
                                    <p className="text-sm font-bold text-gray-900">{pendingPct}%</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 basis-[48%]">
                                <div className="w-3 h-3 bg-red-500 rounded-sm shrink-0"></div>
                                <div className="flex flex-col">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Rejected</p>
                                    <p className="text-sm font-bold text-gray-900">{rejectedPct}%</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 basis-[48%]">
                                <div className="w-3 h-3 bg-red-800 rounded-sm shrink-0 animate-pulse"></div>
                                <div className="flex flex-col">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">High Risk</p>
                                    <p className="text-sm font-bold text-red-700">{stats.highRisk}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col w-full border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden mt-2 hover:shadow-md transition-all duration-300">
                    <div className="flex flex-row justify-between items-center p-4 md:p-6 border-b border-gray-100 bg-white">
                        <h2 className="font-bold text-base md:text-lg text-gray-900 shrink-0">Recent Audit Reports</h2>
                        <Link href="/dashboard/customers" className="text-xs md:text-sm font-bold text-blue-700 hover:text-blue-800 shrink-0">View All Cases</Link>
                    </div>
                    
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead className="text-[9px] md:text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                                <tr>
                                    <th className="px-4 py-4">REPORT NAME</th>
                                    <th className="px-4 py-4">TYPE</th>
                                    <th className="px-4 py-4">SUBMISSION DATE</th>
                                    <th className="px-4 py-4">STATUS</th>
                                    <th className="px-4 py-4 text-center">ACTION</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-[10px] md:text-sm text-gray-700 font-medium">
                                {recentReports.length > 0 ? recentReports.map((report: any) => (
                                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-4 break-words whitespace-normal text-gray-900 font-bold flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                                            Audit - {report.customerName}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${report.type?.includes('KYB') ? 'bg-gray-200 text-gray-700 border border-gray-300' : report.type?.includes('AML') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                                {report.type?.includes('KYB') ? 'KYB' : report.type?.includes('AML') ? 'AML' : 'KYC'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-gray-500">
                                            {new Date(report.submittedAt || report.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 w-max ${report.status === 'verified' ? 'bg-green-50 text-green-700 border border-green-200' : report.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${report.status === 'verified' ? 'bg-green-600' : report.status === 'rejected' ? 'bg-red-600' : 'bg-yellow-600'}`}></div>
                                                {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <button onClick={() => handleSingleExport(report)} className="mx-auto block" title="Download PDF Audit">
                                                <Download className="w-5 h-5 text-gray-400 hover:text-blue-600 cursor-pointer transition-colors" />
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-gray-500 font-medium">
                                            No recent reports available in the database.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}