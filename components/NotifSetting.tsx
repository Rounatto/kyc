"use client"

import { useState } from "react";
import { RiToggleFill, RiToggleLine } from "@remixicon/react";

export default function NotifSetting() {
    const [verificationSuccess, setVerificationSuccess] = useState(true);
    const [auditRequired, setAuditRequired] = useState(true);
    const [weeklyReports, setWeeklyReports] = useState(false);

    return (
        <div className="flex flex-col w-full bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="border-b border-gray-200 px-5 md:px-6 py-4 md:py-5 bg-gray-50/50 rounded-t-xl">
                <h3 className="text-base md:text-lg font-bold text-gray-900">Email Preferences</h3>
            </div>
            <div className="flex flex-col">
                <div className="flex flex-row justify-between items-center p-5 md:p-6 border-b border-gray-100 gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-bold text-gray-900">Verification Success</p>
                        <p className="text-xs text-gray-500 leading-relaxed">Notify me whenever a customer verification is completed successfully.</p>
                    </div>
                    <button onClick={() => setVerificationSuccess(!verificationSuccess)} className="shrink-0 cursor-pointer outline-none transition-colors">
                        {verificationSuccess ? <RiToggleFill className="w-11 h-11 text-blue-700" /> : <RiToggleLine className="w-11 h-11 text-gray-400" />}
                    </button>
                </div>
                
                <div className="flex flex-row justify-between items-center p-5 md:p-6 border-b border-gray-100 gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-bold text-gray-900">Audit Required</p>
                        <p className="text-xs text-gray-500 leading-relaxed">Alert me for verifications flagged for manual review.</p>
                    </div>
                    <button onClick={() => setAuditRequired(!auditRequired)} className="shrink-0 cursor-pointer outline-none transition-colors">
                        {auditRequired ? <RiToggleFill className="w-11 h-11 text-blue-700" /> : <RiToggleLine className="w-11 h-11 text-gray-400" />}
                    </button>
                </div>

                <div className="flex flex-row justify-between items-center p-5 md:p-6 gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-bold text-gray-900">Weekly Reports</p>
                        <p className="text-xs text-gray-500 leading-relaxed">Send a summary of all verification activities once a week.</p>
                    </div>
                    <button onClick={() => setWeeklyReports(!weeklyReports)} className="shrink-0 cursor-pointer outline-none transition-colors">
                        {weeklyReports ? <RiToggleFill className="w-11 h-11 text-blue-700" /> : <RiToggleLine className="w-11 h-11 text-gray-400" />}
                    </button>
                </div>
            </div>
        </div>
    );
}