"use client";

import { Search, CircleQuestionMark, Bell, LogOut, User, Loader2, TriangleAlert, CheckCircle2, CreditCard, Info, CheckCheck } from "lucide-react";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useNotifications } from "@/context/NotificationContext"; // 💡 ON IMPORTE LA STATION RADIO

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isNotifOpen, setIsNotifOpen] = useState(false);

    const { data: session, status } = useSession();
    
    // 💡 ON ÉCOUTE LA STATION RADIO EN TEMPS RÉEL (1 seule ligne !)
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    
    const userName = session?.user?.name || "Compliance Officer";
    const userEmail = session?.user?.email || "Loading...";
    const userInitial = userName.charAt(0).toUpperCase();
    const userImage = session?.user?.image;

    // Moteur d'icônes dynamiques
    const getNotifIcon = (type: string) => {
        switch (type) {
            case "HIGH_RISK_ALERT": return <TriangleAlert className="w-5 h-5 text-red-500" />;
            case "BILLING": return <CreditCard className="w-5 h-5 text-yellow-600" />;
            case "SUCCESS": return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case "SYSTEM":
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

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
                
                {/* 🔔 LA CLOCHE CONNECTÉE */}
                <div className="relative">
                    <button 
                        onClick={() => { setIsNotifOpen(!isNotifOpen); setIsMenuOpen(false); }}
                        className="text-gray-500 hover:text-blue-600 transition-colors relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-50 cursor-pointer"
                    >
                        <span className="sr-only">Notifications</span>
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-2.5 right-2.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 border border-white text-[9px] font-bold text-white"></span>
                        )}
                    </button>

                    {isNotifOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)}></div>
                            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-gray-900">Alerts</h3>
                                        {unreadCount > 0 && <span className="text-xs text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded-full">{unreadCount} unread</span>}
                                    </div>
                                    {unreadCount > 0 && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); markAllAsRead(); }} 
                                            className="text-xs font-bold text-gray-500 hover:text-blue-700 transition-colors flex items-center gap-1 cursor-pointer"
                                        >
                                            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-50">
                                    {notifications.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
                                            <Bell className="w-8 h-8 text-gray-300" />
                                            No recent alerts or notifications.
                                        </div>
                                    ) : (
                                        notifications.map((notif) => (
                                            <div 
                                                key={notif.id} 
                                                onClick={() => markAsRead(notif.id)}
                                                className={`p-4 flex gap-3 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.isRead ? 'bg-blue-50/40' : ''}`}
                                            >
                                                <div className="shrink-0 mt-0.5">
                                                    {getNotifIcon(notif.type)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <p className={`text-sm ${!notif.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{notif.title}</p>
                                                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 leading-relaxed">{notif.message}</p>
                                                    <p className="text-[10px] text-gray-400 mt-2 font-medium uppercase tracking-wider">{new Date(notif.createdAt).toLocaleString()}</p>
                                                </div>
                                                {!notif.isRead && (
                                                    <div className="w-2 h-2 bg-blue-600 rounded-full shrink-0 mt-1.5 ml-auto"></div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                <Link href="/dashboard/support" className="text-gray-500 hover:text-blue-600 transition-colors relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-50 cursor-pointer mr-1">
                    <span className="sr-only">Information & Support</span>
                    <CircleQuestionMark className="w-5 h-5" />
                </Link>
                
                <div className="relative">
                    <div 
                        onClick={() => { setIsMenuOpen(!isMenuOpen); setIsNotifOpen(false); }} 
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