"use client"
import Link from "next/link";
import VerificationTable from "@/components/VerificationTable";
import { 
    Calendar, Download, ChevronDown, Shield, ClipboardClock, 
    Clock, ShieldCheck, TriangleAlert, Gavel, Flag, Earth, 
    TrendingUp, TrendingDown, Minus
} from "lucide-react";
import Header from "@/components/header";

const recentRequestsData = [
    {
        id: 1,
        Avatar:"EL",
        Nom: "Eleanor Lewis",
        Email: "e.lewis@corporate.com",
        Type: "Individual KYC",
        Submitted: "Oct 24, 14:20",
        Status: "verified",
        Score: "98/100",
    },
    {
        id: 2,
        Avatar:"MR",
        Nom: "Marcus Rossi",
        Email: "m.rossi@globex.io",
        Type: "Corporate KYB",
        Submitted: "Oct 24, 13:45",
        Status: "pending",
        Score: "--",
    },
    {
        id: 3,
        Avatar:"BT",
        Nom: "Braker Tech Ltd",
        Email: "complance@braker.net",
        Type: "Entity Screening",
        Submitted: "Oct 24, 11:12",
        Status: "rejected",
        Score: "12/100",
    },
    {
        id: 4,
        Avatar:"SK",
        Nom: "Sienna Kim",
        Email: "skim@creative.co",
        Type: "Individual KYC",
        Submitted: "Oct 24, 09:30",
        Status: "verified",
        Score: "94/100",
    }
];

export default function Report() {
    return (
        <div className="w-full">
            <Header />
            <div className="flex flex-col gap-8 mb-8 bg-gray-100 px-8 lg:px-12 mt-8">
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
                    <div className="flex flex-col w-full lg:w-[70%] border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300">{/*Graphique de volume de vérification*/}
                        <h2 className="font-bold text-lg mb-5">Verification Volume Over Time</h2>
                        <div className="flex flex-row items-end justify-between h-64 gap-3 mb-2 px-2 border border-t-0 border-gray-200">
                            {[
                                { h: "40%", v: "400" },
                                { h: "55%", v: "550" },
                                { h: "45%", v: "450" },
                                { h: "70%", v: "700" },
                                { h: "65%", v: "650" },
                                { h: "85%", v: "850" },
                                { h: "100%", v: "1000" }
                            ].map((item, index) => (
                                <div key={index} className="flex flex-col items-center flex-1 group gap-2 relative h-full justify-end">
                                    <div className="hidden group-hover:flex bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-10">
                                        {item.v}
                                    </div>
                                    <div 
                                        style={{ height: item.h }}
                                        className="w-full bg-blue-100 rounded-t-sm transition-all duration-300 hover:bg-blue-700 cursor-pointer"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-row justify-between w-full text-xs text-gray-500 font-medium px-2">
                            <p>Mon</p><p>Tue</p><p>Wed</p><p>Thu</p><p>Fri</p><p>Sat</p><p>Sun</p>
                        </div>
                    </div>
                    /*A continuer*/
                    <div className="flex flex-col w-full lg:w-[35%] border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all duration-300">
                        <h2 className="font-bold text-lg mb-6">High Risk Alerts</h2>
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center gap-4">
                                <div className="bg-red-100 p-3 rounded-xl text-red-700">
                                    <Gavel className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Johanathan Vance</p>
                                    <p className="text-xs text-gray-500">PEP Match identified</p>
                                </div>
                                <p className="text-xs text-gray-400 ml-auto">2m ago</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="bg-red-100 p-3 rounded-xl text-red-700">
                                    <Flag className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Sarrah McHale</p>
                                    <p className="text-xs text-gray-500">IP Anomaly: Moscow</p>
                                </div>
                                <p className="text-xs text-gray-400 ml-auto">1h ago</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="bg-red-100 p-3 rounded-xl text-red-700">
                                    <Earth className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Zeno Logistics Ltd</p>
                                    <p className="text-xs text-gray-500">Sanctions List Hit</p>
                                </div>
                                <p className="text-xs text-gray-400 ml-auto">3h ago</p>
                            </div>
                        </div>
                    </div>
                </div>
                <VerificationTable data={recentRequestsData} />
            </div>
        </div>
    );
}