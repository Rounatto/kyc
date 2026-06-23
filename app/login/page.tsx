"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Mail, Lock,Circle, EyeOff, FingerprintPattern, CircleQuestionMark } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import  LoginBtn  from "@/components/login-btn";

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const [rememberMe, setRememberMe] = useState(false);

    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const resultat = await signIn("credentials", {
            email: email,
            password: password,
            rememberMe: rememberMe.toString(),
            redirect: false,
        });

        if (resultat?.error) {
            setError("Email ou mot de passe incorrect.");
        } else {
            router.push("/dashboard");
        }
    };
    return (
        <div className="flex min-h-screen w-full flex-col justify-between items-center py-3 bg-gray-100">{/*Plus grand div page entiere*/}
                <div className="flex flex-row w-full justify-between items-center px-8">{/*div de trust verify et ?*/}
                    <h1 className="text-xl font-bold text-blue-700">TrustVerify</h1>
                    <span className="text-gray-500 cursor-pointer hover:text-gray-700 text-lg" aria-hidden="true">
                        <CircleQuestionMark className="text-gray-500 w-5 h-5" />
                    </span>
                </div>
            <div className="flex flex-col items-center justify-center flex-1 w-full gap-4 justify-center">{/*div qui groupe la carte blanche centrale et le all systems operational*/}
                <div className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-8 border border-gray-200">{/*carte blanche centrale*/}
                    <div className="text-center mb-3 text-2xl font-bold">{/*div du titre et du sous-titre*/}
                        <h1 className="text-2xl font-bold text-black">Welcome Back</h1>
                        <p className="text-sm text-gray-500 m-2">Please enter your details to sign in</p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col">{/*div du formulaire*/}
                        <label className="text-sm font-medium text-black">Email address</label>
                        <div className="flex items-center gap-2 w-full border border-gray-300 rounded-md py-3 px-3 mb-5 bg-gray-100 focus-within:border-blue-400 focus-within:ring-0 focus-within:ring-blue-400">{/*div de l'input email*/}
                            <span className="flex h-5 w-5 items-center justify-center text-black" aria-hidden="true">
                                <Mail className="text-gray-500" />
                            </span>
                            <input type="email" placeholder="name@company.com" className="w-full outline-none text-sm text-gray-600" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div className="flex flex-row items-center justify-between">{/*div du label et du lien mot de passe oublié*/}
                            <label className="text-sm font-medium text-black">Password</label>
                            <Link href="/forgot-password" className="text-sm text-blue-700 font-medium hover:underline">
                                Forgot password?
                            </Link>
                        </div>
                        <div className="flex items-center gap-2 w-full border border-gray-300 rounded-md py-3 px-3 mb-5 bg-gray-100 focus-within:border-blue-400 focus-within:ring-0 focus-within:ring-blue-400">{/*div de l'input password*/}
                            <span className="flex h-5 w-5 items-center justify-center text-black" aria-hidden="true">
                                <Lock className="text-gray-500" />
                            </span>
                            <input type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full outline-none text-sm text-gray-600" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <span className="text-gray-500 cursor-pointer" aria-hidden="true" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff className="text-gray-500" /> : <Eye className="text-gray-500" />}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mb-5">{/*div du remember me*/}
                            <input type="checkbox" id="remember" className="h-4 w-4 rounded border-gray-100 focus:ring-gray-700" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}/>
                            <label className="text-sm text-gray-600">Remember for 15 days</label>
                        </div>
                        {error && <p className="text-red-500 text-sm mb-4 text-center font-medium">{error}</p>}
                        <LoginBtn />
                        <div className="flex flex-row items-center my-4 gap-2 justify-center">{/*div du or continue with*/}
                            <span className="flex-1 h-[2px] bg-gray-200"></span>
                            <span className="text-sm text-gray-700">or continue with</span>
                            <span className="flex-1 h-[2px] bg-gray-200"></span>
                        </div>
                        <div className="flex flex-row items-center gap-4 w-full">{/*div des boutons google et passkey*/}
                            <div className="flex flex-row items-center justify-center py-1.5 px-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-100 transition duration-200 w-full">{/*div du bouton google*/}
                                <span className="flex h-5 w-5 items-center justify-center" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.2-1.9 2.9v2.4h3c1.8-1.6 3.1-4 3.1-7.1Z" fill="#4285F4"/>
                                        <path d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.4c-.9.6-2 .9-3.4.9-2.6 0-4.7-1.7-5.6-4H3.3v2.5A10 10 0 0 0 12 22Z" fill="#34A853"/>
                                        <path d="M6.4 13.1c-.2-.6-.4-1.3-.4-2.1s.2-1.5.4-2.1V6.4H3.3A10 10 0 0 0 2 12c0 1.6.4 3.1 1.3 4.4l3.1-3.3Z" fill="#FBBC05"/>
                                        <path d="M12 5.3c1.4 0 2.7.5 3.7 1.4l2.8-2.8A10 10 0 0 0 12 2 10 10 0 0 0 3.3 6.4l3.1 2.5c.9-2.3 3-3.6 5.6-3.6Z" fill="#EA4335"/>
                                    </svg>
                                </span>
                                <p className="ml-2 text-sm text-gray-800">Google</p>{/*changement!!*/}
                            </div>
                            <div className="flex items-center justify-center py-1.5 px-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-100 transition duration-200 w-full">{/*div du bouton passkey*/}
                                <span className="flex h-5 w-5 items-center justify-center" aria-hidden="true">
                                    <FingerprintPattern className="text-gray-500" />
                                </span>
                                <p className="ml-2 text-sm text-gray-800">Passkey</p>{/*changement!!*/}
                            </div>
                        </div>
                        <div className="flex flex-row items-center justify-center gap-2 my-3">{/*div du don't have an account*/}
                            <p className="text-sm text-gray-700">Don't have an account?</p>
                            <Link href="/register" className="text-sm text-blue-600 hover:underline">
                                Create an account
                            </Link>
                        </div>
                    </form>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-200 border border-gray-200 text-sm text-gray-700">{/*div du all systems operational*/}
                    <span className="h-2 w-2 rounded-full bg-green-500"></span>
                    All systems operational
                </div>
            </div>
            <div className="flex flex-row items-center gap-10 mb-4 text-sm text-gray-500 justify-center">{/*div du footer*/}
                <Link href="/privacy-policy" className="hover:underline hover:text-gray-700">
                    Privacy Policy
                </Link>
                <Link href="/terms-of-service" className="hover:underline hover:text-gray-700">
                    Terms of Service
                </Link>
                <Link href="/support" className="hover:underline hover:text-gray-700">
                    Support
                </Link>
            </div>
        </div>
    );
}