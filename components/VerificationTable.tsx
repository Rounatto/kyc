"use client"

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function VerificationTable({ data }: { data: any[] }) {
    const router = useRouter();

    const getStatusStyle = (status: string) => {
        const safeStatus = String(status || "").toLowerCase();
        if (safeStatus === "verified") return "bg-green-100 text-green-700";
        if (safeStatus === "pending") return "bg-yellow-100 text-yellow-700";
        if (safeStatus === "rejected") return "bg-red-100 text-red-700";
        return "bg-gray-100 text-gray-700";
    };

    const getAvatarStyle = (status: string) => {
        const avStatus = String(status || "").toLowerCase();
        if (avStatus === "verified") return "bg-blue-100/50 text-blue-700";
        if (avStatus === "rejected") return "bg-red-100/50 text-red-700";
        return "bg-blue-100/50 text-blue-700";
    };

    const getScoreStyle = (status: String) => {
        const scStatus = String(status || "").toLowerCase();
        if (scStatus === "rejected") return "text-red-700";
        return "text-gray-600";
    };

    return(
        <div className="flex flex-col w-full border border-gray-400 rounded-md justify-between overflow-hidden">
            {/* Header du tableau */}
            <div className="flex flex-row justify-between p-3 md:p-5 border-b border-gray-400 bg-white">
                <h2 className="font-bold text-base md:text-lg">Recent Verification Requests</h2>
                <div className="flex flex-row gap-2">
                    <span className="text-gray-900 hover:bg-gray-200 p-1 rounded-xs cursor-pointer">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12m-9 6h6"/></svg>
                    </span>
                    <span className="text-gray-900 hover:bg-gray-200 p-1 rounded-xs cursor-pointer">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                    </span>
                </div> 
            </div>

            {/* Corps du tableau */}
            <div className="w-full">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-gray-200/20 text-[10px] md:text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                        <tr>
                            <td className="w-[60%] md:w-[35%] lg:w-[30%] px-4 py-3 md:px-2 lg:px-6 md:py-4">CUSTOMER</td>
                            <td className="w-[40%] md:w-[15%] lg:w-[15%] px-4 py-3 md:px-2 lg:px-6 md:py-4">TYPE</td>
                            <td className="hidden md:table-cell md:w-[16%] lg:w-[15%] px-4 py-3 md:px-2 lg:px-6 md:py-4">SUBMITTED</td>
                            <td className="hidden md:table-cell md:w-[22%] lg:w-[15%] px-4 py-3 md:px-2 lg:px-6 md:py-4">STATUS</td>
                            <td className="hidden md:table-cell md:w-[12%] lg:w-[10%] px-4 py-3 md:px-2 lg:px-6 md:py-4">SCORE</td>
                            <td className="hidden lg:table-cell lg:w-[15%] px-4 py-3 lg:px-6 md:py-4 text-center">ACTION</td>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-300 bg-white text-xs md:text-sm text-gray-700">
                        {data && data.map((row: any, index: number) => (
                            <tr key={row.id || index} onClick={() => router.push(`/dashboard/customers/${row.id}`)} className="bg-white hover:bg-blue-50/50 transition-colors cursor-pointer">
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
                                <td className="px-4 py-4 md:px-2 lg:px-6 md:py-5 text-gray-600 align-top md:align-middle whitespace-normal break-words">{row.Type}</td>
                                <td className="hidden md:table-cell px-4 py-4 md:px-2 lg:px-6 md:py-5 text-gray-600 align-top md:align-middle whitespace-normal break-words">{row.Submitted}</td>
                                <td className="hidden md:table-cell px-4 py-4 md:px-2 lg:px-6 md:py-5 text-gray-600 align-top md:align-middle">
                                    <span className={`px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1.5 w-max max-w-full ${getStatusStyle(row.Status)}`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>
                                        <span className="truncate">{row.Status}</span>
                                    </span>
                                </td>
                                <td className={`hidden md:table-cell px-4 py-4 md:px-2 lg:px-6 md:py-5 ${getScoreStyle(row.Status)} align-top md:align-middle whitespace-normal break-words font-bold`}>{row.Score}</td>
                                <td className="hidden lg:table-cell px-4 lg:px-6 py-4 md:py-5 text-gray-600 align-top md:align-middle text-center">
                                    <button className="text-blue-600 font-medium border border-blue-200/50 px-5 py-1.5 rounded hover:underline cursor-pointer transition-colors">
                                        Review
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Footer avec le bouton View All direct */}
            <footer className="flex flex-row justify-between items-center bg-gray-200/20 p-4 border-t border-gray-200">
                <p className="text-[10px] md:text-xs text-gray-900 ml-2">
                    Showing {data ? data.length : 0} recent requests
                </p>
                <Link 
                    href="/dashboard/customers" 
                    className="text-[15px] md:text-xs font-semibold text-gray-500 hover:text-gray-800 hover:underline transition-colors mr-2"
                >
                    View All
                </Link>
            </footer>
        </div>
    );
}