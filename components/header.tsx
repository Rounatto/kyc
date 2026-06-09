import { Search, CircleQuestionMark, Bell } from "lucide-react";

export default function Header(){
    return(
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
                    <button className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 cursor-pointer">{/*Button sonnerie*/}
                        <span className="sr-only">Notifications</span>
                        <Bell />
                    </button>
                    <button className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 cursor-pointer">{/*Button information*/}
                        <span className="sr-only">Information</span>
                        <CircleQuestionMark />
                    </button>
                    <div className="w-9 h-10 mr-2 md:mr-3 bg-gray-300 rounded-xl overflow-hidden border border-gray-200 cursor-pointer">{/*contenaire de l'image de profil*/}
                        <div className="w-full h-full bg-slate-400"></div>{/*Image de profil*/}
                    </div>
                </div>
            </header>
    );
}