"use client"

export default function VerificationLogTable({ data }: { data: any[] }) {
    const getStatusStyle = (status: string) => {
        const safeStatus = String(status || "").toLowerCase();
        if (safeStatus === "verified") return "bg-green-100 text-green-700";
        if (safeStatus === "pending") return "bg-yellow-100 text-yellow-700";
        if (safeStatus === "action required") return "bg-red-100 text-red-700";
        return "bg-gray-100 text-gray-700";
    };
    
    const getAvatarStyle = (status: string) => {
        const avStatus = String(status || "").toLowerCase();
        if (avStatus === "verified") return "bg-blue-100/50 text-blue-700";
        if (avStatus === "pending") return "bg-yellow-100/50 text-yellow-700";
        if (avStatus === "action required") return "bg-red-100/50 text-red-700";
        return "bg-blue-100/50 text-blue-700";
    };
    
    const getRiskStyle = (risk: string) => {
        const safeRisk = String(risk || "").toLowerCase();
        if (safeRisk === "low") return "bg-blue-100 text-blue-600";
        if (safeRisk === "medium") return "bg-yellow-100 text-yellow-600";
        if (safeRisk === "high") return "bg-red-100 text-red-600";
        return "bg-gray-100 text-gray-700";
    };

    return(
        <div className="flex flex-col w-full border border-gray-400 rounded-md justify-between overflow-hidden">{/*Section des Recent Verification Requests*/}
                        <div className="flex flex-row justify-between p-4 md:p-6 border-b border-gray-400 bg-white items-center">{/*Recent Verification Requests title et deux icones*/}
                            <h2 className="font-bold text-lg md:text-xl text-gray-900">Verification Log</h2>
                            <div className="flex flex-row gap-2 items-center text-sm">{/*les deux icones de filtre et trois points verticale*/}
                                <span className="text-gray-500">{/*Icone de filtre*/}Show</span>
                                <span className="text-blue-700 font-medium flex items-center cursor-pointer hover:underline">{/*Icone de trois points verticale*/}
                                    25 rows
                                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                </span>
                            </div> 
                        </div>
                        <div className="w-full">{/*Le tableau des recent verification requests*/}
                                <table className="w-full text-left border-collapse table-fixed">
                                    <thead className="bg-white text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-400">
                                        <tr>
                                            <td className="w-[60%] md:w-[35%] lg:w-[30%] px-4 py-3 md:px-2 lg:px-6 md:py-4">CUSTOMER NAME</td>
                                            <td className="w-[40%] md:w-[25%] lg:w-[20%] px-4 py-3 md:px-2 lg:px-6 md:py-4">VERIFICATION STATUS</td>
                                            <td className="hidden md:table-cell md:w-[20%] lg:w-[15%] px-4 py-3 md:px-2 lg:px-6 md:py-4 text-center">RISK LEVEL</td>
                                            <td className="hidden md:table-cell md:w-[20%] lg:w-[20%] px-4 py-3 md:px-2 lg:px-6 md:py-4">DATE ADDED</td>
                                            <td className="hidden lg:table-cell lg:w-[15%] px-4 py-3 lg:px-6 md:py-4 text-center">ACTIONS</td>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-400 bg-white text-xs md:text-sm text-gray-700">
                                        {data && data.map((row) => (
                                            <tr className="bg-white transition-colors hover:bg-gray-50" key={row.id}>{/*1ère ligne du tableau*/}
                                                <td className="px-4 py-4 md:px-2 lg:px-6 md:py-5 align-top md:align-middle">
                                                    <div className="flex flex-row gap-2 lg:gap-3 items-center">{/*premiere case de la ligne avec l'avatar et le nom du client*/}
                                                        <div className={`font-bold rounded-xl w-10 h-10 md:w-11 md:h-11 flex items-center justify-center shrink-0 ${getAvatarStyle(row.Status)}`}>{/*Avatar du client et nom email*/}
                                                            {row.Avatar || "NA"}
                                                        </div>
                                                        <div className="flex flex-col gap-0.5 min-w-0 w-full break-words">{/*Nom et email du client*/}
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
                                                <td className="hidden md:table-cell px-4 py-4 md:px-2 lg:px-6 md:py-5 text-gray-600 align-top md:align-middle text-center">
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
                        <footer className="flex flex-row justify-between items-center bg-white p-4 border-t border-gray-400">{/*Footer avec le bouton view all*/}
                            <p className="text-[10px] md:text-xs font-medium text-gray-500 ml-2">Showing {data ? data.length : 0} to 25 of 12,482 results</p>
                            <div className="flex flex-row gap-1 items-center shrink-0">{/*Boutons de pagination*/}
                                <button className="bg-white w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors">{/*Button page precedente*/}
                                    <svg viewBox="0 0 24 24" className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                                </button>
                                <button className="bg-blue-700 text-white w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded text-xs md:text-sm font-bold cursor-pointer">{/* le nbr de la page ou on est actuellement*/}1</button>
                                <button className="bg-white text-gray-700 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 text-xs md:text-sm font-medium cursor-pointer transition-colors">2</button>
                                <button className="bg-white text-gray-700 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 text-xs md:text-sm font-medium cursor-pointer transition-colors">3</button>
                                <span className="text-gray-500 px-0.5 md:px-1 text-xs md:text-sm font-medium">...</span>
                                <button className="bg-white text-gray-700 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 text-xs md:text-sm font-medium cursor-pointer transition-colors">499</button>
                                <button className="bg-white w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors">{/*Button page suivante*/}
                                    <svg viewBox="0 0 24 24" className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                                </button>
                            </div>
                        </footer>

                    </div>
    );
}