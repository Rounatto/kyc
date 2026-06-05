"use client";

import { useState } from "react";
import Link from "next/link";

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    return (
        <div className="flex min-h-screen w-full flex-col justify-between items-center py-3 bg-gray-100">{/*Plus grand div page entiere*/}
                <div className="flex flex-row w-full justify-between items-center px-8">{/*div de trust verify et ?*/}
                    <h1 className="text-xl font-bold text-blue-700">TrustVerify</h1>
                    <span className="text-gray-500 cursor-pointer hover:text-gray-700 text-lg" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9" />
                            <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
                            <path d="M12 11v4" />
                        </svg>
                    </span>
                </div>
            <div className="flex flex-col items-center justify-center flex-1 w-full gap-4 justify-center">{/*div qui groupe la carte blanche centrale et le all systems operational*/}
                <div className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-8 border border-gray-200">{/*carte blanche centrale*/}
                    <div className="text-center mb-3 text-2xl font-bold">{/*div du titre et du sous-titre*/}
                        <h1 className="text-2xl font-bold text-black">Welcome Back</h1>
                        <p className="text-sm text-gray-500 m-2">Please enter your details to sign in</p>
                    </div>
                    <div className="flex flex-col">{/*div du formulaire*/}
                        <label className="text-sm font-medium text-black">Email address</label>
                        <div className="flex items-center gap-2 w-full border border-gray-300 rounded-md py-3 px-3 mb-5 bg-gray-100 focus-within:border-blue-400 focus-within:ring-0 focus-within:ring-blue-400">{/*div de l'input email*/}
                            <span className="flex h-5 w-5 items-center justify-center text-black" aria-hidden="true">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M3 8.5v7A2.5 2.5 0 0 0 5.5 18h13A2.5 2.5 0 0 0 21 15.5v-7A2.5 2.5 0 0 0 18.5 6h-13A2.5 2.5 0 0 0 3 8.5z" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M21 8l-9 6-9-6" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </span>
                            <input type="email" placeholder="name@company.com" className="w-full outline-none text-sm text-gray-600"/>
                        </div>
                        <div className="flex flex-row items-center justify-between">{/*div du label et du lien mot de passe oublié*/}
                            <label className="text-sm font-medium text-black">Password</label>
                            <Link href="/forgot-password" className="text-sm text-blue-700 font-medium hover:underline">
                                Forgot password?
                            </Link>
                        </div>
                        <div className="flex items-center gap-2 w-full border border-gray-300 rounded-md py-3 px-3 mb-5 bg-gray-100 focus-within:border-blue-400 focus-within:ring-0 focus-within:ring-blue-400">{/*div de l'input password*/}
                            <span className="flex h-5 w-5 items-center justify-center text-black" aria-hidden="true">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="3" y="10" width="18" height="10" rx="2" stroke="#111827" strokeWidth="1.5"/>
                                    <path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="#111827" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                            </span>
                            <input type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full outline-none text-sm text-gray-600"/>
                            <span className="text-gray-600 cursor-pointer" aria-hidden="true" onClick={() => setShowPassword(!showPassword)}>
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <circle cx="12" cy="12" r="3" stroke="#4B5563" strokeWidth="1.5"/>
                                </svg>
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mb-5">{/*div du remember me*/}
                            <input type="checkbox" id="remember" className="h-4 w-4 rounded border-gray-100 focus:ring-gray-700"/>
                            <label className="text-sm text-gray-600">Remember for 30 days</label>
                        </div>
                        <div className="flex items-center w-full justify-center bg-blue-700 hover:bg-blue-800 text-white rounded-md shadow-md transition duration-200 my-2 py-2 mb-3 text-sm font-medium cursor-pointer">{/*div du bouton sign in*/}
                            Sign in
                        </div>
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
                                    <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none">
                                        <path d="M12 2c-3.9 0-7 3.1-7 7v1" stroke="#111827" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M5 10v1c0 4 3 7 7 7s7-3 7-7v-1" stroke="#111827" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M12 6a4 4 0 0 0-4 4v1" stroke="#111827" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M8 11c0 2.2 1.8 4 4 4s4-1.8 4-4" stroke="#111827" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M12 14v2" stroke="#111827" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
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
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-200 border border-gray-200 text-sm text-gray-700">{/*div du all systems operational*/}
                    <span className="h-2 w-2 rounded-full bg-green-500"></span>
                    All systems operational
                </div>
            </div>{}
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