"use client"
import Link from "next/link";
import VerificationLogTable from "@/components/VerificationLogTable";

const recentRequestsData = [
    {/*entre{} c est la une (row)*/
        id: 1,
        Avatar:"JD",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Jameson Dillinger",
        Email: "j.dillinger@corporate.com",
        Status: "verified",
        RiskLevel: "Low",
        DateAdded: "Oct 12, 2023 14:32 PM"
        
    },
    {
        id: 2,
        Avatar:"MW",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Mariana Woods",
        Email: "m.rossi@globex.io",
        Status: "pending",
        RiskLevel: "Medium",
        DateAdded: "Oct 14, 2023 09:15 AM"
    },
    {
        id: 3,
        Avatar:"AK",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Alper Kamu",
        Email: "akamu@braker.net",
        Status: "action required",
        RiskLevel: "High",
        DateAdded: "Oct 14, 2023 11:04 AM"
    },
    {
        id: 4,
        Avatar:"SH",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Sarah Henderson",
        Email: "s.henderson@creative.co",
        Status: "verified",
        RiskLevel: "Low",
        DateAdded: "Oct 15, 2023 08:45 AM"
    }
];
export default function CustomerPage() {
    return (
        <div className="w-full">{/*page entière*/}
            <header className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4 md:pb-5 mb-6 md:mb-8 bg-white shadow-sm px-4 lg:px-8">{/*Header*/}
                
                <div className="flex items-center gap-4 lg:gap-8 flex-1">{/*Logo et search*/}

                            <div className="flex relative flex-row mt-2 md:mt-3 w-full max-w-[150px] sm:max-w-xs lg:max-w-[340px] border border-gray-300 rounded-lg text-sm outline-none bg-gray-200/50 text-gray-700 placeholder-gray-400">{/*Search bar*/}
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">{/*Icone de loupe*/}
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="6.5" />
                                        <path d="m16.2 16.2 4.1 4.1" />
                                    </svg>
                                </span>
                                <input type="text" placeholder="Search customers..." className="w-full bg-transparent border-transparent rounded-lg py-2 pl-10 pr-3 text-sm outline-none transition-all text-gray-800 placeholder-gray-600 truncate"/>{/*Input de recherche*/}
                            </div>
                    </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-2 md:mt-3 shrink-0">{/*Actions secondaires en haut a droite*/}
                    <button className="text-gray-700 hover:text-gray-700 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200">{/*Button sonnerie*/}
                        <span className="sr-only">Notifications</span>
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
                            <path d="M10 20a2 2 0 0 0 4 0" />
                        </svg>
                    </button>
                    <button className="text-gray-700 hover:text-gray-700 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200">{/*Button information*/}
                        <span className="sr-only">Information</span>
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 10v6" />
                            <path d="M12 7h.01" />
                        </svg>
                    </button>
                    <div className="w-9 h-10 mr-2 md:mr-3 bg-gray-300 rounded-xl overflow-hidden border border-gray-200 cursor-pointer">{/*contenaire de l'image de profil*/}
                        <div className="w-full h-full bg-slate-400"></div>{/*Image de profil*/}
                    </div>
                </div>
            </header>
            <div className="flex flex-col gap-8 mb-8 bg-gray-100 px-8 lg:px-12 mt-8 ">{/* section de ce qui il y a a droite*/}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end bg-gray-100 gap-4 lg:gap-0">{/*Section de titre et boutons*/}
                    <div className="flex flex-col mb-2">{/*Titre et sous-titre*/}
                        <p className="text-sm text-gray-700">Organization / <span className="text-blue-700">Customers</span></p>
                        <h2 className="text-2xl font-bold text-gray-900">Customer Directory</h2>{/*Titre*/}
                        <p className="text-sm text-gray-500">Manage identity verifications and monitor entreprise risk profiles.</p>{/*Sous-titre*/}
                    </div>
                    <div className="flex flex-row gap-3 w-full lg:w-auto">{/*les deux boutons*/}
                        <button className="flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-gray-300 border border-gray-400 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer lg:w-36 h-12 justify-center">{/*Button Last 30 days*/}
                            <span className="flex items-center justify-center text-gray-600" aria-hidden="true">
                                lo
                            </span>
                            <p className="text-xs md:text-sm font-medium text-gray-800 whitespace-nowrap">Filter</p>
                        </button>
                        <button className=" flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-gray-300 border border-gray-400 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer lg:w-36 h-12 justify-center">{/*Button Export*/}
                            <span className="flex items-center justify-center text-gray-700" aria-hidden="true">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3v12" />
                                    <path d="m7 10 5 5 5-5" />
                                    <path d="M5 21h14" />
                                </svg>
                            </span>
                            <p className="text-xs md:text-sm font-medium text-gray-800 whitespace-nowrap">Export CSV</p>
                        </button>
                    </div>
                </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 w-full mt-8">{/* section des 4 cartes de résumé*/}
                        <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*1ère carte*/}
                            <div className="flex flex-row justify-between items-start w-full">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">Total Customers</p>
                                <div className="text-blue-800 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
                                    <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
                                                <circle cx="16" cy="10" r="4" fill="currentColor" />
                                                <path d="M7.5 25c0-4.7 3.7-8.5 8.5-8.5s8.5 3.8 8.5 8.5" fill="currentColor" />
                                                <path d="M21.8 18.2l2.1 2.1 4.3-4.3" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>       
                            </div>
                            <div className="flex flex-row justify-between items-end w-full mt-4">{/*Chiffre et pourcentage*/}
                                <p className="text-2xl font-bold text-gray-900 leading-none">12,482</p>
                                <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
                                        +4.2%
                                </div>
                            </div>
                        </div>
                        <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*2ème carte*/}
                            <div className="flex flex-row justify-between items-start w-full">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">Verified Today</p>
                                <div className="text-green-700 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
                                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                                            <path d="M12 2l6 2v5c0 4.5-2.5 8.1-6 9-3.5-.9-6-4.5-6-9V4l6-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M8.5 12.3l2.5 2.5L15.2 10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                    </svg>
                                </div>       
                            </div>
                            <div className="flex flex-row justify-between items-end w-full mt-4">{/*Chiffre et pourcentage*/}
                                <p className="text-2xl font-bold text-gray-900 leading-none">842</p>
                                <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
                                        +12%
                                </div>
                            </div>
                        </div>
                        <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*3ème carte*/}
                            <div className="flex flex-row justify-between items-start w-full">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">Pending Reviews</p>
                                <div className="text-yellow-500 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
                                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
                                            <rect x="3" y="6" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
                                            <rect x="8.5" y="4.6" width="6" height="1.6" rx="0.4" fill="currentColor" stroke="currentColor" strokeWidth="0.7" />
                                            <circle cx="6.5" cy="10.8" r="0.5" fill="currentColor" />
                                            <circle cx="6.5" cy="12.8" r="0.5" fill="currentColor" />
                                            <g transform="translate(15,13)">
                                                <circle cx="2.2" cy="2.2" r="2.1" fill="#ffffff" stroke="currentColor" strokeWidth="1.05" />
                                                <path d="M2.2 1.5v1" stroke="currentColor" strokeWidth="0.95" strokeLinecap="round" />
                                                <path d="M2.2 2.2h0.8" stroke="currentColor" strokeWidth="0.95" strokeLinecap="round" />
                                            </g>
                                    </svg>
                                </div>       
                            </div>
                            <div className="flex flex-row justify-between items-end w-full mt-4">{/*Chiffre et pourcentage*/}
                                <p className="text-2xl font-bold text-gray-900 leading-none">156</p>
                                <div className="text-gray-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
                                        <p className="text-gray-700">-2.1%</p>
                                </div>
                            </div>
                        </div>
                        <div className="w-full bg-white p-5 md:p-6 rounded-md border border-gray-300 shadow-sm flex flex-col justify-between min-h-[130px] hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*4ème carte*/}
                            <div className="flex flex-row justify-between items-start w-full">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">High Risk Flagged</p>
                                <div className="text-red-700 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
                                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                                            <path d="M12 3 2 20h20L12 3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                            <rect x="11" y="8" width="2" height="5" rx="0.8" fill="currentColor" />
                                            <circle cx="12" cy="16.2" r="0.9" fill="currentColor" />
                                        </svg>
                                </div>       
                            </div>
                            <div className="flex flex-row justify-between items-end w-full mt-4">{/*Chiffre et pourcentage*/}
                                <p className="text-2xl font-bold text-gray-900 leading-none">24</p>
                                <div className="text-red-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
                                        <p className="text-red-700">+3 Today</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <VerificationLogTable data={recentRequestsData} />{/*Le tableau des recent verification requests*/}
                    
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