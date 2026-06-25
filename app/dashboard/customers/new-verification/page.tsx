"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, CheckCircle, ArrowLeft, PlusCircle, CreditCard, Calendar, Globe, AlertTriangle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/header";

// Imports de la librairie pour avoir la liste des pays et les préfixes
import { getCountries, getCountryCallingCode } from 'react-phone-number-input/input';
import en from 'react-phone-number-input/locale/en';

export default function NewVerificationPage() {
    const { data: session } = useSession();
    const router = useRouter();

    // -- Variables d'état (State) --
    const [customerName, setCustomerName] = useState("");
    const [email, setEmail] = useState("");
    const [type, setType] = useState("Individual KYC");
    const [status, setStatus] = useState("pending");
    const [score, setScore] = useState("--");
    
    const [cin, setCin] = useState("");
    const [documentType, setDocumentType] = useState("CIN");
    const [nationality, setNationality] = useState<string>("TN");
    const [dateOfBirth, setDateOfBirth] = useState("");
    
    // On stocke uniquement la partie locale du numéro
    const [localPhone, setLocalPhone] = useState<string>("");

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState(""); 

    // Calcul du préfixe téléphonique basé sur la nationalité (ex: "216")
    const callingCode = nationality ? getCountryCallingCode(nationality as any) : "";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(""); 

        // On assemble le préfixe intouchable et le numéro local
        let finalPhoneNumber = "Not specified";
        if (nationality && localPhone) {
            finalPhoneNumber = `+${callingCode} ${localPhone.trim()}`;
        }

        try {
            const response = await fetch("/api/customers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    customerName,
                    email,
                    type,
                    status,
                    score,
                    cin,
                    documentType,
                    nationality: nationality ? en[nationality as keyof typeof en] : "Not specified",
                    dateOfBirth,
                    phoneNumber: finalPhoneNumber,
                    userId: (session?.user as any)?.id,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
                setTimeout(() => {
                    router.push("/dashboard");
                }, 1500);
            } else {
                setErrorMessage(data.error || "Une erreur est survenue lors de l'enregistrement.");
            }
        } catch (error) {
            console.error(error);
            setErrorMessage("Erreur critique : Impossible de joindre le serveur. Vérifiez votre connexion.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full min-h-screen bg-gray-50">
            <Header />
            
            <div className="max-w-3xl mx-auto px-4 py-8">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Retour au Dashboard
                </Link>

                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 md:p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">New Identity Verification</h2>
                    <p className="text-sm text-gray-500 mb-8">Register a new client or entity to initiate the KYC/KYB verification pipeline. Unique Identification Number is mandatory.</p>

                    {success && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-3 text-sm font-medium">
                            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" /> Client identity registered successfully! Initiating pipeline...
                        </div>
                    )}
                    {errorMessage && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3 text-sm font-medium">
                            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" /> 
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        
                        {/* SECTION 1 : Personal Information */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">1. Personal Information</h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Full Name / Entity Name <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input type="text" placeholder="Ex: Eleanor Lewis" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Email Address <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input type="email" placeholder="Ex: e.lewis@corporate.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                
                                {/* LA CASE COUNTRY CONNECTÉE */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Country / Nationality <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <Globe className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <select 
                                            value={nationality} 
                                            onChange={(e) => setNationality(e.target.value)} 
                                            required
                                            className="w-full border border-gray-300 bg-white rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800 cursor-pointer"
                                        >
                                            <option value="">Select a country...</option>
                                            {getCountries().map((country) => (
                                                <option key={country} value={country}>
                                                    {en[country as keyof typeof en]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* LE CHAMP TÉLÉPHONE COMPOSÉ AVEC DRAPEAU CLIQUABLE ET SVG HD */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                                    <div className="flex items-center w-full border border-gray-300 rounded-lg focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 bg-white overflow-hidden transition-all h-[42px]">
                                        
                                        {/* BLOC DRAPEAU CLIQUABLE + PREFIXE VERROUILLÉ */}
                                        <div className="relative flex items-center justify-center gap-1.5 bg-gray-50 border-r border-gray-300 px-3 h-full text-sm text-gray-700 font-semibold hover:bg-gray-100 transition-colors">
                                            
                                            {/* Le vrai drapeau en SVG (ultra net) */}
                                            {nationality ? (
                                                <img 
                                                    src={`https://flagcdn.com/${nationality.toLowerCase()}.svg`} 
                                                    alt={nationality} 
                                                    className="w-5 h-3.5 object-cover rounded-[2px] shadow-sm"
                                                />
                                            ) : (
                                                <div className="w-5 h-3.5 bg-gray-200 rounded-[2px]"></div>
                                            )}
                                            
                                            {/* Le select invisible superposé sur le drapeau */}
                                            <select 
                                                value={nationality}
                                                onChange={(e) => setNationality(e.target.value)}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                title="Change country"
                                            >
                                                <option value="">Select country...</option>
                                                {getCountries().map((country) => (
                                                    <option key={country} value={country}>
                                                        {en[country as keyof typeof en]}
                                                    </option>
                                                ))}
                                            </select>

                                            {/* Le préfixe verrouillé */}
                                            <span>{callingCode ? `+${callingCode}` : "+"}</span>
                                            
                                            {/* Petite flèche pour indiquer que c'est cliquable */}
                                            <svg className="w-3 h-3 text-gray-400 ml-[-2px] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                        
                                        {/* BLOC D'ÉCRITURE : Le reste du numéro */}
                                        <input
                                            type="tel"
                                            placeholder="Ex: 98 123 456"
                                            value={localPhone}
                                            onChange={(e) => setLocalPhone(e.target.value.replace(/[^0-9\s]/g, ''))}
                                            className="flex-1 text-sm text-gray-800 outline-none bg-transparent px-3 h-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Date of Birth</label>
                                    <div className="relative">
                                        <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SECTION 2 : Identification Data */}
                        <div className="flex flex-col gap-4 mt-2">
                            <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">2. Official Identification</h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Document Type <span className="text-red-500">*</span></label>
                                    <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="w-full border border-gray-300 bg-white rounded-lg py-2.5 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800 cursor-pointer">
                                        <option value="CIN">National ID (CIN)</option>
                                        <option value="Passport">Passport</option>
                                        <option value="Driving License">Driving License</option>
                                        <option value="Corporate ID">Corporate Tax ID</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-2 sm:col-span-2">
                                    <label className="text-sm font-semibold text-gray-700">Unique ID Number (CIN/Passport) <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <CreditCard className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input type="text" placeholder="Ex: 12345678" value={cin} onChange={(e) => setCin(e.target.value)} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SECTION 3 : System Settings */}
                        <div className="flex flex-col gap-4 mt-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">System Processing Settings</h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-gray-700">Procedure Type</label>
                                    <div className="relative">
                                        <Shield className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 bg-white rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800 cursor-pointer">
                                            <option value="Individual KYC">Individual KYC</option>
                                            <option value="Corporate KYB">Corporate KYB</option>
                                            <option value="Entity Screening">Entity Screening</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-gray-700">Initial Status</label>
                                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-gray-300 bg-white rounded-lg py-2 px-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800 cursor-pointer">
                                        <option value="pending">Pending</option>
                                        <option value="verified">Verified</option>
                                        <option value="rejected">Rejected</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-gray-700">Risk Score Overide</label>
                                    <input type="text" placeholder="Ex: 94/100" value={score} onChange={(e) => setScore(e.target.value)} className="w-full border border-gray-300 rounded-lg py-2 px-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800" />
                                </div>
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="mt-4 flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-sm transition-colors disabled:bg-blue-400 cursor-pointer text-sm">
                            <PlusCircle className="w-4 h-4" />
                            {loading ? "Registering profile..." : "Initiate Verification Pipeline"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}