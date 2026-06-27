"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";

interface VerificationLogTableProps {
    data: any[];
    currentPage: number;
    totalPages: number;
    totalItems: number;
    currentLimit: number;
    onNextPage: () => void;
    onPrevPage: () => void;
    onLimitChange : (newLimit: number) => void;
}


export default function VerificationLogTable({
    data,
    currentPage,
    totalPages,
    totalItems,
    currentLimit,
    onNextPage,
    onPrevPage,
    onLimitChange
}: VerificationLogTableProps) {
    
    const router = useRouter();

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
   
    const getStatusStyle = (status: string) => {
        const safeStatus = String(status || "").toLowerCase();
        if (safeStatus === "verified") return "bg-green-100 text-green-700";
        if (safeStatus === "pending") return "bg-yellow-100 text-yellow-700";
        if (safeStatus === "action required" || safeStatus === "rejected") return "bg-red-100 text-red-700";
        return "bg-gray-100 text-gray-700";
    };
   
    const getAvatarStyle = (status: string) => {
        const avStatus = String(status || "").toLowerCase();
        if (avStatus === "verified") return "bg-blue-100/50 text-blue-700";
        if (avStatus === "pending") return "bg-yellow-100/50 text-yellow-700";
        if (avStatus === "action required" || avStatus === "rejected") return "bg-red-100/50 text-red-700";
        return "bg-blue-100/50 text-blue-700";
    };
   
    const getRiskStyle = (risk: string) => {
        const safeRisk = String(risk || "").toLowerCase();
        if (safeRisk === "low") return "bg-blue-100 text-blue-600";
        if (safeRisk === "medium") return "bg-yellow-100 text-yellow-600";
        if (safeRisk === "high") return "bg-red-100 text-red-600";
        return "bg-gray-100 text-gray-700";
    };

    const handleSelectLimit = (newLimit: number) => {
        onLimitChange(newLimit);
        setIsDropdownOpen(false);
    };

    return(
        <div className="flex flex-col w-full border border-gray-400 rounded-md justify-between overflow-hidden">
            <div className="flex flex-row justify-between p-4 md:p-6 border-b border-gray-400 bg-white items-center">
                <h2 className="font-bold text-lg md:text-xl text-gray-900">Verification Log</h2>
                
                {/* LA CORRECTION EST ICI : on a ajouté 'relative' à ce div pour que le menu s'accroche ici */}
                <div className="flex flex-row gap-2 items-center text-sm relative">
                    <span className="text-gray-500">Show</span>
                    
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)} 
                        className="text-blue-700 font-medium flex items-center cursor-pointer hover:underline bg-transparent border-none p-0 outline-none"
                    >
                        { currentLimit } rows
                        {/* La flèche pointe vers le bas par défaut (rotation de 180 si le menu est ouvert) */}
                        <svg 
                            className={`w-4 h-4 ml-1 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} 
                            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                            <path d="m6 9 6 6 6-6"/>
                        </svg>
                    </button>
                    
                    {/* Le menu déroulant qui s'affiche sous la flèche */}
                    {isDropdownOpen && (
                        <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 shadow-lg rounded-md py-1 z-50 w-24">
                            <button onClick={() => handleSelectLimit(5)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-blue-700 cursor-pointer">5 rows</button>
                            <button onClick={() => handleSelectLimit(10)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-blue-700 cursor-pointer">10 rows</button>
                            <button onClick={() => handleSelectLimit(20)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-blue-700 cursor-pointer">20 rows</button>
                        </div>
                    )}
                </div>
            </div>
           
            <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse table-fixed min-w-[600px]">
                    <thead className="bg-white text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-400">
                        <tr>
                            <td className="w-[45%] md:w-[35%] lg:w-[30%] px-4 py-3 md:px-2 lg:px-6 md:py-4">CUSTOMER NAME</td>
                            <td className="w-[30%] md:w-[25%] lg:w-[20%] px-4 py-3 md:px-2 lg:px-6 md:py-4">VERIFICATION STATUS</td>
                            <td className="w-[25%] md:w-[20%] lg:w-[15%] px-4 py-3 md:px-2 lg:px-6 md:py-4 text-center">RISK LEVEL</td>
                            <td className="hidden md:table-cell md:w-[20%] lg:w-[20%] px-4 py-3 md:px-2 lg:px-6 md:py-4">DATE ADDED</td>
                            <td className="hidden lg:table-cell lg:w-[15%] px-4 py-3 lg:px-6 md:py-4 text-center">ACTIONS</td>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-400 bg-white text-xs md:text-sm text-gray-700">
                        {data && data.map((row: any, index: number) => (
                            <tr key={row.id || index} onClick={() => router.push(`/dashboard/customers/${row.id}`)} className="bg-white hover:bg-blue-50/50 transition-colors cursor-pointer" >
                                <td className="px-4 py-4 md:px-2 lg:px-6 md:py-5 align-top md:align-middle">
                                    <div className="flex flex-row gap-2 lg:gap-3 items-center">
                                        <div className={`font-bold rounded-xl w-10 h-10 md:w-11 md:h-11 flex items-center justify-center shrink-0 ${getAvatarStyle(row.Status)}`}>
                                            {row.Avatar || "NA"}
                                        </div>
                                        <div className="flex flex-col gap-0.5 min-w-0 w-full break-words">
                                            <p className="font-semibold text-gray-900 whitespace-normal break-words">{row.Nom}</p>
                                            <p className="text-gray-500 whitespace-normal break-all md:break-words">{row.Email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4 md:px-2 lg:px-6 md:py-5 text-gray-600 align-top md:align-middle">
                                    <span className={`px-2 md:px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1.5 w-max max-w-full ${getStatusStyle(row.Status)}`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>
                                        <span className="truncate">{row.Status}</span>
                                    </span>
                                </td>
                                <td className="px-4 py-4 md:px-2 lg:px-6 md:py-5 text-gray-600 align-top md:align-middle text-center">
                                    <span className={`px-3 py-1 rounded-full text-[10px] md:text-xs font-bold inline-flex items-center justify-center w-max mx-auto ${getRiskStyle(row.RiskLevel)}`}>
                                        {row.RiskLevel}
                                    </span>
                                </td>
                                <td className="hidden md:table-cell px-4 py-4 md:px-2 lg:px-6 md:py-5 text-gray-800 align-top md:align-middle whitespace-normal break-words font-medium">
                                    {row.DateAdded}
                                </td>
                                <td className="hidden lg:table-cell px-4 lg:px-6 py-4 md:py-5 text-gray-500 align-top md:align-middle text-center">
                                    <button className="hover:bg-gray-100 p-1.5 rounded cursor-pointer transition-colors flex mx-auto">
                                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <footer className="flex flex-row justify-between items-center bg-white p-4 border-t border-gray-400">
                <p className="text-[10px] md:text-xs font-medium text-gray-500 ml-2">
                    Showing {data ? data.length : 0} results out of {totalItems}
                </p>
               
                <div className="flex flex-row gap-1 items-center shrink-0">
                    <button
                        onClick={onPrevPage}
                        disabled={currentPage === 1}
                        className="bg-white w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg viewBox="0 0 24 24" className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                   
                    <span className="text-xs md:text-sm font-medium text-gray-700 px-2">
                        Page {currentPage} of {totalPages || 1}
                    </span>
                   
                    <button
                        onClick={onNextPage}
                        disabled={currentPage >= totalPages || totalPages === 0}
                        className="bg-white w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg viewBox="0 0 24 24" className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                </div>
            </footer>
        </div>
    );
}