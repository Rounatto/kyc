"use client"
import Link from "next/link";
import { 
    Calendar, Download, ChevronDown, Shield,
    Clock, ShieldCheck, TriangleAlert, 
    TrendingUp, TrendingDown, Minus, RefreshCw
} from "lucide-react";
import Header from "@/components/header";
import { useState } from "react";

export default function Report() {
    const [action, setAction] = useState("");
    return (
        <div className="w-full">
            <Header />
            <div className="flex flex-col gap-8 mb-8 bg-gray-100 px-4 md:px-8 lg:px-12 mt-8">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end bg-gray-100 gap-4 lg:gap-0">
                    <div className="flex flex-col mb-2">
                        <h2 className="text-2xl font-bold text-gray-900">Reports and Analytics</h2>
                        <p className="text-sm text-gray-500">Overview of compliance performance and verifications</p>
                    </div>
                    <div className="flex flex-row gap-3 w-full lg:w-auto">
                        <button className="flex-1 lg:flex-none flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer lg:w-36 h-12 justify-center">
                            <Calendar className="w-4 h-4 text-gray-600" />
                            <p className="text-xs md:text-sm font-medium text-gray-700">Last 30 days</p>
                            <ChevronDown className="w-4 h-4 text-gray-600" />
                        </button>
                        <button className="flex-1 lg:flex-none flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer lg:w-36 h-12 justify-center">
                            <Download className="w-4 h-4 text-gray-600" />
                            <p className="text-xs md:text-sm font-medium text-gray-700">Export PDF/CSV</p>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full mt-2">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-36 hover:bg-gray-50 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-gray-500">Total Verifications</p>
                                <p className="text-2xl font-bold text-gray-900">12,842</p>
                            </div>
                            <div className="p-2 rounded-lg text-gray-200">
                                <Shield className="w-10 h-10" />
                            </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 mt-1">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            <p className="text-xs text-green-600 font-medium">+12% vs last month</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-36 hover:bg-gray-50 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-gray-500">Avg Processing Time</p>
                                <p className="text-2xl font-bold text-gray-900">4.5 min</p>
                            </div>
                            <div className="p-2 rounded-lg text-gray-200">
                                <Clock className="w-10 h-10" />
                            </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 mt-1">
                            <TrendingDown className="w-4 h-4 text-green-600" />
                            <p className="text-xs text-green-600 font-medium">-8% improvement</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-36 hover:bg-gray-50 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-gray-500">Success Rate</p>
                                <p className="text-2xl font-bold text-gray-900">94.2%</p>
                            </div>
                            <div className="p-2 rounded-lg text-gray-200">
                                <ShieldCheck className="w-10 h-10" />
                            </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 mt-1">
                            <Minus className="w-4 h-4 text-gray-400" />
                            <p className="text-xs text-gray-500 font-medium">Stable</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-36 hover:bg-gray-50 transition-all duration-300 cursor-default">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-gray-500">Flagged for Manual</p>
                                <p className="text-2xl font-bold text-gray-900">342</p>
                            </div>
                            <div className="p-2 rounded-lg text-gray-200">
                                <TriangleAlert className="w-10 h-10" />
                            </div>
                        </div>
                        <p className="text-xs text-red-600 font-medium mt-1">+3% vs last month</p>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row justify-between gap-4 mt-2">
                    <div className="flex flex-col w-full lg:w-[70%] border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300">
                        <h2 className="font-bold text-lg mb-8">Verification Volume Over Time</h2>
                        <div className="flex flex-row items-end justify-between h-64 gap-4 mb-6 px-2">
                            {[
                                { h: "40%", v: "300" },
                                { h: "55%", v: "400" },
                                { h: "45%", v: "450" },
                                { h: "65%", v: "600" },
                                { h: "55%", v: "500" },
                                { h: "80%", v: "750" },
                                { h: "95%", v: "900" }
                            ].map((item, index) => (
                                <div key={index} className="flex flex-col items-center flex-1 group gap-2 relative h-full justify-end">
                                    <div className="absolute -top-10 hidden group-hover:flex bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-10">
                                        {item.v}
                                    </div>
                                    <div 
                                        style={{ height: item.h }}
                                        className="w-full bg-blue-100 rounded-t-sm transition-all duration-300 group-hover:bg-blue-700 cursor-pointer"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-row justify-between w-full text-xs text-gray-500 font-medium px-2">
                            <p>Mon</p><p>Tue</p><p>Wed</p><p>Thu</p><p>Fri</p><p>Sat</p><p>Sun</p>
                        </div>
                    </div>

                    <div className="flex flex-col w-full lg:w-[35%] border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300">
                        <h2 className="font-bold text-lg mb-4">Status Distribution</h2>
                        
                        <div className="flex-1 flex flex-col items-center justify-center w-full relative my-4">
                            <svg viewBox="0 0 200 200" className="w-full max-w-[220px] h-auto drop-shadow-sm">
                                <rect x="45" y="45" width="110" height="110" rx="12" fill="none" stroke="#f3f4f6" strokeWidth="14" />
                                <text x="100" y="105" textAnchor="middle" fill="#111827" fontSize="28" fontWeight="bold">12k</text>
                                <text x="100" y="125" textAnchor="middle" fill="#6b7280" fontSize="10" fontWeight="bold">TOTAL</text>
                                
                                <path d="M 35 95 L 100 160" stroke="#ef4444" strokeWidth="12" strokeLinecap="butt" />
                                <path d="M 100 160 L 165 95 L 95 25" fill="none" stroke="#16a34a" strokeWidth="12" strokeLinecap="butt" strokeLinejoin="miter" />
                                <path d="M 55 35 L 165 75" stroke="#f59e0b" strokeWidth="12" strokeLinecap="butt" />
                            </svg>
                        </div>

                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 w-full mt-auto px-2">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-green-600 shrink-0"></div>
                                <p className="text-[11px] text-gray-500 font-medium truncate">Approved (75%)</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-yellow-500 shrink-0"></div>
                                <p className="text-[11px] text-gray-500 font-medium truncate">Pending (15%)</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-500 shrink-0"></div>
                                <p className="text-[11px] text-gray-500 font-medium truncate">Rejected (7%)</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-800 shrink-0"></div>
                                <p className="text-[11px] text-gray-500 font-medium truncate">Flagged (3%)</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col w-full border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden mt-2 hover:shadow-md transition-all duration-300">
                    <div className="flex flex-row justify-between items-center p-4 md:p-6 border-b border-gray-100 bg-white">
                        <h2 className="font-bold text-base md:text-lg text-gray-900 shrink-0">Recent Reports</h2>
                        <Link href="#" className="text-xs md:text-sm font-medium text-blue-700 hover:underline shrink-0">View all</Link>
                    </div>
                    
                    <div className="w-full">
                        <table className="w-full text-left border-collapse table-fixed">
                            <thead className="text-[9px] md:text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/30">
                                <tr>
                                    <th className="w-[32%] md:w-[32%] px-2 md:px-4 py-3 md:py-4">REPORT NAME</th>
                                    <th className="w-[15%] md:w-[12%] px-2 md:px-4 py-3 md:py-4">TYPE</th>
                                    <th className="w-[23%] md:w-[25%] px-2 md:px-4 py-3 md:py-4">GENERATION DATE</th>
                                    <th className="w-[20%] md:w-[20%] px-2 md:px-4 py-3 md:py-4">STATUS</th>
                                    <th className="w-[10%] md:w-[11%] px-2 md:px-4 py-3 md:py-4 text-center">ACTION</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-[10px] md:text-sm text-gray-700 font-medium">
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="px-2 md:px-4 py-3 md:py-4 break-words whitespace-normal text-gray-900 font-bold">
                                        Monthly KYC Summary - October
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4">
                                        <span className="bg-blue-100 text-blue-600 px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[8px] md:text-[10px] font-bold">KYC</span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4 break-words whitespace-normal text-gray-500">
                                        01 Nov 2023, 08:30
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4">
                                        <span className="bg-green-100/50 text-green-700 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full text-[8px] md:text-xs font-medium flex items-center gap-1 md:gap-1.5 w-max max-w-full">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-600 shrink-0"></div>
                                            <span className="truncate">Ready</span>
                                        </span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4 text-center">
                                        <Download className="w-4 h-4 md:w-5 md:h-5 text-blue-600 hover:text-blue-800 cursor-pointer mx-auto shrink-0" />
                                    </td>
                                </tr>
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="px-2 md:px-4 py-3 md:py-4 break-words whitespace-normal text-gray-900 font-bold">
                                        AML Compliance Alert - Q3
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4">
                                        <span className="bg-red-100 text-red-600 px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[8px] md:text-[10px] font-bold">AML</span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4 break-words whitespace-normal text-gray-500">
                                        28 Oct 2023, 14:15
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4">
                                        <span className="bg-green-100/50 text-green-700 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full text-[8px] md:text-xs font-medium flex items-center gap-1 md:gap-1.5 w-max max-w-full">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-600 shrink-0"></div>
                                            <span className="truncate">Ready</span>
                                        </span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4 text-center">
                                        <Download className="w-4 h-4 md:w-5 md:h-5 text-blue-600 hover:text-blue-800 cursor-pointer mx-auto shrink-0" />
                                    </td>
                                </tr>
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="px-2 md:px-4 py-3 md:py-4 break-words whitespace-normal text-gray-900 font-bold">
                                        Corporate Entity Audit (KYB)
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4">
                                        <span className="bg-gray-200 text-gray-700 px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[8px] md:text-[10px] font-bold">KYB</span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4 break-words whitespace-normal text-gray-500">
                                        Today, 10:05
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4">
                                        <span className="bg-orange-100/50 text-orange-700 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full text-[8px] md:text-xs font-medium flex items-center gap-1 md:gap-1.5 w-max max-w-full">
                                            <RefreshCw className="w-2 h-2 md:w-3 md:h-3 shrink-0" />
                                            <span className="truncate">In progress</span>
                                        </span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 md:py-4 text-center">
                                        <Download className="w-4 h-4 md:w-5 md:h-5 text-gray-400 hover:text-gray-600 cursor-pointer mx-auto shrink-0" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}