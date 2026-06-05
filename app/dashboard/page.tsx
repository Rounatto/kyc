"use client"
import Link from "next/link";

export default function DashboardPage() {
    return (
        <div className="w-full">{/*page entière*/}
            <header className="flex items-center justify-between border-b border-gray-200 pb-4 md:pb-5 mb-6 md:mb-8 bg-white shadow-sm px-4 lg:px-8">{/*Header*/}
                
                <div className="flex items-center gap-4 lg:gap-8">{/*Logo et search*/}
                    <span className="text-xl font-bold text-blue-700 tracking-tight mt-2 md:mt-3">TrustVerify</span>{/*TrustVerify*/}
                            <div className="hidden lg:flex relative flex-row mt-4 w-75 border border-gray-300 rounded-md pl-3 pr-4 text-sm outline-none bg-gray-200 text-gray-700 placeholder-gray-400">{/*Search bar*/}
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">{/*Icone de loupe*/}
                                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="6.5" />
                                        <path d="m16.2 16.2 4.1 4.1" />
                                    </svg>
                                </span>
                                <input type="text" placeholder="Search identities..." className="w-full border border-transparent rounded-lg py-2 pl-10 pr-4 text-sm outline-none transition-all text-gray-800 placeholder-gray-600"/>{/*Input de recherche*/}
                            </div>
                    </div>
                <div className="flex items-center gap-2 mt-2 md:mt-3">{/*Actions secondaires en haut a droite*/}
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
                        <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>{/*Titre*/}
                        <p className="text-sm text-gray-500">Real-time status of your compliance network.</p>{/*Sous-titre*/}
                    </div>
                    <div className="flex flex-row gap-3 w-full lg:w-auto">{/*les deux boutons*/}
                        <button className="flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer lg:w-36 h-12 justify-center">{/*Button Last 30 days*/}
                            <span className="flex items-center justify-center text-gray-600" aria-hidden="true">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                                    <path d="M3.5 9.5h17" />
                                    <path d="M8 3.5v3" />
                                    <path d="M16 3.5v3" />
                                    <path d="M8.25 12h.01" />
                                    <path d="M12 12h.01" />
                                    <path d="M15.75 12h.01" />
                                </svg>
                            </span>
                            <p className="text-xs md:text-sm font-medium text-gray-700 whitespace-nowrap">Last 30 days</p>
                        </button>
                        <button className=" flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-blue-700 border border-gray-300 rounded-lg text-sm font-medium text-white hover:bg-blue-600 cursor-pointer lg:w-36 h-12 justify-center">{/*Button Export*/}
                            <span className="flex items-center justify-center text-white" aria-hidden="true">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3v12" />
                                    <path d="m7 10 5 5 5-5" />
                                    <path d="M5 21h14" />
                                </svg>
                            </span>
                            <p className="text-xs md:text-sm font-medium text-white whitespace-nowrap">Export Report</p>
                        </button>
                    </div>
                </div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap gap-4 md:gap-6 w-full mt-8">{/* section des 4 cartes de résumé*/}
                        <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*1ère carte*/}
                            <div className="flex flex-row justify-between items-start gap-1">{/*les deux ptit logo bleu et vert*/}
                                <div className="bg-blue-600/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">{/*logo bleu entier*/}
                                    <div className="text-blue-800 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
                                        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
                                            <circle cx="16" cy="10" r="4" fill="currentColor" />
                                            <path d="M7.5 25c0-4.7 3.7-8.5 8.5-8.5s8.5 3.8 8.5 8.5" fill="currentColor" />
                                            <path d="M21.8 18.2l2.1 2.1 4.3-4.3" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="bg-green-500/20 flex justify-center items-center rounded-sm px-2 py-1">{/*logo vert entier*/}
                                    <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
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
                            <div className="flex flex-col gap-0.5">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">Total Verifications</p>
                                <p className="text-2xl font-bold text-gray-900 leading-none">12,842</p>
                            </div>
                        </div>
                        <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*2ème carte*/}
                            <div className="flex flex-row justify-between items-start gap-1">{/*les deux ptit logo bleu et vert*/}
                                <div className="bg-yellow-400/30 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">{/*logo bleu entier*/}
                                    <div className="text-orange-600 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
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
                                <div className="bg-yellow-400/30 flex justify-center items-center rounded-sm px-2 py-1">{/*logo vert entier*/}
                                    <div className="text-orange-600 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
                                        <span className="flex items-center justify-center" aria-hidden="true">
                                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="5" />
                                                <path d="M12 8v4l2 1" />
                                                <path d="M12 3v1" />
                                            </svg>
                                        </span>
                                        8m avg
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-0.5">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">Pending Review</p>
                                <p className="text-2xl font-bold text-gray-900 leading-none">148</p>
                            </div>
                        </div>
                        <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*3ème carte*/}
                            <div className="flex flex-row justify-between items-start gap-1">{/*les deux ptit logo bleu et vert*/}
                                <div className="bg-green-500/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">{/*logo bleu entier*/}
                                    <div className="text-green-700 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
                                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                                            <path d="M12 2l6 2v5c0 4.5-2.5 8.1-6 9-3.5-.9-6-4.5-6-9V4l6-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M8.5 12.3l2.5 2.5L15.2 10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="bg-green-500/20 flex justify-center items-center rounded-sm px-2 py-1">{/*logo vert entier*/}
                                    <div className="text-green-700 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
                                        99.2% Rate
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-0.5">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">Approved</p>
                                <p className="text-2xl font-bold text-gray-900 leading-none">11,904</p>
                            </div>
                        </div>
                        <div className="w-full sm:w-[calc(50%-12px)] lg:flex-1 bg-white p-5 rounded-md border border-gray-400 shadow-sm flex flex-col justify-between h-36 hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*4ème carte*/}
                            <div className="flex flex-row justify-between items-start gap-1">{/*les deux ptit logo bleu et vert*/}
                                <div className="bg-red-600/20 w-10 h-12 flex items-center justify-center p-1.5 rounded-sm">{/*logo bleu entier*/}
                                    <div className="text-red-700 text-sm font-bold flex items-center justify-center">{/*le ptit logo bleu*/}
                                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                                            <path d="M12 3 2 20h20L12 3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                            <rect x="11" y="8" width="2" height="5" rx="0.8" fill="currentColor" />
                                            <circle cx="12" cy="16.2" r="0.9" fill="currentColor" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="bg-red-600/20 flex justify-center items-center rounded-sm px-2 py-1 truncate">{/*logo vert entier*/}
                                    <div className="text-red-700 text-[10px] font-bold flex items-center justify-center gap-1">{/*le ptit logo vert*/}
                                        High Priority
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-0.5">{/*Titre et chiffre*/}
                                <p className="text-sm font-semibold text-gray-500 truncate">Risk Alerts</p>
                                <p className="text-2xl font-bold text-gray-900 leading-none">24</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col lg:flex-row justify-between gap-4 mt-7">{/*verification activity feed and High Risk Alerts*/}
                        <div className="flex flex-col w-full lg:w-[70%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*verification activity feed*/}
                            <div className="flex flex-row justify-between items-center mb-4">{/*Header verification activity et approved et risk*/}
                                <h2 className="font-bold">Verification Activity</h2>
                                <div className="flex flex-row">{/*bouton approved et risk*/}
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
                            <div className="flex flex-row justify-between w-full px-2 mt-auto">{/*jour de la semaine*/}
                                <p className="text-sm text-black truncate">Monday</p>
                                <p className="text-sm text-black truncate">Tuesday</p>
                                <p className="text-sm text-black truncate">Wednesday</p>
                                <p className="text-sm text-black truncate">Thursday</p>
                                <p className="text-sm text-black truncate">Friday</p>
                                <p className="text-sm text-black truncate">Saturday</p>
                                <p className="text-sm text-black truncate">Sunday</p>
                            </div>
                        </div>
                        <div className="flex flex-col w-full lg:w-[35%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between gap-10 hover:shadow-md hover:-translate-y-1 transition-all duration-300">{/*High Risk Alerts*/}
                            <div className="flex flex-row">{/*High Risk Alerts and viewall*/}
                                <h2 className="font-bold">High Risk Alerts</h2>
                                <Link href="#" className="text-sm text-blue-700 ml-auto hover:underline">View All</Link>
                            </div>
                            <div className="flex flex-col justify-between gap-10">{/*Les exemples d'alertes à haut risque rouge*/}
                                <div className="flex flex-row gap-5 cursor-pointer hover:bg-gray-200 p-2 rounded-sm h-full">{/*1 exemple*/}
                                    <div className="bg-red-700/20 p-2 rounded-lg w-11 h-11">{/*carre rouge*/}
                                        <span className="text-red-700">{/*Icone d'alerte rouge*/}

                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 ">{/*Titre et description de l'alerte*/}
                                        <p className="text-sm font-semibold text-gray-900">Johanathan Vance</p>
                                        <p className="text-sm text-gray-500">PEP Match identified</p>
                                    </div>
                                    <p className="text-sm text-gray-900 mt-2">2m ago</p>
                                </div>
                                <div className="flex flex-row gap-5 cursor-pointer hover:bg-gray-200 p-2 rounded-sm h-full">{/*2 exemple*/}
                                    <div className="bg-red-700/20 p-2 rounded-lg w-11 h-11">{/*carre rouge*/}
                                        <span className="text-red-700">{/*Icone d'alerte rouge*/}

                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">{/*Titre et description de l'alerte*/}
                                        <p className="text-sm font-semibold text-gray-900">Sarrah McHale</p>
                                        <p className="text-sm text-gray-500">IP Anomaly: Moscow</p>
                                    </div>
                                    <p className="text-sm text-gray-900 mt-2">1h ago</p>
                                </div>
                                <div className="flex flex-row gap-5 cursor-pointer hover:bg-gray-200 p-2 rounded-sm h-full">{/*3 exemple*/}
                                    <div className="bg-red-700/20 p-2 rounded-lg w-11 h-11">{/*carre rouge*/}
                                        <span className="text-red-700">{/*Icone d'alerte rouge*/}

                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">{/*Titre et description de l'alerte*/}
                                        <p className="text-sm font-semibold text-gray-900">Zeno Logistics Ltd</p>
                                        <p className="text-sm text-gray-500">Sanctions List Hit</p>
                                    </div>
                                    <p className="text-sm text-gray-900 mt-2">3h ago</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 bg-gray-400/20 p-4 lg:mx-auto mx-2 rounded-lg">{/*Commentaire et statistique des haut risque*/}
                                <p>AI-driven risk scoring is currently monitoring 842 active sessions</p>
                                <div className="w-full bg-white h-[10px] rounded-sm">{/*barre de progression du risque*/}
                                    <div className="bg-blue-700 h-full w-[75%] rounded-sm" ></div>{/*la barre bleu qui estime le risk*/}
                                </div>
                            </div>
                        </div>
                        
                    </div>
                    <div className="flex flex-col w-full border border-gray-400 rounded-md justify-between">{/*Section des Recent Verification Requests*/}
                        <div className="flex flex-row justify-between p-5 border-b border-gray-400">{/*Recent Verification Requests title et deux icones*/}
                            <h2 className="font-bold">Recent Verification Requests</h2>
                            <div className="flex flex-row gap-2">{/*les deux icones de filtre et trois points verticale*/}
                                <span className="text-gray-900 hover:bg-gray-200 p-1 rounded-xs cursor-pointer">{/*Icone de filtre*/}
                                    hk
                                </span>
                                <span className="text-gray-900 hover:bg-gray-200 p-1 rounded-xs cursor-pointer">{/*Icone de trois points verticale*/}
                                    bkd
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-col justify-between w-full">{/*la section vérification du milieu*/}
                            <header className="flex flex-row bg-gray-200/80 py-2 px-4 w-full">{/*descriprion de ce que contient le tableau*/}
                                <p className="text-sm text-gray-600 mr-20">CUSTOMER</p>
                                <p className="text-sm text-gray-600 mr-20">TYPE</p>
                                <p className="text-sm text-gray-600 mr-12">SUBMITTED</p>
                                <p className="text-sm text-gray-600 mr-14">STATUS</p>
                                <p className="text-sm text-gray-600 mr-13">SCORE</p>
                                <p className="text-sm text-gray-600">ACTION</p>
                            </header>
                            <div className="flex flex-col w-full">{/*les lignes exemples du tableau*/}
                                <div className="flex flex-row py-7 border-b border-gray-400">{/*1ère ligne du tableau*/}
                                    <div className="flex flex-row">{/*Customer avec image et nom*/}
                                        <div className="w-10 h-10 bg-blue-800/20 rounded-full mr-4">{/*Image du client*/}
                                            <p className="text-blue-800">EL</p>
                                        </div>
                                        <div className="flex flex-col gap-0.5">{/*Nom du client et email*/}
                                            <p className="text-sm text-gray-900 mt-2">Eleanor Lewis</p>{/*Nom du client*/}
                                            <p className="text-xs text-gray-500">e.lewis@corporate.com</p>{/*Email du client*/}
                                        </div>
                                    </div>
                                    <div>{/*Type de vérification*/}
                                        <p>Individual KYC</p>
                                    </div>
                                    <div>{/*Date de soumission*/}

                                    </div>
                                    <div>{/*Status de la vérification*/}

                                    </div>
                                    <div>{/*Score de risque*/}

                                    </div>
                                    <div>{/*Action possible sur la vérification*/}

                                    </div>                                
                                </div>
                                <div className="flex flex-row py-7 border-b border-gray-400">{/*2ème ligne du tableau*/}

                                </div>
                                <div className="flex flex-row py-7 border-b border-gray-400">{/*3ème ligne du tableau*/}

                                </div>
                                <div className="flex flex-row py-7 border-b border-gray-400">{/*4ème ligne du tableau*/}

                                </div>
                            </div>
                        </div>
                        <footer className="flex flex-row justify-between bg-gray-200/80 p-5">{/*Footer avec le bouton view all*/}
                            <p className="text-xs text-gray-900 mt-2">Showing 4 of 12,842 requests</p>
                            <div className="flex flex-row gap-2">
                                <div className="bg-white w-5 h-6 rounded-xs item-center border border-gray-400 cursor-pointer">{/*Button page precedente*/}
                                    <span>{/*fleche gauche pour page precedente*/}

                                    </span>
                                </div>
                                <p>1</p>{/* le nbr de la page ou on est actuellement*/}
                                <div className="bg-white w-5 h-6 rounded-xs item-center border border-gray-400 cursor-pointer">{/*Button page suivante*/}
                                    <span>{/*fleche droite pour page suivante*/}
                                        
                                    </span>
                                </div>
                            </div>
                        </footer>

                    </div>
                    
                </div>
            </div>
    );
}