"use client";

import { useState, useRef } from "react"; 
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, ArrowLeft, PlusCircle, CreditCard, Calendar, Globe, AlertTriangle, FileText, Camera, X } from "lucide-react"; 
import Link from "next/link";
import Header from "@/components/header";
import { toast } from "sonner";
import { getCountries, getCountryCallingCode } from 'react-phone-number-input/input';
import en from 'react-phone-number-input/locale/en';
import { useUploadThing } from "@/utils/uploadthing";

export default function NewVerificationPage() {
    const { data: session } = useSession();
    const router = useRouter();

    const [customerName, setCustomerName] = useState("");
    const [email, setEmail] = useState("");
    const [type, setType] = useState("Individual KYC (Standard)");
    const [cin, setCin] = useState("");
    const [documentType, setDocumentType] = useState("CIN");
    const [nationality, setNationality] = useState<string>("TN");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [localPhone, setLocalPhone] = useState<string>("");

    const [idCardFile, setIdCardFile] = useState<File | null>(null);
    const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

    const idCardInputRef = useRef<HTMLInputElement>(null);
    const selfieInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState("");
    const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
    const [globalError, setGlobalError] = useState("");

    const callingCode = nationality ? getCountryCallingCode(nationality as any) : "";
    const { startUpload } = useUploadThing("kycDocumentUploader");

    const validateForm = () => {
        const errors: { [key: string]: string } = {};
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) errors.email = "Invalid email format.";

        if (documentType === "CIN") {
            if (nationality === "TN") {
                const tnCinRegex = /^[0-9]{8}$/;
                if (!tnCinRegex.test(cin)) errors.cin = "Tunisian CIN must be exactly 8 digits.";
            } else if (nationality === "FR") {
                const frCinRegex = /^[0-9A-Z]{12}$/i;
                if (!frCinRegex.test(cin)) errors.cin = "French ID must be 12 characters.";
            } else {
                if (cin.length < 5) errors.cin = "ID number is too short.";
            }
        } else if (documentType === "Passport") {
            const passportRegex = /^[A-Z0-9]{6,9}$/i;
            if (!passportRegex.test(cin)) errors.cin = "Invalid passport format (6-9 characters).";
        }

        if (localPhone) {
            if (nationality === "TN") {
                const tnPhoneRegex = /^[234579][0-9]{7}$/;
                if (!tnPhoneRegex.test(localPhone)) errors.localPhone = "Invalid Tunisian number (e.g., 98 123 456).";
            } else {
                if (localPhone.length < 6 || localPhone.length > 14) errors.localPhone = "Invalid phone length.";
            }
        }

        if (dateOfBirth) {
            const birthDate = new Date(dateOfBirth);
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();
            if (age < 18) errors.dateOfBirth = "Client must be at least 18 years old.";
        }

        if (!idCardFile) errors.idCardFile = "Front ID Document is required.";
        if (!selfieFile) errors.selfieFile = "Selfie verification is required.";

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "idCard" | "selfie") => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setGlobalError("Please upload an image file (PNG, JPG).");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setGlobalError("File size must be under 5MB.");
            return;
        }

        const previewUrl = URL.createObjectURL(file);

        if (type === "idCard") {
            setIdCardFile(file);
            setIdCardPreview(previewUrl);
            setFieldErrors(prev => ({ ...prev, idCardFile: "" }));
        } else {
            setSelfieFile(file);
            setSelfiePreview(previewUrl);
            setFieldErrors(prev => ({ ...prev, selfieFile: "" }));
        }
    };

    const removeFile = (type: "idCard" | "selfie", e: React.MouseEvent) => {
        e.stopPropagation(); 
        if (type === "idCard") {
            setIdCardFile(null);
            setIdCardPreview(null);
            if (idCardInputRef.current) idCardInputRef.current.value = "";
        } else {
            setSelfieFile(null);
            setSelfiePreview(null);
            if (selfieInputRef.current) selfieInputRef.current.value = "";
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!validateForm()) {
            setGlobalError("Please fix the errors in the form before submitting.");
            return;
        }

        setLoading(true);
        setGlobalError(""); 

        let finalPhoneNumber = "Not specified";
        if (nationality && localPhone) {
            finalPhoneNumber = `+${callingCode} ${localPhone.trim()}`;
        }

        // Création de la promesse globale
        const registrationPromise = new Promise(async (resolve, reject) => {
            try {
                setLoadingText("Uploading secure documents...");
                
                let uploadedIdCardUrl = "";
                let uploadedSelfieUrl = "";

                if (idCardFile) {
                    const idRes = await startUpload([idCardFile]);
                    if (idRes && idRes[0]) uploadedIdCardUrl = idRes[0].ufsUrl;
                }
                if (selfieFile) {
                    const selfieRes = await startUpload([selfieFile]);
                    if (selfieRes && selfieRes[0]) uploadedSelfieUrl = selfieRes[0].ufsUrl;
                }

                if (!uploadedIdCardUrl || !uploadedSelfieUrl) {
                    throw new Error("Document upload failed. Please try again.");
                }

                setLoadingText("Analyzing AI Risk & Creating Profile...");
                
                const response = await fetch("/api/customers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        customerName,
                        email,
                        type,
                        cin,
                        documentType,
                        nationality: nationality ? en[nationality as keyof typeof en] : "Not specified",
                        dateOfBirth,
                        phoneNumber: finalPhoneNumber,
                        userId: (session?.user as any)?.id,
                        idCardUrl: uploadedIdCardUrl,
                        selfieUrl: uploadedSelfieUrl
                    }),
                });

                const data = await response.json();

                if (response.ok) {
                    resolve(data);
                    setTimeout(() => router.push("/dashboard"), 1500);
                } else {
                    reject(data.error || "An error occurred during registration.");
                }
            } catch (error: any) {
                reject(error.message || "Network error. Failed to initiate pipeline.");
            } finally {
                setLoading(false);
            }
        });

        // Déclenchement du Toast
        toast.promise(registrationPromise, {
            loading: "Processing KYC application...",
            success: "KYC Pipeline successfully initiated! Redirecting...",
            error: (err) => `${err}`,
        });
    };

    return (
        <div className="w-full min-h-screen bg-gray-50 pb-12">
            <Header />
            
            <div className="max-w-4xl mx-auto px-4 py-8">
                <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 font-medium mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Directory
                </Link>

                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 md:p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">New Identity Verification</h2>
                    <p className="text-sm text-gray-500 mb-8">Register a new client or entity to initiate the KYC/KYB pipeline.</p>
                    
                    {globalError && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3 text-sm font-medium">
                            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" /> 
                            <span>{globalError}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                        
                        <div className="flex flex-col gap-5">
                            <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">1. Personal Information</h3>
                            
                            <div className="flex flex-col sm:flex-row gap-5">
                                <div className="flex-1 flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Full Name <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input type="text" placeholder="Ex: Eleanor Lewis" value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={loading} required className="w-full border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 text-gray-800 disabled:bg-gray-50" />
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Email Address <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <Mail className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${fieldErrors.email ? 'text-red-500' : 'text-gray-400'}`} />
                                        <input type="email" placeholder="Ex: e.lewis@corporate.com" value={email} onChange={(e) => {setEmail(e.target.value); setFieldErrors({...fieldErrors, email: ""})}} disabled={loading} required className={`w-full border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors text-gray-800 disabled:bg-gray-50 ${fieldErrors.email ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`} />
                                    </div>
                                    {fieldErrors.email && <p className="text-xs text-red-600 font-medium">{fieldErrors.email}</p>}
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-5">
                                <div className="flex-1 flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Nationality <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <Globe className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <select value={nationality} onChange={(e) => {setNationality(e.target.value); setFieldErrors({...fieldErrors, cin: "", localPhone: ""})}} disabled={loading} required className="w-full border border-gray-300 bg-white rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 text-gray-800 cursor-pointer disabled:bg-gray-50">
                                            <option value="">Select a country...</option>
                                            {getCountries().map((country) => (
                                                <option key={country} value={country}>{en[country as keyof typeof en]}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                                    <div className={`flex items-center w-full border rounded-lg overflow-hidden transition-all h-[42px] ${loading ? 'bg-gray-50' : 'bg-white'} ${fieldErrors.localPhone ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500'}`}>
                                        <div className={`relative flex items-center justify-center gap-1.5 border-r border-gray-300 px-3 h-full text-sm text-gray-700 font-semibold ${loading ? 'bg-gray-100' : 'bg-gray-50'}`}>
                                            {nationality ? <img src={`https://flagcdn.com/${nationality.toLowerCase()}.svg`} alt={nationality} className="w-5 h-3.5 object-cover rounded-[2px]" /> : <div className="w-5 h-3.5 bg-gray-200 rounded-[2px]"></div>}
                                            <select value={nationality} onChange={(e) => setNationality(e.target.value)} disabled={loading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed">
                                                <option value="">Select...</option>
                                                {getCountries().map((country) => (<option key={country} value={country}>{en[country as keyof typeof en]}</option>))}
                                            </select>
                                            <span>{callingCode ? `+${callingCode}` : "+"}</span>
                                        </div>
                                        <input type="tel" placeholder="Ex: 98 123 456" value={localPhone} onChange={(e) => {setLocalPhone(e.target.value.replace(/[^0-9\s]/g, '')); setFieldErrors({...fieldErrors, localPhone: ""})}} disabled={loading} className="flex-1 text-sm text-gray-800 outline-none bg-transparent px-3 h-full disabled:cursor-not-allowed" />
                                    </div>
                                    {fieldErrors.localPhone && <p className="text-xs text-red-600 font-medium">{fieldErrors.localPhone}</p>}
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-5">
                                <div className="flex-1 flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Date of Birth</label>
                                    <div className="relative">
                                        <Calendar className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${fieldErrors.dateOfBirth ? 'text-red-500' : 'text-gray-400'}`} />
                                        <input type="date" value={dateOfBirth} onChange={(e) => {setDateOfBirth(e.target.value); setFieldErrors({...fieldErrors, dateOfBirth: ""})}} disabled={loading} className={`w-full border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors text-gray-800 disabled:bg-gray-50 ${fieldErrors.dateOfBirth ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`} />
                                    </div>
                                    {fieldErrors.dateOfBirth && <p className="text-xs text-red-600 font-medium">{fieldErrors.dateOfBirth}</p>}
                                </div>
                                <div className="hidden sm:block flex-1"></div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-5">
                            <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">2. Official Identification</h3>
                            
                            <div className="flex flex-col sm:flex-row gap-5">
                                <div className="w-full sm:w-1/3 flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Document Type <span className="text-red-500">*</span></label>
                                    <select value={documentType} onChange={(e) => {setDocumentType(e.target.value); setFieldErrors({...fieldErrors, cin: ""})}} disabled={loading} className="w-full border border-gray-300 bg-white rounded-lg py-2.5 px-3 text-sm outline-none focus:border-blue-500 text-gray-800 cursor-pointer disabled:bg-gray-50">
                                        <option value="CIN">National ID (CIN)</option>
                                        <option value="Passport">Passport</option>
                                        <option value="Driving License">Driving License</option>
                                    </select>
                                </div>

                                <div className="w-full sm:w-2/3 flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-gray-700">Unique ID Number <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <CreditCard className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${fieldErrors.cin ? 'text-red-500' : 'text-gray-400'}`} />
                                        <input type="text" placeholder={nationality === "TN" && documentType === "CIN" ? "Ex: 14066711 (8 digits)" : "Ex: 12345678"} value={cin} onChange={(e) => {setCin(e.target.value.toUpperCase()); setFieldErrors({...fieldErrors, cin: ""})}} disabled={loading} required className={`w-full border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors text-gray-800 disabled:bg-gray-50 ${fieldErrors.cin ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`} />
                                    </div>
                                    {fieldErrors.cin && <p className="text-xs text-red-600 font-medium">{fieldErrors.cin}</p>}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-5">
                            <h3 className="text-md font-bold text-gray-800 border-b border-gray-100 pb-2">3. Document Vault</h3>
                            
                            <div className="flex flex-col sm:flex-row gap-5">
                                {/* Upload ID Card */}
                                <div className="flex-1 flex flex-col gap-1">
                                    <input type="file" accept="image/*" className="hidden" ref={idCardInputRef} onChange={(e) => handleFileChange(e, "idCard")} disabled={loading} />
                                    <div 
                                        onClick={() => !loading && idCardInputRef.current?.click()}
                                        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center h-48 relative overflow-hidden transition-colors ${loading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer group'} ${fieldErrors.idCardFile ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400'}`}
                                    >
                                        {idCardPreview ? (
                                            <>
                                                <img src={idCardPreview} alt="ID Preview" className="absolute inset-0 w-full h-full object-cover" />
                                                {!loading && (
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <p className="text-white text-sm font-bold">Change Image</p>
                                                    </div>
                                                )}
                                                {!loading && (
                                                    <button type="button" onClick={(e) => removeFile("idCard", e)} className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className={`w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 transition-transform ${!loading && 'group-hover:scale-110'}`}>
                                                    <FileText className={`w-5 h-5 ${fieldErrors.idCardFile ? 'text-red-500' : 'text-gray-400'} ${!loading && 'group-hover:text-blue-600'}`} />
                                                </div>
                                                <p className="text-sm font-bold text-gray-700 mb-1">Upload Front ID</p>
                                                <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
                                            </>
                                        )}
                                    </div>
                                    {fieldErrors.idCardFile && <p className="text-xs text-red-600 font-medium text-center">{fieldErrors.idCardFile}</p>}
                                </div>

                                {/* Upload Selfie */}
                                <div className="flex-1 flex flex-col gap-1">
                                    <input type="file" accept="image/*" className="hidden" ref={selfieInputRef} onChange={(e) => handleFileChange(e, "selfie")} disabled={loading} />
                                    <div 
                                        onClick={() => !loading && selfieInputRef.current?.click()}
                                        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center h-48 relative overflow-hidden transition-colors ${loading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer group'} ${fieldErrors.selfieFile ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400'}`}
                                    >
                                        {selfiePreview ? (
                                            <>
                                                <img src={selfiePreview} alt="Selfie Preview" className="absolute inset-0 w-full h-full object-cover" />
                                                {!loading && (
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <p className="text-white text-sm font-bold">Change Image</p>
                                                    </div>
                                                )}
                                                {!loading && (
                                                    <button type="button" onClick={(e) => removeFile("selfie", e)} className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className={`w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 transition-transform ${!loading && 'group-hover:scale-110'}`}>
                                                    <Camera className={`w-5 h-5 ${fieldErrors.selfieFile ? 'text-red-500' : 'text-gray-400'} ${!loading && 'group-hover:text-blue-600'}`} />
                                                </div>
                                                <p className="text-sm font-bold text-gray-700 mb-1">Upload Selfie</p>
                                                <p className="text-xs text-gray-500">PNG or JPG file</p>
                                            </>
                                        )}
                                    </div>
                                    {fieldErrors.selfieFile && <p className="text-xs text-red-600 font-medium text-center">{fieldErrors.selfieFile}</p>}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 bg-gray-50 p-5 rounded-xl border border-gray-200 mt-2">
                            <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">System Processing Settings</h3>
                            
                            <div className="flex flex-col sm:flex-row gap-5">
                                <div className="flex-1 flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-gray-700">Procedure Type</label>
                                    <div className="relative">
                                        <Shield className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <select value={type} onChange={(e) => setType(e.target.value)} disabled={loading} className="w-full border border-gray-300 bg-white rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 text-gray-800 cursor-pointer disabled:bg-gray-50">
                                            <option value="Individual KYC (Standard)">Individual KYC (Standard)</option>
                                            <option value="Individual KYC (Enhanced)">Individual KYC (Enhanced - Biometrics)</option>
                                            <option value="Corporate KYB (Standard)">Corporate KYB (Standard)</option>
                                            <option value="Corporate KYB (UBO)">Corporate KYB (UBO Discovery)</option>
                                            <option value="AML/PEP Screening">AML & Sanctions Screening</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="hidden sm:block flex-1"></div>
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="mt-4 flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-not-allowed text-sm">
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    {loadingText || "Processing..."}
                                </>
                            ) : (
                                <>
                                    <PlusCircle className="w-5 h-5" /> Initiate Verification Pipeline
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}