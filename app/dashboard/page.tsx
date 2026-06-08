"use client"
import Link from "next/link";
import VerificationTable from "@/components/VerificationTable";
import { Bell, MessageCircleQuestionMark, Search, CircleQuestionMark, Calendar, Download, UserRoundCheck, ClipboardClock, Clock, ShieldCheck, TriangleAlert, Gavel, Flag, Earth  } from "lucide-react";

const recentRequestsData = [
    {/*entre{} c est la une (row)*/
        id: 1,
        Avatar:"EL",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Eleanor Lewis",
        Email: "e.lewis@corporate.com",
        Type: "Individual KYC",
        Submitted: "Oct 24, 14:20",
        Status: "verified",
        Score: "98/100",
    },
    {
        id: 2,
        Avatar:"MR",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Marcus Rossi",
        Email: "m.rossi@globex.io",
        Type: "Corporate KYB",
        Submitted: "Oct 24, 13:45",
        Status: "pending",
        Score: "--",
    },
    {
        id: 3,
        Avatar:"BT",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Braker Tech Ltd",
        Email: "complance@braker.net",
        Type: "Entity Screening",
        Submitted: "Oct 24, 11:12",
        Status: "rejected",
        Score: "12/100",
    },
    {
        id: 4,
        Avatar:"SK",/*URL de l'avatar du client, peut être une image ou des initiales*/
        Nom: "Sienna Kim",
        Email: "skim@creative.co",
        Type: "Individual KYC",
        Submitted: "Oct 24, 09:30",
        Status: "verified",
        Score: "94/100",
    }
];
export default function DashboardPage() {
    return (
        <div className="w-full">{/*page entière*/}
            <header className="flex items-center justify-between border-b border-gray-200 pb-4 md:pb-5 mb-6 md:mb-8 bg-white shadow-sm px-4 lg:px-8">{/*Header*/}
                
                <div className="flex items-center gap-4 lg:gap-8">{/*Logo et search*/}
                    <span className="text-xl font-bold text-blue-700 tracking-tight mt-2 md:mt-3">TrustVerify</span>{/*TrustVerify*/}
                            <div className="hidden lg:flex relative flex-row mt-4 w-75 border border-gray-300 rounded-md pl-3 pr-4 text-sm outline-none bg-gray-200 text-gray-700 placeholder-gray-400">{/*Search bar*/}
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">{/*Icone de loupe*/}
                                    <Search />
                                </span>
                                <input type="text" placeholder="Search identities..." className="w-full border border-transparent rounded-lg py-2 pl-10 pr-4 text-sm outline-none transition-all text-gray-800 placeholder-gray-600"/>{/*Input de recherche*/}
                            </div>
                    </div>
                <div className="flex items-center gap-2 mt-2 md:mt-3">{/*Actions secondaires en haut a droite*/}
                    <button className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200">{/*Button sonnerie*/}
                        <span className="sr-only">Notifications</span>
                        <Bell />
                    </button>
                    <button className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200">{/*Button information*/}
                        <span className="sr-only">Information</span>
                        <CircleQuestionMark />
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
                                <Calendar />
                            </span>
                            <p className="text-xs md:text-sm font-medium text-gray-700 whitespace-nowrap">Last 30 days</p>
                        </button>
                        <button className=" flex-1 lg:flex-none flex items-center gap-2 px-2 md:px-4 py-2 bg-blue-700 border border-gray-300 rounded-lg text-sm font-medium text-white hover:bg-blue-600 cursor-pointer lg:w-36 h-12 justify-center">{/*Button Export*/}
                            <span className="flex items-center justify-center text-white" aria-hidden="true">
                                <Download />
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
                                        <UserRoundCheck />
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
                                        <ClipboardClock />
                                    </div>
                                </div>
                                <div className="bg-yellow-400/30 flex justify-center items-center rounded-sm px-2 py-1">{/*logo vert entier*/}
                                    <div className="text-orange-600 text-[10px] font-bold flex items-center justify-center gap-1 truncate">{/*le ptit logo vert*/}
                                        <span className="flex items-center justify-center" aria-hidden="true">
                                            <Clock />
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
                                        <ShieldCheck />
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
                                        <TriangleAlert />
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
                        <div className="flex flex-col w-full lg:w-[70%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between hover:shadow-md hover:-translate-y-1 transition-all duration-300 bg-white">{/*verification activity feed*/}
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
                        <div className="flex flex-col w-full lg:w-[35%] min-h-[400px] border border-gray-400 rounded-md p-4 justify-between gap-10 hover:shadow-md hover:-translate-y-1 transition-all duration-300 bg-white">{/*High Risk Alerts*/}
                            <div className="flex flex-row">{/*High Risk Alerts and viewall*/}
                                <h2 className="font-bold">High Risk Alerts</h2>
                                <Link href="#" className="text-sm text-blue-700 ml-auto hover:underline">View All</Link>
                            </div>
                            <div className="flex flex-col justify-between gap-10">{/*Les exemples d'alertes à haut risque rouge*/}
                                <div className="flex flex-row gap-5 cursor-pointer hover:bg-gray-200 p-2 rounded-sm h-full">{/*1 exemple*/}
                                    <div className="bg-red-700/20 p-2 rounded-lg w-11 h-11">{/*carre rouge*/}
                                        <span className="text-red-700">{/*Icone d'alerte rouge*/}
                                            <Gavel />
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
                                            <Flag />
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
                                            <Earth />
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
                    <VerificationTable data={recentRequestsData} />{/*Le tableau des recent verification requests*/}
                </div>
            </div>
    );
}