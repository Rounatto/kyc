"use client"

import Link from "next/link";
import { useState, useEffect } from "react";
import VerificationTable from "@/components/VerificationTable";
import { Bell, MessageCircleQuestionMark, Search, CircleQuestionMark, Calendar, Download, UserRoundCheck, ClipboardClock, Clock, ShieldCheck, TriangleAlert, Gavel, Flag, Earth  } from "lucide-react";
import Header from "@/components/header";
import NewVerificationButton from "@/components/NewVerificationButton"; 

export default function DashboardPage() {
    const [requestsData, setRequestsData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // NOUVEAU : Ajout de l'état pour les statistiques
    const [stats, setStats] = useState({ totalCustomers: 0, verifiedToday: 0, pendingReviews: 0, highRisk: 0 });

    useEffect(() => {
        async function fetchRequests() {
            try {
                const response = await fetch("/api/customers?limit=5");
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
                                const month = months[d.getMonth()];
                                const day = d.getDate();
                                const hours = d.getHours().toString().padStart(2, '0');
                                const minutes = d.getMinutes().toString().padStart(2, '0');
                                dateFormatted = `${month} ${day}, ${hours}:${minutes}`;
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
                        };
                    });

                    setRequestsData(formattedData);

                    // NOUVEAU : Sauvegarde des stats envoyées par l'API
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
        fetchRequests();
    }, []);

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
                            <span className="flex items-center justify-center text-gray-600" aria-hidden="true">
                                <Calendar />
                            </span>
                            <p className="text-xs md:text-sm font-medium text-gray-700 whitespace-nowrap">Last 30 days</p>
                        </button>
                        <button className=" flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-blue-700 border border-gray-300 rounded-lg text-sm font-medium text-white hover:bg-blue-600 cursor-pointer lg:w-36 h-12 justify-center">
                            <span className="flex items-center justify-center text-white" aria-hidden="true">
                                <Download />
                            </span>
                            <p className="text-xs md:text-sm font-medium text-white whitespace-nowrap">Export Report</p>
                        </button>
                    </div>
                </div>
                
                {/* LES 4 WIDGETS STATISTIQUES CONNECTÉS À LA BDD */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap gap-4 md:gap-6 w-full mt-8">
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-blue-600/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <div className="text-blue-800 text-sm font-bold flex items-center justify-center">
                                    <UserRoundCheck />
                                </div>
                            </div>
                            <div className="bg-green-500/20 flex justify-center items-center rounded-sm px-2 py-1">
                                <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">
                                    <span className="flex items-center justify-center" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 16l6-6 4 4 6-6" />
                                            <path d="M14 8h6v6" />
                                        </svg>
                                    </span>
                                    +12%
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Total Verifications</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.totalCustomers}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-yellow-400/30 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <div className="text-orange-600 text-sm font-bold flex items-center justify-center">
                                    <ClipboardClock />
                                </div>
                            </div>
                            <div className="bg-yellow-400/30 flex justify-center items-center rounded-sm px-2 py-1">
                                <div className="text-orange-600 text-[10px] font-bold flex items-center justify-center gap-1 truncate">
                                    <span className="flex items-center justify-center" aria-hidden="true">
                                        <Clock />
                                    </span>
                                    8m avg
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Pending Review</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.pendingReviews}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-green-500/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <div className="text-green-700 text-sm font-bold flex items-center justify-center">
                                    <ShieldCheck />
                                </div>
                            </div>
                            <div className="bg-green-500/20 flex justify-center items-center rounded-sm px-2 py-1">
                                <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">
                                    99.2% Rate
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Approved</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.verifiedToday}</p>
                        </div>
                    </div>
                    
                    <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                        <div className="flex flex-row justify-between items-start gap-1">
                            <div className="bg-red-600/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">
                                <div className="text-red-700 text-sm font-bold flex items-center justify-center">
                                    <TriangleAlert />
                                </div>
                            </div>
                            <div className="bg-red-600/20 flex justify-center items-center rounded-sm px-2 py-1 truncate">
                                <div className="text-red-700 text-[10px] font-bold flex items-center justify-center gap-1">
                                    High Priority
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-gray-500 truncate">Risk Alerts</p>
                            <p className="text-2xl font-bold text-gray-900 leading-none">{stats.highRisk}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row justify-between gap-4 mt-7">
                    <div className="flex flex-col w-full lg:w-[70%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between hover:shadow-md hover:-translate-y-1 transition-all duration-300 bg-white">
                        <div className="flex flex-row justify-between items-center mb-4">
                            <h2 className="font-bold">Verification Activity</h2>
                            <div className="flex flex-row">
                                <span className="flex items-center mr-1 text-blue-600" aria-hidden="true">
                                    <svg viewBox="0 0 8 8" className="h-2.5 w-2.5" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="4" cy="4" r="4" />
                                    </svg>
                                </span>
                                <p className="mr-1">Approved</p>
                                <span className="flex items-center mr-1 text-red-600" aria-hidden="true">
                                    <svg viewBox="0 0 8 8" className="h-2.5 w-2.5" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="4" cy="4" r="4" />
                                    </svg>
                                </span>
                                <p>Risk</p>
                            </div>
                        </div>
                        <div className="flex flex-row justify-between w-full px-2 mt-auto">
                            <p className="text-sm text-black truncate">Monday</p>
                            <p className="text-sm text-black truncate">Tuesday</p>
                            <p className="text-sm text-black truncate">Wednesday</p>
                            <p className="text-sm text-black truncate">Thursday</p>
                            <p className="text-sm text-black truncate">Friday</p>
                            <p className="text-sm text-black truncate">Saturday</p>
                            <p className="text-sm text-black truncate">Sunday</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col w-full lg:w-[35%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between gap-10 hover:shadow-md hover:-translate-y-1 transition-all duration-300 bg-white">
                        <div className="flex flex-row">
                            <h2 className="font-bold">High Risk Alerts</h2>
                            <Link href="#" className="text-sm text-blue-700 ml-auto hover:underline">View All</Link>
                        </div>
                        <div className="flex flex-col justify-between gap-10">
                            <div className="flex flex-row gap-5 cursor-pointer hover:bg-gray-200 p-2 rounded-sm h-full">
                                <div className="bg-red-700/20 p-2 rounded-lg w-11 h-11">
                                    <span className="text-red-700">
                                        <Gavel />
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5 ">
                                    <p className="text-sm font-semibold text-gray-900">Johanathan Vance</p>
                                    <p className="text-sm text-gray-500">PEP Match identified</p>
                                </div>
                                <p className="text-sm text-gray-900 mt-2">2m ago</p>
                            </div>
                            <div className="flex flex-row gap-5 cursor-pointer hover:bg-gray-200 p-2 rounded-sm h-full">
                                <div className="bg-red-700/20 p-2 rounded-lg w-11 h-11">
                                    <span className="text-red-700">
                                        <Flag />
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-sm font-semibold text-gray-900">Sarrah McHale</p>
                                    <p className="text-sm text-gray-500">IP Anomaly: Moscow</p>
                                </div>
                                <p className="text-sm text-gray-900 mt-2">1h ago</p>
                            </div>
                            <div className="flex flex-row gap-5 cursor-pointer hover:bg-gray-200 p-2 rounded-sm h-full">
                                <div className="bg-red-700/20 p-2 rounded-lg w-11 h-11">
                                    <span className="text-red-700">
                                        <Earth />
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-sm font-semibold text-gray-900">Zeno Logistics Ltd</p>
                                    <p className="text-sm text-gray-500">Sanctions List Hit</p>
                                </div>
                                <p className="text-sm text-gray-900 mt-2">3h ago</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 bg-gray-400/20 p-4 lg:mx-auto mx-2 rounded-lg">
                            <p>AI-driven risk scoring is currently monitoring 842 active sessions</p>
                            <div className="w-full bg-white h-[10px] rounded-sm">
                                <div className="bg-blue-700 h-full w-[75%] rounded-sm" ></div>
                            </div>
                        </div>
                    </div> 
                </div>
                
                {loading ? (
                    <div className="w-full bg-white border border-gray-400 rounded-md p-8 text-center text-gray-500 font-medium">
                        Loading KYC analysis data...
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 mt-8">
                        <VerificationTable data={requestsData} />
                    </div>
                )}
            </div>
        </div>
    );
}