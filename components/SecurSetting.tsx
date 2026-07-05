"use client";

import { Smartphone, LogOut, Laptop, ShieldCheck, KeyRound, AlertTriangle } from "lucide-react";
import { signOut } from "next-auth/react";

export default function SecurSetting() {
    return (
        <div className="flex flex-col gap-6">
            
            {/* BLOC 1 : Mot de passe */}
            <div className="flex flex-col w-full bg-white rounded-sm border border-gray-300 shadow-sm">
                <div className="border-b border-gray-200 px-5 md:px-6 py-4 flex items-center gap-3 bg-gray-50/50">
                    <KeyRound className="w-5 h-5 text-gray-500" />
                    <h3 className="text-base md:text-lg font-bold text-gray-900">Password Management</h3>
                </div>
                <div className="flex flex-col p-5 md:p-6 gap-6">
                    <div className="flex flex-col gap-1.5 w-full md:w-1/2">
                        <label className="text-xs font-semibold text-gray-700">Current Password</label>
                        <input type="password" placeholder="••••••••" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-700">New Password</label>
                            <input type="password" placeholder="At least 12 characters" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-700">Confirm New Password</label>
                            <input type="password" placeholder="Repeat new password" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                        </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-2 pt-4 border-t border-gray-100 gap-4">
                        <p className="text-xs text-gray-500">Last changed: <span className="font-bold text-gray-700">Never</span></p>
                        <button className="text-sm font-bold bg-blue-700 text-white px-6 py-2.5 rounded-sm hover:bg-blue-800 transition-colors shadow-sm w-full sm:w-auto cursor-pointer">
                            Update Password
                        </button>
                    </div>
                </div>
            </div>

            {/* BLOC 2 : Authentification Double Facteur (2FA) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 md:p-6 bg-white rounded-sm border border-gray-300 shadow-sm gap-5">
                <div className="flex flex-row gap-4 items-start sm:items-center">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <Smartphone className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            Two-Factor Authentication (2FA)
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-sm uppercase tracking-wider border border-red-200">Off</span>
                        </h4>
                        <p className="text-xs text-gray-500 leading-relaxed max-w-md mt-0.5">Add an extra layer of security. We'll ask for a code from an authenticator app every time you log in.</p>
                    </div>
                </div>
                <button className="w-full sm:w-auto text-sm font-bold text-blue-700 bg-white border-2 border-blue-700 px-5 py-2.5 rounded-sm hover:bg-blue-50 transition-colors shrink-0 text-center cursor-pointer">
                    Enable 2FA
                </button>
            </div>

            {/* BLOC 3 : Sessions Actives & Déconnexion (La touche Pro) */}
            <div className="flex flex-col w-full bg-white rounded-sm border border-gray-300 shadow-sm">
                <div className="border-b border-gray-200 px-5 md:px-6 py-4 flex items-center gap-3 bg-gray-50/50">
                    <Laptop className="w-5 h-5 text-gray-500" />
                    <h3 className="text-base md:text-lg font-bold text-gray-900">Active Sessions</h3>
                </div>
                <div className="flex flex-col p-5 md:p-6 gap-6">
                    <p className="text-xs text-gray-500">These are the devices that have logged into your TrustVerify compliance account. Revoke any sessions that you do not recognize.</p>
                    
                    <div className="flex flex-row items-center justify-between py-3 border-b border-gray-100">
                        <div className="flex items-center gap-4">
                            <Laptop className="w-6 h-6 text-gray-400" />
                            <div className="flex flex-col">
                                <p className="text-sm font-bold text-gray-900">Windows PC • Chrome</p>
                                <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Active now (This device)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-row justify-end mt-2 pt-2">
                        {/* Ce bouton coupe la session côté serveur et ramène au Login */}
                        <button 
                            onClick={() => signOut({ callbackUrl: "/login"})} 
                            className="flex items-center justify-center gap-2 text-sm font-bold bg-red-50 text-red-600 border border-red-200 px-6 py-2.5 rounded-sm hover:bg-red-100 transition-colors shadow-sm w-full md:w-auto cursor-pointer"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out of This Device
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
}