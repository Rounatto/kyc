"use client";

import { Search, CircleQuestionMark, Bell, LogOut, User, Loader2 } from "lucide-react";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { data: session, status } = useSession();
    
    const userName = session?.user?.name || "Compliance Officer";
    const userEmail = session?.user?.email || "Loading...";
    const userInitial = userName.charAt(0).toUpperCase();
    const userImage = session?.user?.image;

    return (
        <header className="flex items-center justify-between border-b border-gray-200 pb-4 md:pb-5 mb-6 md:mb-8 bg-white shadow-sm px-4 lg:px-8 relative z-40">
            <div className="flex items-center gap-4 lg:gap-8">
                <span className="text-xl font-black text-blue-700 tracking-tight mt-2 md:mt-3 cursor-default">TrustVerify</span>
                
                <div className="hidden lg:flex relative flex-row mt-4 w-75 border border-gray-200 rounded-lg pl-3 pr-4 text-sm outline-none bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all text-gray-700 placeholder-gray-400 group">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" aria-hidden="true">
                        <Search className="w-4 h-4" />
                    </span>
                    <input 
                        type="text" 
                        placeholder="Search identities or audits..." 
                        className="w-full bg-transparent border-none rounded-lg py-2.5 pl-8 pr-4 text-sm outline-none text-gray-800 placeholder-gray-400"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2 md:mt-3">
                {/* La cloche sera dynamique à la phase 11 */}
                <button className="text-gray-500 hover:text-blue-600 transition-colors relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-50 cursor-pointer">
                    <span className="sr-only">Notifications</span>
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>
                
                {/* 💡 LIEN DYNAMIQUE VERS LE SUPPORT */}
                <Link href="/dashboard/support" className="text-gray-500 hover:text-blue-600 transition-colors relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-50 cursor-pointer mr-1">
                    <span className="sr-only">Information & Support</span>
                    <CircleQuestionMark className="w-5 h-5" />
                </Link>
                
                <div className="relative">
                    <div 
                        onClick={() => setIsMenuOpen(!isMenuOpen)} 
                        className={`w-10 h-10 md:mr-3 ${userImage ? 'bg-transparent' : 'bg-blue-100 border border-blue-200'} rounded-xl overflow-hidden cursor-pointer flex items-center justify-center shadow-sm hover:shadow-md transition-shadow relative`}
                    >
                        {status === "loading" ? (
                            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        ) : userImage ? (
                            <img src={userImage} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-blue-700 font-bold text-sm">{userInitial}</span>
                        )}
                    </div>
                    
                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-4 py-3 border-b border-gray-100 mb-1">
                                    <p className="text-sm font-bold text-gray-900 truncate">{userName}</p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">{userEmail}</p>
                                </div>
                                <Link 
                                    href="/dashboard/settings" 
                                    onClick={() => setIsMenuOpen(false)}
                                    className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                                >
                                    <User className="w-4 h-4 text-gray-400" />
                                    Account Settings
                                </Link>
                                <div className="h-px bg-gray-100 my-1 mx-2"></div>
                                <button 
                                    onClick={() => signOut({ callbackUrl: "/login"})} 
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                    <LogOut className="w-4 h-4 text-red-500" />
                                    Sign Out Securely
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}