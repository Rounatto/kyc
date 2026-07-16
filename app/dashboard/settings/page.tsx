"use client";

import Header from "@/components/header";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { User, Lock, Bell, Code, ShieldAlert, Users, CreditCard } from "lucide-react"; 
import ProfSetting from "@/components/ProfSetting";
import SecurSetting from "@/components/SecurSetting";
import ApIwebhooksSetting from "@/components/API&webhooksSetting";
import NotifSetting from "@/components/NotifSetting";
import AuditSetting from "@/components/AuditSetting";
import TeamSetting from "@/components/TeamSetting";
import BillingSetting from "@/components/BillingTabSetting"; // 💡 IMPORT DU COMPOSANT BILLING (Renomme ton fichier BillingTab.tsx en BillingSetting.tsx si besoin)

export default function Settings() {
    const { data: session } = useSession();
    const [activeSetting, setActiveSetting] = useState("Profile Info");

    const isAdmin = (session?.user as any)?.role === "COMPANY_ADMIN";

    // 💡 TABLEAU DYNAMIQUE MIS À JOUR AVEC LE BILLING
    const menuItems = [
        { name: "Profile Info", icon: User },
        { name: "Security", icon: Lock },
        { name: "Notifications", icon: Bell },
        { name: "API & Webhooks", icon: Code },
        ...(isAdmin ? [
            { name: "Team Management", icon: Users },
            { name: "Billing & Plans", icon: CreditCard }, // 👈 Ajout de l'onglet Facturation
            { name: "Audit Trail", icon: ShieldAlert }
        ] : []),
    ];

    const renderContent = () => {
        switch (activeSetting) {
            case "Profile Info":
                return <ProfSetting />;
            case "Security":
                return <SecurSetting />;
            case "Notifications":
                return <NotifSetting />;
            case "API & Webhooks":
                return <ApIwebhooksSetting />;
            
            // 💡 CÂBLAGE DES TROIS ONGLETS ADMIN
            case "Team Management":
                return isAdmin ? <TeamSetting /> : null;
            case "Billing & Plans":
                return isAdmin ? <BillingSetting /> : null; // 👈 Le composant injecté ici
            case "Audit Trail":
                return isAdmin ? <AuditSetting /> : null;
            
            default:
                return null;
        }
    };

    return (
        <div className="w-full min-h-screen bg-gray-50 pb-12">
            <Header />
            <div className="px-4 lg:px-12 mt-8 max-w-[1200px]">
                <div className="mb-6 md:mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Account Settings</h2>
                    <p className="text-sm text-gray-500 mt-1 md:mt-1.5">Manage your personal information, security preferences, and integration keys.</p>
                </div>

                <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                    <div className="flex md:flex-col flex-row overflow-x-auto md:overflow-visible border-b md:border-b-0 md:border-l border-gray-200 md:w-56 shrink-0">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = (activeSetting === item.name);
                            return (
                                <button
                                    key={item.name}
                                    onClick={() => setActiveSetting(item.name)}
                                    className={`flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all whitespace-nowrap border-b-3 md:border-b-0 md:border-r-3 outline-none cursor-pointer
                                    ${isActive 
                                        ? "text-blue-700 border-blue-700 bg-blue-50/50" 
                                        : "text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900"}`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {item.name}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 w-full max-w-3xl">
                        {renderContent()} 
                    </div>
                </div>
            </div>
        </div>
    );
}