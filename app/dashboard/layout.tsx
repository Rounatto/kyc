"use client"

import { ChartColumn, LayoutDashboard, LogOut, MessageCircleQuestionMark, Settings, Shield, User } from 'lucide-react';
import Link from 'next/link'
import { useState } from 'react';

export default function RootLayout({ children }: Readonly<{
  children: React.ReactNode;
}>) {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex h-[100dvh] w-full bg-gray-100 text-gray-900 font-sans overflow-hidden">{/*page entiere*/}
      <aside className="fixed bottom-0 left-0 w-full z-50 flex flex-row justify-around bg-white border-t border-gray-300 md:relative md:w-66 md:flex-col md:bg-gray-200 md:border-t-0 md:border-r md:border-gray-300 md:h-full md:justify-between shrink-0">{/* Navigation Section */}
        {/* Logo Section */}
        <div className="hidden md:flex h-20 items-center px-6">{/* Logo and Title Grand bloc horizental*/}
          <div className="flex items-center gap-3">{/* Logo et titre*/}
            <div className="w-9 h-10 bg-blue-700 rounded-lg flex items-center text-white shrink-0">{/*LOGO*/}
              <span className="font-bold text-sm"><Shield /></span>
            </div>
            <div className="flex flex-col">{/* Titre et sous-titre*/}
              <span className="font-bold text-[#0f172a] leading-tight">Compliance</span>
              <span className="font-bold text-[#0f172a] leading-tight">Hub</span>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Enterprise Tier</span> 
            </div>
          </div>
        </div>
        {/* Navigation Section */}
        <nav className="flex flex-row w-full md:flex-col md:flex-1 md:gap-1 md:mt-6">
          {/* Dashboard Link - Le Link englobe TOUT pour que la barre bleue aille au bout à droite */}
          <Link 
            href="/dashboard" onClick = {() => setActiveTab('dashboard')} className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group
              ${activeTab === 'dashboard'
                ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" 
                : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"
              }`}>
            <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">{/*Icone et titre*/}
              <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0">
                <span className="font-bold text-sm"><LayoutDashboard /></span>
              </div>
              <span className="text-[11px] md:text-sm font-medium">Dashboard</span>
            </div>
          </Link>
          {/*customers Link*/}
          <Link 
            href="/dashboard/customers" onClick = {() => setActiveTab('customers')} className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group
              ${activeTab === 'customers'
                ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" 
                : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"
              }`}>
            <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">{/*Icone et titre*/}
              <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0">
                <span className="font-bold text-sm"><User /></span>
              </div>
              <span className="text-[11px] md:text-sm font-medium">Customers</span>
            </div>
          </Link>
          {/*reports Link*/}
          <Link 
            href="/dashboard/reports" onClick = {() => setActiveTab('reports')} className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group
              ${activeTab === 'reports'
                ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" 
                : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"
              }`}>
            <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">{/*Icone et titre*/}
              <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0">
                <span className="font-bold text-sm"><ChartColumn /></span>
              </div>
              <span className="text-[11px] md:text-sm font-medium">Reports</span>
            </div>
          </Link>
          {/*Settings Link*/}
          <Link 
            href="/dashboard/settings" onClick = {() => setActiveTab('settings')} className={`relative flex flex-col md:flex-row items-center justify-center md:justify-between flex-1 md:flex-none py-2 md:px-7 md:py-3 font-semibold transition-all md:w-full group
              ${activeTab === 'settings'
                ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" 
                : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"
              }`}>
            <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">{/*Icone et titre*/}
              <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0">
                <span className="font-bold text-sm"><Settings /></span>
              </div>
              <span className="text-[11px] md:text-sm font-medium">Settings</span>
            </div>
          </Link>
        </nav>
        <div className="hidden md:flex md:flex-col w-full p-4 gap-4 mb-4">{/*bouton, ligne et actions secondaires*/}
            <button className="w-full bg-blue-700 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm cursor-pointer">{/*bouton new verification*/}
              <span className="text-base font-bold">+</span> New Verification
            </button>
            {/*ligne de séparation*/}
            <div className="w-full h-[2px] bg-gray-300 mt-2 mb-2"></div>
            {/*actions secondaires*/}
            <div className="flex flex-col gap-1">
              <Link href="/dashboard/support" onClick = {() => setActiveTab('support')} className={`relative flex items-center justify-between px-7 py-3 font-semibold transition-all w-full group
               ${activeTab === 'support'
                ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" 
                : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"
              }`}>
              <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0">
                  <span className="font-bold text-sm"><MessageCircleQuestionMark /></span>
                </div>
                <span className="text-[11px] md:text-sm font-medium">Support</span>
              </div>
              </Link>

              <button onClick = {() => setActiveTab('signout')} className={`relative flex items-center justify-between px-7 py-3 font-semibold transition-all w-full cursor-pointer group
               ${activeTab === 'signout'
                ? "md:bg-blue-50/40 text-blue-700 md:before:absolute md:before:right-0 md:before:top-0 md:before:h-full md:before:w-[3px] md:before:bg-blue-700" 
                : "md:text-gray-700 md:hover:bg-gray-300/50 hover:text-gray-900"
              }`}>
              <div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-3">
                <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg shrink-0">
                  <span className="font-bold text-sm"><LogOut /></span>
                </div>
                <span className="text-[11px] md:text-sm font-medium">Sign out</span>
              </div>
              </button>


            </div>

        </div>
      </aside>
      <div className="flex-1 h-full overflow-y-auto pb-14 md:pb-0">
        {children}
      </div>
    </div>
  );
}