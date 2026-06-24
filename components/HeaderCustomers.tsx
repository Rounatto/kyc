"use client"

import { Search, CircleQuestionMark, Bell, LogOut, User } from "lucide-react";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function HeaderCustomers() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const { data: session, status } = useSession();
    const userName = session?.user?.name || "Utilisateur";
    const userEmail = session?.user?.email || "chargement...";
    const userInitial = userName.charAt(0).toUpperCase();
    const userImage = session?.user?.image;
    const companyName = (session?.user as any)?.companyName || "";

    return (
        <header className="flex items-center justify-between border-b border-gray-200 pb-4 md:pb-5 mb-6 md:mb-8 bg-white shadow-sm px-4 lg:px-8">
            
            {/* Left Side: Your exact responsive Customer Search bar configuration */}
            <div className="flex items-center gap-4 lg:gap-8 flex-1">
                <div className="flex relative flex-row mt-2 md:mt-3 w-full max-w-[150px] sm:max-w-xs lg:max-w-[340px] border border-gray-300 rounded-lg text-sm outline-none bg-gray-200/50 text-gray-700 placeholder-gray-400">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="6.5" />
                            <path d="m16.2 16.2 4.1 4.1" />
                        </svg>
                    </span>
                    <input 
                        type="text" 
                        placeholder="Search customers..." 
                        className="w-full bg-transparent border-transparent rounded-lg py-2 pl-10 pr-3 text-sm outline-none transition-all text-gray-800 placeholder-gray-600 truncate"
                    />
                </div>
            </div>

            {/* Right Side: LITERALLY your exact profile container, elements, logic, and conditional styles */}
            <div className="flex items-center gap-2 mt-2 md:mt-3">
                <button className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 cursor-pointer">
                    <span className="sr-only">Notifications</span>
                    <Bell />
                </button>
                <button className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 cursor-pointer">
                    <span className="sr-only">Information</span>
                    <CircleQuestionMark />
                </button>
                <div className="relative">
                    <div onClick={() => setIsMenuOpen(!isMenuOpen)} className={`w-9 h-10 mr-2 md:mr-3 ${userImage ? 'bg-transparent' : 'bg-blue-200/70 border border-gray-200'} rounded-xl overflow-hidden cursor-pointer`}>
                        {userImage ? (
                            <img src={userImage} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-blue-700 pr-3 font-bold">{status === "loading" ? "..." : userInitial}</span>
                        )}
                    </div>
                    {isMenuOpen && (
                        <div className="absolute right-2 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50">
                            <div className="px-4 py-2 border-b border-gray-100">
                                <p className="text-sm font-medium text-gray-800 truncate">{userName}</p>
                                <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                            </div>
                            <Link href="/dashboard/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                <User className="w-4 h-4" />
                                Profil
                            </Link>
                            <button onClick={() => signOut({ callbackUrl: "/login"})} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-100 transition-colors mt-1 border-t border-gray-100 cursor-pointer">
                                <LogOut className="w-4 h-4" />Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}