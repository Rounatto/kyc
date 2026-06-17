"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Scale} from "lucide-react";
import { useRouter } from "next/navigation";

export default function Register() {
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");

    const correctLength = password.length >= 12;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isValid = correctLength && hasSpecialChar;
    
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!isValid) {
            setError("Veuillez respecter les critères de mot de passe.");
            return;
        }
        console.log("Tentative d'inscription avec :", { fullName, companyName, email, password});
        alert("L'interface fonctionne ! (La base de données sera branche a l'etape suivante)");
        router.push("/login");
    }


    return (
        <div className="flex h-screen w-full flex-row bg-gray-100 overflow-hidden">{/*Plus grand div page entiere*/}
            <div className="hidden lg:flex flex-col w-[450px] shrink-0 h-[85%]">{/*colonne invisible de la carte bleue*/}
                <div className="flex flex-col w-full h-full items-start justify-center gap-16 p-12 bg-blue-700 text-white shadow-md overflow-hidden">{/*div de la carte bleu*/}
                    <div className="flex flex-col gap-4 xl:gap-6 w-full">{/*div qui groupe le titre et les paragraphes*/}
                        <h1 className="font-bold text-white mb-4 text-3xl">TrustVerify</h1>
                        <p className="text-4xl leading-tight font-bold mt-4"><b>Secure identity verification for global enterprises</b></p>
                        <p className="text-sm text-blue-100 leading-relaxed max-w-sm">Automate your KYC/AML workflows with 99.9% accuracy and absolute compliance confidence</p>
                    </div>
                    <div className="flex flex-col gap-4 xl:gap-6 w-full">{/*div qui groupe les 3 logos et paragraphes*/}
                        <div className="flex flex-row items-start gap-3 xl:gap-4">{/*1 logo et paragraphes*/}
                            <div className="p-3 bg-blue-600 rounded-lg shrink-0 text-xl"><ShieldCheck /></div>
                            <div className="flex flex-col gap-1">
                                <p className="flex text-sm font-bold text-white">Bank-Grade Encryption</p>
                                <p className="flex text-xs text-blue-100 max-w-xs leading-relaxed">Your data is secured with AES-256 at rest and TLS 1.3 in transit.</p>
                            </div>
                        </div>
                        <div className="flex flex-row items-start gap-3 xl:gap-4">{/*1 logo et paragraphes*/}
                            <div className="p-3 bg-blue-600 rounded-lg shrink-0 text-xl"><Scale /></div>
                            <div className="flex flex-col gap-1">
                                <p className="flex text-sm font-bold text-white">Global Compliance</p>
                                <p className="flex text-xs text-blue-100 max-w-xs leading-relaxed">Fully GDPR, SOC2, and CCPA compliant verification engines.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center flex-1 h-full p-6 lg:p-8 overflow-y-auto">{/*div qui groupe la carte blanche a droite*/}
                <div className="flex flex-col w-full max-w-md bg-white rounded-lg border border-gray-200 p-8 shadow-sm">{/*div de la carte blanche*/}
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
                        <p className="text-sm text-gray-500 mt-1">Start your 14-day premium trial today.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">{/*div du formulaire*/}
                        <div className="flex flex-row gap-4">{/*div qui groupe les inputs Fullname et Company Name*/}
                            <div className="flex flex-col flex-1">{/*div des inputs nom et prenom*/}
                                <label className="text-sm font-medium text-gray-700"> Full Name</label>
                                <input type="text" placeholder="Jhon Doe" className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm outline-none text-gray-600 focus:border-blue-500" value={fullName} onChange={(e) => setFullName(e.target.value)} required/>
                            </div>
                            <div className="flex flex-col flex-1">{/*div de l'input Company Name*/}
                                <label className="text-sm font-medium text-gray-700">Company Name</label>
                                <input type="text" placeholder="Acme Corp" className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm outline-none text-gray-600 focus:border-blue-500" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required/>
                            </div>
                        </div>
                        <div className="flex flex-col">{/*div de l'input email*/}
                            <label className="text-sm font-medium text-gray-700">Business Email</label>
                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-md py-3 px-3 mb-1 focus-within:border-blue-500 focus-within:ring-0 focus-within:ring-blue-400">{/*div de l'input email*/}
                                <span className="flex h-5 w-5 items-center justify-center text-gray-600" aria-hidden="true">
                                    <Mail className="text-gray-500"/>
                                </span>
                                <input type="email" placeholder="name@company.com" className="w-full outline-none text-sm text-gray-600" value={email} onChange={(e) => setEmail(e.target.value)} required/>
                            </div>
                        </div>
                        <div className="flex flex-col">{/*div de l'input password*/}
                            <label className="text-sm font-medium text-gray-700">Password</label>
                            <div className="flex items-center gap-2 w-full border border-gray-300 rounded-md py-3 px-3 mb-1 focus-within:border-blue-500 focus-within:ring-0 focus-within:ring-blue-400">{/*div de l'input password*/}
                                <span className="flex h-5 w-5 items-center justify-center text-gray-600" aria-hidden="true">
                                    <Lock className="text-gray-500" />
                                </span>
                                <input type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full outline-none text-sm text-gray-600" value={password} onChange={(e) => setPassword(e.target.value)} required/>
                                <span className="text-gray-500 cursor-pointer" aria-hidden="true" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOff className="text-gray-500"/> : <Eye className="text-gray-500"/>}
                                </span>
                            </div>
                            <p className={`text-sm font-medium ${password.length === 0 ? "text-gray-700" : isValid ? "text-green-500" : "text-red-500"}`}>
                                Must be at least 12 characters with 1 special symbol.
                            </p>
                        </div>
                        <button className="w-full bg-blue-700 text-white py-2 px-4 rounded-sm hover:bg-blue-600 transition-colors text-sm font-medium mt-4" type="submit">Create Account</button>
                        <div className="w-full h-[2px] bg-gray-200 mt-4"></div>
                        <p className="text-sm text-gray-500 text-center">Already have an account? <Link href="/login" className="text-blue-600 hover:underline">Log in</Link></p>
                    </form>
                </div>
            </div>
        </div> 
    );                   
}