"use client"

import Link from "next/link";
import { useState, useEffect } from "react";
import VerificationLogTable from "@/components/VerificationLogTable";
import { User, Download, ListFilter, ShieldCheck, ClipboardClock, TriangleAlert } from "lucide-react";
import CustomerHeader from "@/components/HeaderCustomers";

export default function CustomerPage() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [LimitPerPage, setLimitPerPage] = useState(5);

    useEffect(() => {
        async function fetchCustomers() {
            setLoading(true);
            try{
                const response = await fetch(`/api/customers?page=${currentPage}&limit=${LimitPerPage}`);
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
                        let parsedScore = NaN;
                        
                        if (req.score) {
                            const match = String(req.score).match(/\d+/);
                            if (match) {
                                parsedScore = parseInt(match[0], 10);
                            }
                        }

                        if (!isNaN(parsedScore)) {
                            if (parsedScore >= 80) risk = "Low";
                            else if (parsedScore <= 50) risk = "High";
                        }

                        return {
                            id: req.id,
                            Avatar: initials,
                            Nom: req.customerName,
                            Email: req.email,
                            Status: req.status ? req.status.toLowerCase() : "pending",
                            RiskLevel: risk,
                            DateAdded: dateFormatted,
                        };
                    });
                    
                    setCustomers(formattedData);
                    setTotalItems(data.total);
                    setTotalPages(Math.ceil(data.total / LimitPerPage));
                }
            } catch (error) {
                console.error("Error fetching customers:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchCustomers();   
    }, [currentPage, LimitPerPage]);

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage((prev) => prev + 1);
        }
    };

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage((prev) => prev - 1);
        }
    };

    const handleLimitChange = (newLimit: number) => {
        setLimitPerPage(newLimit);
        setCurrentPage(1); 
    }

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
                    <div className="flex flex-row gap-3 w-full lg:w-auto">
                        <button className="flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-gray-300 border border-gray-400 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer lg:w-36 h-12 justify-center">
                            <span className="flex items-center justify-center text-gray-600" aria-hidden="true">
                                <ListFilter />
                            </span>
                            <p className="text-xs md:text-sm font-medium text-gray-800 whitespace-nowrap">Filter</p>
                        </button>
                        <button className=" flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-gray-300 border border-gray-400 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer lg:w-36 h-12 justify-center">
                            <span className="flex items-center justify-center text-gray-700" aria-hidden="true">
                                <Download />
                            </span>
                            <p className="text-xs md:text-sm font-medium text-gray-800 whitespace-nowrap">Export CSV</p>
                        </button>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 w-full mt-8">
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Total Customers</p>
                            <div className="text-blue-800 text-sm font-bold flex items-center justify-center">
                                <User />
                            </div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">{totalItems}</p>
                            <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">
                                +4.2%
                            </div>
                        </div>
                    </div>
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Verified Today</p>
                            <div className="text-green-700 text-sm font-bold flex items-center justify-center">
                                <ShieldCheck />
                            </div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">842</p>
                            <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">
                                +12%
                            </div>
                        </div>
                    </div>
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">Pending Reviews</p>
                            <div className="text-yellow-500 text-sm font-bold flex items-center justify-center">
                                <ClipboardClock />
                            </div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">156</p>
                            <div className="text-gray-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">
                                <p className="text-gray-700">-2.1%</p>
                            </div>
                        </div>
                    </div>
                    <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start w-full">
                            <p className="text-sm font-semibold text-gray-500 truncate">High Risk Flagged</p>
                            <div className="text-red-700 text-sm font-bold flex items-center justify-center">
                                <TriangleAlert />
                            </div>       
                        </div>
                        <div className="flex flex-row justify-between items-end w-full mt-4">
                            <p className="text-2xl font-bold text-gray-900 leading-none">24</p>
                            <div className="text-red-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">
                                <p className="text-red-700">+3 Today</p>
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="w-full bg-white border border-gray-400 rounded-md p-8 text-center text-gray-500 font-medium">
                        Loading customers data...
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
                
                <div className="flex flex-col lg:flex-row gap-4 md:gap-6 w-full mt-8">
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
                                <path d="M19.32 2.68a.5.5 0 0 1 .96 0l.4 1.2a.5.5 0 0 0 .34.34l1.2.4a.5.5 0 0 1 0 .96l-1.2.4a.5.5 0 0 0-.34.34l-.4 1.2a.5.5 0 0 1-.96 0l-.4-1.2a.5.5 0 0 0-.34-.34l-1.2-.4a.5.5 0 0 1 0-.96l1.2-.4a.5.5 0 0 0 .34-.34z"/>
                            </svg>
                            <h3 className="font-bold text-lg md:text-xl">AI Risk Scoring</h3>
                            <p className="text-blue-100 text-sm md:text-base leading-relaxed">
                                Our new neural engine has flagged 3 potential anomalies in the last hour. Manual review recommended.
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