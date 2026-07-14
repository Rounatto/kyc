"use client";

import { useState, useEffect } from "react";
import { Plus, Eye, Trash2, Info, Loader2, ShieldAlert, CheckCircle2, Copy, X } from "lucide-react";

interface ApiKeyRecord {
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
}

export default function ApIwebhooksSetting() {
    const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // États pour la création
    const [showGenerateForm, setShowGenerateForm] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [newKeyName, setNewKeyName] = useState("");
    const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/settings/apikeys");
            if (res.ok) {
                const data = await res.json();
                setKeys(data.keys || []);
            }
        } catch (error) {
            console.error("Failed to fetch API keys");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim()) return;

        setIsGenerating(true);
        try {
            const res = await fetch("/api/settings/apikeys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newKeyName })
            });
            const data = await res.json();
            
            if (res.ok) {
                setNewlyGeneratedKey(data.keyData.keyValue);
                setNewKeyName("");
                setShowGenerateForm(false);
                fetchKeys(); // Met à jour la table
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert("Network error.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRevokeKey = async (keyId: string, keyName: string) => {
        if (!confirm(`Are you sure you want to permanently revoke '${keyName}'? Any systems using this key will immediately lose access.`)) return;

        try {
            const res = await fetch("/api/settings/apikeys", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyId })
            });
            
            if (res.ok) {
                setKeys(keys.filter(k => k.id !== keyId));
            } else {
                alert("Failed to revoke key.");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleCopy = () => {
        if (newlyGeneratedKey) {
            navigator.clipboard.writeText(newlyGeneratedKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            
            {/* ALERTE SÉCURITÉ : AFFICHAGE UNIQUE DE LA CLÉ */}
            {newlyGeneratedKey && (
                <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-5 md:p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className="w-5 h-5 text-blue-700" />
                        <h3 className="font-bold text-blue-900 text-sm md:text-base">Your New Secret Key</h3>
                    </div>
                    <p className="text-xs md:text-sm text-blue-800 mb-4">
                        Please copy this key and store it somewhere safe. <strong>For security reasons, we will never display it again.</strong>
                    </p>
                    
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                        <code className="flex-1 bg-white border border-blue-200 p-3 rounded-lg text-sm font-mono text-gray-900 break-all select-all shadow-inner">
                            {newlyGeneratedKey}
                        </code>
                        <button 
                            onClick={handleCopy}
                            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-bold text-white transition-colors cursor-pointer ${copied ? 'bg-green-600' : 'bg-blue-700 hover:bg-blue-800'}`}
                        >
                            {copied ? <CheckCircle2 className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}
                            {copied ? "Copied!" : "Copy Key"}
                        </button>
                    </div>
                    
                    <button 
                        onClick={() => setNewlyGeneratedKey(null)}
                        className="mt-4 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                        I have saved it securely. Hide this alert.
                    </button>
                </div>
            )}

            {/* TABLEAU ET GESTION */}
            <div className="flex flex-col w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex flex-row justify-between items-center px-4 md:px-6 py-4 md:py-5 border-b border-gray-200 bg-gray-50/50 gap-4">
                    <h3 className="text-base md:text-lg font-bold text-gray-900 shrink-0">API Access Keys</h3>
                    <button 
                        onClick={() => setShowGenerateForm(!showGenerateForm)}
                        disabled={!!newlyGeneratedKey}
                        className="flex items-center justify-center gap-1.5 bg-blue-700 text-white px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-bold hover:bg-blue-800 transition-colors shadow-sm shrink-0 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                        {showGenerateForm ? <X className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" /> : <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />}
                        {showGenerateForm ? "Cancel" : "Generate New Key"}
                    </button>
                </div>
                
                {/* FORMULAIRE DE GÉNÉRATION DÉROULANT */}
                {showGenerateForm && !newlyGeneratedKey && (
                    <div className="p-4 md:p-6 bg-blue-50/30 border-b border-gray-200 animate-in slide-in-from-top-2 duration-200">
                        <form onSubmit={handleGenerateKey} className="flex flex-col sm:flex-row gap-3">
                            <input 
                                type="text" 
                                required
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="Key Label (e.g., Production Node.js Server)" 
                                className="flex-1 border border-gray-300 rounded-lg py-2.5 px-4 text-sm outline-none focus:border-blue-500 transition-colors bg-white shadow-sm"
                            />
                            <button 
                                type="submit" 
                                disabled={isGenerating}
                                className="flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-black transition-colors disabled:opacity-50 shrink-0 shadow-sm cursor-pointer"
                            >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin"/> : "Confirm Generation"}
                            </button>
                        </form>
                    </div>
                )}

                <div className="w-full overflow-hidden">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                            <tr>
                                <th className="w-[30%] md:w-[22%] px-3 md:px-4 py-3 md:py-4 font-bold text-left truncate">LABEL</th>
                                <th className="w-[40%] md:w-[33%] px-2 md:px-4 py-3 md:py-4 font-bold text-left truncate">KEY HINT</th>
                                <th className="w-[15%] md:w-[15%] px-2 md:px-4 py-3 md:py-4 font-bold text-left truncate">CREATED</th>
                                <th className="w-[15%] md:w-[15%] px-2 md:px-4 py-3 md:py-4 font-bold text-left truncate">LAST USED</th>
                                <th className="hidden md:table-cell md:w-[15%] px-2 md:px-4 py-3 md:py-4 font-bold text-center truncate">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[11px] md:text-sm text-gray-700 font-medium">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12">
                                        <Loader2 className="w-6 h-6 animate-spin text-blue-700 mx-auto" />
                                    </td>
                                </tr>
                            ) : keys.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-gray-400 font-medium text-sm">
                                        No active API keys found. Generate one to connect your systems.
                                    </td>
                                </tr>
                            ) : (
                                keys.map((key) => (
                                    <tr key={key.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-3 md:px-4 py-4">
                                            <div className="truncate w-full font-bold text-gray-900">
                                                {key.name}
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-4 py-4">
                                            <div className="w-full flex items-center">
                                                <span className="bg-gray-100 text-gray-600 px-1.5 md:px-2 py-1 rounded font-mono text-[10px] md:text-xs truncate max-w-full block">
                                                    tv_live_••••••••••••••••
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-4 py-4">
                                            <div className="truncate w-full text-gray-500">
                                                {new Date(key.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-4 py-4">
                                            <div className="truncate w-full text-gray-500">
                                                {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell px-2 md:px-4 py-4">
                                            <div className="flex items-center justify-center gap-2 md:gap-3 w-full">
                                                <Eye className="w-4 h-4 md:w-5 md:h-5 text-gray-400 hover:text-gray-900 cursor-pointer transition-colors shrink-0" />
                                                <button onClick={() => handleRevokeKey(key.id, key.name)} className="bg-transparent border-none p-0 outline-none">
                                                    <Trash2 className="w-4 h-4 md:w-5 md:h-5 text-red-400 hover:text-red-600 cursor-pointer transition-colors shrink-0" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* DOCUMENTATION BLOCK */}
            <div className="flex flex-row items-start gap-3 md:gap-4 p-5 md:p-6 bg-blue-50/60 rounded-xl border border-blue-100/80">
                <Info className="w-5 h-5 md:w-6 md:h-6 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1.5 md:gap-2">
                    <h4 className="text-sm font-bold text-gray-900">Developer Documentation</h4>
                    <p className="text-xs md:text-sm text-gray-600 leading-relaxed">
                        Need help integrating TrustVerify into your application? Explore our comprehensive API documentation and SDK guides.
                    </p>
                    <button className="text-xs md:text-sm font-bold text-blue-700 mt-1 md:mt-2 hover:underline w-max flex items-center cursor-pointer">
                        Read Documentation <span className="ml-1 text-lg leading-none">→</span>
                    </button>
                </div>
            </div>
        </div>
    );
}