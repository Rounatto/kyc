"use client"

import { ChartColumn, MessageCircle, LayoutDashboard, LogOut, MessageCircleQuestionMark, Settings, Shield, User, ShieldAlert } from 'lucide-react';
import Link from 'next/link'
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { NotificationProvider } from '@/context/NotificationContext'; // 💡 IMPORT DU PROVIDER

export default function RootLayout({ children }: Readonly<{
  children: React.ReactNode;
}>) {
  const [activeTab, setActiveTab] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  
  const { data: session, status } = useSession();
  const isLoadingSession = status === "loading";
  
  const isMfaMissing = session?.user && !(session.user as any).totpEnabled;

  useEffect(() => {
    if (isMfaMissing && !pathname.includes('/dashboard/settings')) {
      router.replace('/dashboard/settings');
    }

    if (pathname.includes('/dashboard/customers')){
      setActiveTab('customers');
    }
    else if (pathname.includes('/dashboard/reports')){
      setActiveTab('reports');
    }
    else if (pathname.includes('/dashboard/settings')){
      setActiveTab('settings');
    }
    else if (pathname.includes('/dashboard/support')){
      setActiveTab('support');
    }
    else if (pathname.includes('/dashboard/chat')){
      setActiveTab('chat');
    }
    else{
      setActiveTab('dashboard');
    }
  }, [pathname, isMfaMissing, router]);

  if (isLoadingSession) {
      return <div className="flex h-screen w-full items-center justify-center bg-gray-50"><Shield className="w-8 h-8 text-blue-700 animate-pulse" /></div>;
  }

  return (
    // 💡 ENVELOPPE DE SÉCURITÉ DE NOTIFICATION ÉCOUTÉE EN TEMPS RÉEL
    <NotificationProvider>
        <div className="flex h-[100dvh] w-full bg-gray-100 text-gray-900 font-sans overflow-hidden">
        <aside className="fixed bottom-0 left-0 w-full z-50 flex flex-row justify-around bg-white border-t border-gray-300 md:relative md:w-66 md:flex-col md:bg-gray-200 md:border-t-0 md:border-r md:border-gray-300 md:h-full md:justify-between shrink-0">
            
            <div className="hidden md:flex h-20 items-center px-6">
            <div className="flex items-center gap-3">
                <div className={`w-9 h-10 rounded-lg flex items-center justify-center text-white shrink-0 ${isMfaMissing ? "bg-red-600" : "bg-blue-700"}`}>
                <span className="font-bold text-sm">{isMfaMissing ? <ShieldAlert /> : <Shield />}</span>
                </div>
                <div className="flex flex-col">
                <span className="font-bold text-[#0f172a] leading-tight">Compliance</span>
                <span className="font-bold text-[#0f172a] leading-tight">Hub</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isMfaMissing ? "text-red-500" : "text-gray-500"}`}>
                    {isMfaMissing ? "SECURITY LOCKOUT" : "Enterprise Tier"}
                </span> 
                </div>
            </div>
            </div>

            <nav className="flex flex-row w-full md:flex-col md:flex-1 md:gap-1 md:mt-6">
            
            {!isMfaMissing && (
                <>
                <Link href="/dashboard" className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group ${activeTab === 'dashboard' ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"}`}>
                    <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                    <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0"><LayoutDashboard /></div>
                    <span className="text-[11px] md:text-sm font-medium">Dashboard</span>
                    </div>
                </Link>

                <Link href="/dashboard/customers" className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group ${activeTab === 'customers' ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"}`}>
                    <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                    <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0"><User /></div>
                    <span className="text-[11px] md:text-sm font-medium">Customers</span>
                    </div>
                </Link>

                <Link href="/dashboard/reports" className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group ${activeTab === 'reports' ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"}`}>
                    <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                    <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0"><ChartColumn /></div>
                    <span className="text-[11px] md:text-sm font-medium">Reports</span>
                    </div>
                </Link>
                </>
            )}

            <Link href="/dashboard/settings" className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group ${activeTab === 'settings' ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"}`}>
                <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0">
                    <Settings className={isMfaMissing ? "text-red-600 animate-pulse" : ""} />
                </div>
                <span className={`text-[11px] md:text-sm font-medium ${isMfaMissing ? "text-red-600" : ""}`}>Security</span>
                </div>
            </Link>

            {!isMfaMissing && (
                <Link href="/dashboard/chat" className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group ${activeTab === 'chat' ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"}`}>
                <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                    <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0"><MessageCircle /></div>
                    <span className="text-[11px] md:text-sm font-medium">Chat</span>
                </div>
                </Link>
            )}
            </nav>

            <div className="hidden md:flex md:flex-col w-full p-4 gap-4 mb-4">
                {!isMfaMissing && (
                    <>
                        <button className="w-full bg-blue-700 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm cursor-pointer">
                        <Link href="/dashboard/customers/new-verification" className="text-base font-bold">
                            + New Verification
                        </Link>
                        </button>
                        <div className="w-full h-[2px] bg-gray-300 mt-2 mb-2"></div>
                    </>
                )}

                <div className="flex flex-col gap-1">
                {!isMfaMissing && (
                    <Link href="/dashboard/support" className={`relative flex items-center justify-between px-7 py-3 font-semibold transition-all w-full group ${activeTab === 'support' ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"}`}>
                    <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                        <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0"><MessageCircleQuestionMark /></div>
                        <span className="text-[11px] md:text-sm font-medium">Support</span>
                    </div>
                    </Link>
                )}

                <button onClick={() => signOut({ callbackUrl: '/login' })} className="relative flex items-center justify-between px-7 py-3 font-semibold transition-all w-full cursor-pointer group md:text-gray-700 md:hover:bg-red-50 hover:text-red-700">
                    <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                    <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0"><LogOut /></div>
                    <span className="text-[11px] md:text-sm font-medium">Sign out</span>
                    </div>
                </button>
                </div>
            </div>
        </aside>
        
        <div className="flex-1 h-full overflow-y-auto pb-14 md:pb-0 relative">
            {isMfaMissing && (
                <div className="w-full bg-red-600 text-white p-3 flex justify-center items-center gap-3 shadow-md z-50">
                    <ShieldAlert className="w-5 h-5 animate-bounce" />
                    <span className="text-sm font-bold tracking-wide">SOC2 COMPLIANCE REQUIREMENT: YOU MUST ENABLE 2FA IN SECURITY SETTINGS TO ACCESS CLIENT DATA.</span>
                </div>
            )}
            {children}
        </div>
        </div>
    </NotificationProvider>
  );
}