"use client";

import Link from "next/link";
import { 
    ShieldCheck, 
    Globe, 
    Cpu, 
    Code, 
    ArrowRight, 
    Menu, 
    Landmark, 
    Wallet, 
    Coins, 
    Shield, 
    Key,
    CheckCircle
} from "lucide-react";

export default function Home() {
    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200">
            
            {/* Top Navigation Bar */}
            <header className="bg-white h-16 border-b border-gray-200 shadow-sm flex justify-between items-center px-4 md:px-8 sticky top-0 z-50">
                <div className="flex items-center gap-10">
                    <Link href="/" className="text-xl font-bold text-blue-700">
                        TrustVerify
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                        <Link href="#solutions" className="text-gray-600 hover:text-blue-700 transition-colors">Solutions</Link>
                        <Link href="#pricing" className="text-gray-600 hover:text-blue-700 transition-colors">Pricing</Link>
                        <Link href="#resources" className="text-gray-600 hover:text-blue-700 transition-colors">Resources</Link>
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/login" className="hidden sm:block px-4 py-2 text-blue-700 text-sm font-semibold hover:bg-gray-100 transition-colors rounded-md">
                        Login
                    </Link>
                    <Link href="/register" className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-md hover:bg-blue-800 transition-colors shadow-sm">
                        Get Started
                    </Link>
                    <button className="md:hidden flex items-center text-gray-600">
                        <Menu className="w-6 h-6" />
                    </button>
                </div>
            </header>

            <main className="overflow-x-hidden">
                {/* Hero Section */}
                <section className="pt-16 pb-24 px-4 md:px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div className="flex flex-col gap-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 rounded-full w-fit">
                            <ShieldCheck className="w-4 h-4 text-blue-700" />
                            <span className="text-xs font-semibold text-blue-800 tracking-wide">Trusted by 500+ Global Enterprises</span>
                        </div>
                        <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-gray-900">
                            Verify with <span className="text-blue-700">Confidence.</span><br />Scale with Trust.
                        </h1>
                        <p className="text-lg text-gray-600 max-w-lg leading-relaxed">
                            The ultimate KYC/AML platform for global compliance. Experience bank-grade security, 99.9% verification accuracy, and seamless integration in minutes.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <Link href="/register" className="px-6 py-3 bg-blue-700 text-white font-semibold rounded-md hover:bg-blue-800 transition-colors shadow-md flex items-center justify-center gap-2">
                                Book a Demo <ArrowRight className="w-5 h-5" />
                            </Link>
                            <button className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center">
                                Start Free Trial
                            </button>
                        </div>
                        <p className="text-sm font-medium text-gray-500 pt-2">Join 2,000+ compliance teams worldwide</p>
                    </div>

                    {/* Image Placeholder */}
                    <div className="relative mt-8 lg:mt-0">
                        <div className="bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden relative z-10 w-full aspect-[4/3] flex items-center justify-center">
                            <span className="text-gray-400 font-medium">Dashboard Interface Visualization</span>
                        </div>
                        {/* Decor blobs */}
                        <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -z-10"></div>
                        <div className="absolute -top-8 -left-8 w-48 h-48 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -z-10"></div>
                    </div>
                </section>

                {/* Trust Bar */}
                <section className="py-10 bg-white border-y border-gray-200">
                    <div className="max-w-7xl mx-auto px-4 md:px-8">
                        <p className="text-center text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">Trusted by industry leaders</p>
                        <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-60">
                            <div className="flex items-center gap-2 font-bold text-xl text-gray-700"><Landmark className="w-6 h-6" /> BankCorp</div>
                            <div className="flex items-center gap-2 font-bold text-xl text-gray-700"><Wallet className="w-6 h-6" /> FinFlow</div>
                            <div className="flex items-center gap-2 font-bold text-xl text-gray-700"><Coins className="w-6 h-6" /> NexusPay</div>
                            <div className="flex items-center gap-2 font-bold text-xl text-gray-700"><Shield className="w-6 h-6" /> SecureVault</div>
                            <div className="flex items-center gap-2 font-bold text-xl text-gray-700"><Key className="w-6 h-6" /> CryptoCore</div>
                        </div>
                    </div>
                </section>

                {/* Feature Grid */}
                <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 mb-4">Enterprise-Grade Infrastructure</h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            Deploy a robust compliance stack designed for global scale, absolute precision, and uncompromised security.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="bg-white border border-gray-200 shadow-sm p-8 rounded-xl flex flex-col gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                                <Globe className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Global Compliance</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Stay ahead of evolving regulations with native GDPR, SOC2 Type II, and local AML compliance in over 190 countries.
                            </p>
                            <div className="flex gap-2 mt-auto pt-4">
                                <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-600">GDPR</span>
                                <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-600">SOC2</span>
                            </div>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-white border border-gray-200 shadow-sm p-8 rounded-xl flex flex-col gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                                <Cpu className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">AI Risk Scoring</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Proprietary AI analyzes biometric data and document authenticity in milliseconds for an instant, actionable risk score.
                            </p>
                            <div className="mt-auto pt-4 w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-blue-600 h-full w-[98%]"></div>
                            </div>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-white border border-gray-200 shadow-sm p-8 rounded-xl flex flex-col gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                                <Code className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Seamless Integration</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Integrate our API or Webhook system in less than a day. Our SDKs provide a white-label experience native to your product.
                            </p>
                            <div className="mt-auto pt-4 flex flex-col gap-2">
                                <span className="flex items-center gap-2 text-xs text-gray-600"><CheckCircle className="w-4 h-4 text-green-500"/> RESTful API</span>
                                <span className="flex items-center gap-2 text-xs text-gray-600"><CheckCircle className="w-4 h-4 text-green-500"/> React SDK</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="bg-gray-900 text-white pt-16 pb-8 px-4 md:px-8">
                    <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 border-b border-gray-800 pb-12 mb-8">
                        <div className="flex flex-col gap-4 md:col-span-2">
                            <h2 className="text-2xl font-bold text-white">TrustVerify</h2>
                            <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
                                The secure identity layer for the modern internet. Empowering businesses to trust their users through automated verification.
                            </p>
                        </div>
                        <div className="flex flex-col gap-4">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-gray-300">Product</h4>
                            <Link href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Identity Verification</Link>
                            <Link href="#" className="text-sm text-gray-400 hover:text-white transition-colors">AML Monitoring</Link>
                            <Link href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Risk Scoring</Link>
                        </div>
                        <div className="flex flex-col gap-4">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-gray-300">Resources</h4>
                            <Link href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Documentation</Link>
                            <Link href="#" className="text-sm text-gray-400 hover:text-white transition-colors">API Reference</Link>
                            <Link href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Security</Link>
                        </div>
                    </div>
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-sm text-gray-500">© 2026 TrustVerify Inc. All rights reserved.</p>
                        <div className="flex gap-6">
                            <Link href="/privacy-policy" className="text-sm text-gray-500 hover:text-white">Privacy Policy</Link>
                            <Link href="/terms-of-service" className="text-sm text-gray-500 hover:text-white">Terms</Link>
                        </div>
                    </div>
                </footer>
            </main>
        </div>
    );
}