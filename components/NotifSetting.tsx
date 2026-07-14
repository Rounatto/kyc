"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface NotificationPrefs {
    emailNotifSuccess: boolean;
    emailNotifAlerts: boolean;
    emailNotifWeekly: boolean;
}

export default function NotificationsSetting() {
    const [prefs, setPrefs] = useState<NotificationPrefs>({
        emailNotifSuccess: false,
        emailNotifAlerts: true,
        emailNotifWeekly: false
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState<string | null>(null);

    useEffect(() => {
        const fetchPreferences = async () => {
            try {
                const res = await fetch("/api/settings/notifications");
                if (res.ok) {
                    const data = await res.json();
                    setPrefs(data);
                }
            } catch (error) {
                console.error("Failed to load preferences");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPreferences();
    }, []);

    const handleToggle = async (key: keyof NotificationPrefs) => {
        // Optimistic UI Update (immédiatement visuel pour l'utilisateur)
        const newValue = !prefs[key];
        setPrefs(prev => ({ ...prev, [key]: newValue }));
        setIsSaving(key);

        try {
            await fetch("/api/settings/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [key]: newValue })
            });
        } catch (error) {
            // Rollback en cas d'erreur
            setPrefs(prev => ({ ...prev, [key]: !newValue }));
            console.error("Failed to save preference");
        } finally {
            setIsSaving(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex w-full items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
            </div>
        );
    }

    return (
        <div className="w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                <h3 className="text-base font-bold text-gray-900">Email Preferences</h3>
            </div>
            
            <div className="divide-y divide-gray-100">
                {/* Toggle 1: Success */}
                <div className="p-6 flex flex-row items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col gap-1 pr-4">
                        <h4 className="text-sm font-bold text-gray-900">Verification Success</h4>
                        <p className="text-xs text-gray-500">Notify me whenever a customer verification is completed successfully.</p>
                    </div>
                    <button 
                        onClick={() => handleToggle('emailNotifSuccess')}
                        disabled={isSaving === 'emailNotifSuccess'}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 cursor-pointer disabled:opacity-50 ${prefs.emailNotifSuccess ? 'bg-blue-700' : 'bg-gray-300'}`}
                    >
                        <span className={`w-4 h-4 bg-white rounded-full shadow-sm absolute transition-transform ${prefs.emailNotifSuccess ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Toggle 2: Audit/High Risk */}
                <div className="p-6 flex flex-row items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col gap-1 pr-4">
                        <h4 className="text-sm font-bold text-gray-900">Audit Required</h4>
                        <p className="text-xs text-gray-500">Alert me for verifications flagged for manual review or high risk.</p>
                    </div>
                    <button 
                        onClick={() => handleToggle('emailNotifAlerts')}
                        disabled={isSaving === 'emailNotifAlerts'}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 cursor-pointer disabled:opacity-50 ${prefs.emailNotifAlerts ? 'bg-blue-700' : 'bg-gray-300'}`}
                    >
                        <span className={`w-4 h-4 bg-white rounded-full shadow-sm absolute transition-transform ${prefs.emailNotifAlerts ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Toggle 3: Weekly */}
                <div className="p-6 flex flex-row items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col gap-1 pr-4">
                        <h4 className="text-sm font-bold text-gray-900">Weekly Reports</h4>
                        <p className="text-xs text-gray-500">Send a summary of all verification activities once a week.</p>
                    </div>
                    <button 
                        onClick={() => handleToggle('emailNotifWeekly')}
                        disabled={isSaving === 'emailNotifWeekly'}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 cursor-pointer disabled:opacity-50 ${prefs.emailNotifWeekly ? 'bg-blue-700' : 'bg-gray-300'}`}
                    >
                        <span className={`w-4 h-4 bg-white rounded-full shadow-sm absolute transition-transform ${prefs.emailNotifWeekly ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>
        </div>
    );
}