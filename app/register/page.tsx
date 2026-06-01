"use client";

import { useState } from "react";
import Link from "next/link";

export default function Register() {
    const [showPassword, setShowPassword] = useState(false);
    return (
        <div className="flex min-h-screen w-full flex-row bg-gray-100">{/*Plus grand div page entiere*/}
            <div className="flex flex-col w-[40%] min-h-screen items-start justify-start p-12 bg-blue-600 px-8 py-5">{/*div de trust verify a gauche*/}
                <h1 className="flex text-3xl font-bold text-white mb-4">TrustVerify</h1>
                <p className="flex text-lg text-white mb-6">Secure identity verification for global enterprises</p>
                <p className="flex text-sm text-white">Automate your KYC/AML workflows with 99.9% accuracy and absolute compliance confidence</p>
                <div className="flex flex-row items-center justify-center gap-4 mt-6">{/*1 logo et paragraphes*/}
                    <p>logo securite</p>
                    <div className="flex flex-col">
                        <p className="flex text-sm font-bold text-white mt-2">Bank-Grade Encryption</p>
                        <p className="flex text-sm text-white">Your data is secured with AES-256 at rest and TLS 1.3 in transit.</p>
                    </div>
                </div>
                <div className="flex flex-row items-center justify-center gap-4 mt-6">{/*1 logo et paragraphes*/}
                    <p>logo marteau adjugé</p>
                    <div className="flex flex-col">
                        <p className="flex text-sm font-bold text-white mt-2">Global Compliance</p>
                        <p className="flex text-sm text-white">Fully GDPR, SOC2, and CCPA compliant verification engines.</p>
                    </div>
                </div>

            </div>
            <div className="flex flex-col items-center justify-center flex-1 min-h-screen p-8">{/*div qui groupe la carte blanche a droite*/}
                <h2 className="flex text-2xl font-bold text-gray-800 mb-4">Create Your Account</h2>
            </div>
        </div>
    );
}