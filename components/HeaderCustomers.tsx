"use client"

import { Search, CircleQuestionMark, Bell, LogOut, User, Loader2, TriangleAlert, CheckCircle2, CreditCard, Info, CheckCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/context/NotificationContext"; // 💡 ON IMPORTE LA STATION RADIO
import PlanBadge from "@/components/PlanBadge";

const highlightText = (text: string | null | undefined, highlight: string) => {
    if (!text) return null;
    if (!highlight.trim()) return <span>{text}</span>;
    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    const parts = text.split(regex);
    return (
        <span>
            {parts.map((part, i) => 
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <strong key={i} className="font-black text-blue-600 bg-gray-100 rounded-sm px-[1px]">
                        {part}
                    </strong>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    );
};

export default function HeaderCustomers() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isNotifOpen, setIsNotifOpen] = useState(false);

    const { data: session, status } = useSession();
    const router = useRouter();

    // 💡 ON ÉCOUTE LA STATION RADIO EN TEMPS RÉEL
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

    const userName = session?.user?.name || "Utilisateur";
    const userEmail = session?.user?.email || "chargement...";
    const userInitial = userName.charAt(0).toUpperCase();
    const userImage = session?.user?.image;

    const [searchTerm, setSearchTerm] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        if (searchTerm.trim().length === 0) {
            setResults([]);
            setShowDropdown(false);
            return;
        }
        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            setShowDropdown(true);
            try {
                const res = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}&limit=5`);
                const data = await res.json();
                if (res.ok) setResults(data.requests || []);
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(delayDebounceFn); 
    }, [searchTerm]);

    const getNotifIcon = (type: string) => {
        switch (type) {
            case "HIGH_RISK_ALERT": return <TriangleAlert className="w-5 h-5 text-red-500" />;
            case "BILLING": return <CreditCard className="w-5 h-5 text-yellow-600" />;
            case "SUCCESS": return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case "SYSTEM":
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    const handleResultClick = (customerId: string) => {
        setShowDropdown(false);
        setSearchTerm("");
        router.push(`/dashboard/customers/${customerId}`);
    };

    return (
        <header className="flex items-center justify-between border-b border-gray-200 pb-4 md:pb-5 mb-6 md:mb-8 bg-white shadow-sm px-4 lg:px-8">
            <div className="flex items-center gap-4 lg:gap-8 flex-1">
                <div className="relative w-full max-w-[150px] sm:max-w-xs lg:max-w-[340px] mt-2 md:mt-3">
                    <div className="flex relative flex-row w-full border border-gray-300 rounded-lg text-sm outline-none bg-gray-200/50 text-gray-700 placeholder-gray-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">
                            {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : (
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="6.5" />
                                    <path d="m16.2 16.2 4.1 4.1" />
                                </svg>
                            )}
                        </span>
                        <input 
                            type="text" 
                            placeholder="Search customers..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                            className="w-full bg-transparent border-transparent rounded-lg py-2 pl-10 pr-3 text-sm outline-none transition-all text-gray-800 placeholder-gray-600 truncate"
                        />
                    </div>

                    {showDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-full min-w-[250px] bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden z-[999] flex flex-col">
                            {results.length > 0 ? (
                                <ul className="divide-y divide-gray-100">
                                    {results.map((req) => (
                                        <li key={req.id} onClick={() => handleResultClick(req.id)} className="p-3 hover:bg-gray-50 cursor-pointer flex flex-col gap-1 transition-colors">
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-900 text-sm truncate">{highlightText(req.customerName, searchTerm)}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${req.status === 'verified' ? 'bg-green-100 text-green-700' : req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {req.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                                <span className="truncate">{highlightText(req.email, searchTerm)}</span>
                                                {req.cin && <span>• CIN: {highlightText(req.cin, searchTerm)}</span>}
                                                {req.phone && <span>• Phone: {highlightText(req.phone, searchTerm)}</span>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : searchTerm.trim().length > 0 && !isSearching ? (
                                <div className="p-4 text-sm text-gray-500 text-center">No records found</div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2 md:mt-3">

                {/* 💎 PLAN ACTUEL DE LA COMPANY */}
                <PlanBadge />

                {/* 🔔 LA CLOCHE CONNECTÉE AU CONTEXT */}
                <div className="relative">
                    <button 
                        onClick={() => { setIsNotifOpen(!isNotifOpen); setIsMenuOpen(false); }}
                        className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 cursor-pointer"
                    >
                        <span className="sr-only">Notifications</span>
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-2 right-2 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 border border-white text-[9px] font-bold text-white"></span>
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
                
                <Link href="/dashboard/support" className="text-gray-700 hover:text-gray-500 transition-colors text-lg relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 cursor-pointer mr-1">
                    <span className="sr-only">Information & Support</span>
                    <CircleQuestionMark className="w-5 h-5" />
                </Link>
                
                <div className="relative">
                    <div onClick={() => { setIsMenuOpen(!isMenuOpen); setIsNotifOpen(false); }} className={`w-9 h-10 mr-2 md:mr-3 ${userImage ? 'bg-transparent' : 'bg-blue-200/70 border border-gray-200'} rounded-xl overflow-hidden cursor-pointer flex items-center justify-center relative`}>
                        {userImage ? (
                            <img src={userImage} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-blue-700 pr-3 font-bold">{status === "loading" ? "..." : userInitial}</span>
                        )}
                    </div>
                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute right-2 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-4 py-2 border-b border-gray-100">
                                    <p className="text-sm font-medium text-gray-800 truncate">{userName}</p>
                                    <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                                </div>
                                <Link href="/dashboard/settings" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                    <User className="w-4 h-4" /> Account Settings
                                </Link>
                                <button onClick={() => signOut({ callbackUrl: "/login"})} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-100 transition-colors mt-1 border-t border-gray-100 cursor-pointer">
                                    <LogOut className="w-4 h-4" />Logout
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}