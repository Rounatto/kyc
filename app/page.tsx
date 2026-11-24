"use client";

// ============================================================================
// 🏠 LANDING PAGE PUBLIQUE — CONTENU 100% MARKETING, AUCUN APPEL API
// ============================================================================
// ⚠️ Plusieurs éléments visuels n'ont pas (encore) de vraie destination :
//   - Les liens de nav "Solutions"/"Pricing"/"Resources" pointent vers des
//     ancres (#solutions, #pricing, #resources) qui N'EXISTENT PAS sur cette
//     page — un clic ne fait rien.
//   - Le bouton "Start Free Trial" n'a ni `href` ni `onClick` : bouton mort.
//   - Les liens du footer ("Identity Verification", "API Reference"...)
//     pointent vers "#" (placeholder).
//   - "Privacy Policy" et "Terms" pointent vers /privacy-policy et
//     /terms-of-service, qui N'EXISTENT PAS dans ce projet (404 garanti) —
//     bloquant pour un vrai lancement (obligation légale RGPD).
// 🆕 Les chiffres et allégations fictifs ("500+ Global Enterprises", "99.9%",
//    "2,000+ teams", "SOC2", faux logos clients, "TrustVerify Inc.") ont été
//    RETIRÉS et remplacés par la description des fonctionnalités réellement
//    implémentées. Le site est présenté comme un projet de démonstration.
import Link from "next/link";
import {
    ShieldCheck,
    Globe,
    Cpu,
    Lock, // 🆕 icône de la carte "Secure by design" (remplace Code)
    ArrowRight,
    Menu,
    CheckCircle
    // 🆕 Landmark, Wallet, Coins, Shield, Key, Code retirés : ils ne servaient
    //    qu'aux faux logos clients et à l'ancienne carte "Seamless Integration".
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
                    {/* Bouton hamburger sans onClick : n'ouvre aucun menu mobile pour l'instant */}
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
                            {/* 🆕 Remplace "Trusted by 500+ Global Enterprises" (chiffre fictif) */}
                            <span className="text-xs font-semibold text-blue-800 tracking-wide">Demo project · KYC identity verification</span>
                        </div>
                        <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-gray-900">
                            Verify with <span className="text-blue-700">Confidence.</span><br />Scale with Trust.
                        </h1>
                        {/* 🆕 Remplace "bank-grade security, 99.9% verification accuracy..." par ce que l'application fait vraiment */}
                        <p className="text-lg text-gray-600 max-w-lg leading-relaxed">
                            A KYC platform for businesses: it reads Tunisian ID cards (Arabic included), compares the applicant&apos;s selfie with the document photo, checks a live camera sequence, screens sanctions lists and turns every signal into a risk score.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <Link href="/register" className="px-6 py-3 bg-blue-700 text-white font-semibold rounded-md hover:bg-blue-800 transition-colors shadow-md flex items-center justify-center gap-2">
                                Book a Demo <ArrowRight className="w-5 h-5" />
                            </Link>
                            {/* Bouton statique : ni href ni onClick, ne mène nulle part */}
                            <button className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center">
                                Start Free Trial
                            </button>
                        </div>
                        {/* 🆕 Remplace "Join 2,000+ compliance teams worldwide" (chiffre fictif) */}
                        <p className="text-sm font-medium text-gray-500 pt-2">Designed and built by Rayen Mhalla · portfolio project</p>
                    </div>

                    {/* 🆕 L'ancien cadre vide "Dashboard Interface Visualization" est remplacé
                        par la liste des étapes réelles du pipeline de vérification. */}
                    <div className="relative mt-8 lg:mt-0">
                        <div className="bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden relative z-10 w-full p-8 flex flex-col gap-5">
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Verification pipeline</p>
                            <ul className="flex flex-col gap-4">
                                <li className="flex items-start gap-3 text-gray-700"><CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" /> ID card reading with Gemini Vision, Arabic and Latin fields</li>
                                <li className="flex items-start gap-3 text-gray-700"><CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" /> Selfie compared with the document photo, server-side</li>
                                <li className="flex items-start gap-3 text-gray-700"><CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" /> Liveness check: live camera capture with two random poses</li>
                                <li className="flex items-start gap-3 text-gray-700"><CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" /> Sanctions and PEP screening (OpenSanctions)</li>
                                <li className="flex items-start gap-3 text-gray-700"><CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" /> Rules engine producing a risk score and an audit trail</li>
                            </ul>
                        </div>
                        {/* Decor blobs */}
                        <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -z-10"></div>
                        <div className="absolute -top-8 -left-8 w-48 h-48 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -z-10"></div>
                    </div>
                </section>

                {/* 🆕 Section "Trusted by industry leaders" (faux logos BankCorp, FinFlow,
                    NexusPay, SecureVault, CryptoCore) supprimée : aucune de ces entreprises
                    n'utilise TrustVerify. */}

                {/* Feature Grid */}
                <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        {/* 🆕 Titre et sous-titre recentrés sur ce qui est réellement construit */}
                        <h2 className="text-3xl font-bold text-gray-900 mb-4">What TrustVerify Does</h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            An end-to-end identity verification workflow, built with security in mind from the start.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        {/* 🆕 Remplace "Global Compliance" (GDPR / SOC2 / 190 pays, non vérifiés) */}
                        <div className="bg-white border border-gray-200 shadow-sm p-8 rounded-xl flex flex-col gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                                <Globe className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Sanctions Screening</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Every applicant is checked against international sanctions and PEP lists, with additional rules for FATF high-risk countries.
                            </p>
                            <div className="flex gap-2 mt-auto pt-4">
                                <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-600">Sanctions</span>
                                <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-600">PEP</span>
                            </div>
                        </div>

                        {/* Feature 2 */}
                        {/* 🆕 Texte corrigé ("Proprietary AI... in milliseconds" était faux) et barre "98%" retirée */}
                        <div className="bg-white border border-gray-200 shadow-sm p-8 rounded-xl flex flex-col gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                                <Cpu className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">AI-Assisted Risk Scoring</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Gemini Vision reads the document and compares faces; a configurable rules engine combines all signals into a risk score that an agent reviews.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        {/* 🆕 Remplace "Seamless Integration" (API publique, webhooks et SDK React inexistants) */}
                        <div className="bg-white border border-gray-200 shadow-sm p-8 rounded-xl flex flex-col gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700">
                                <Lock className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Secure by Design</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Two-factor authentication, private document storage with short-lived signed links, and strict data isolation between client companies.
                            </p>
                            <div className="mt-auto pt-4 flex flex-col gap-2">
                                <span className="flex items-center gap-2 text-xs text-gray-600"><CheckCircle className="w-4 h-4 text-green-500"/> TOTP, passkeys and backup codes</span>
                                <span className="flex items-center gap-2 text-xs text-gray-600"><CheckCircle className="w-4 h-4 text-green-500"/> Automated security tests (Playwright CI)</span>
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
                        {/* 🆕 "TrustVerify Inc." retiré : ce n'est pas une société enregistrée */}
                        <p className="text-sm text-gray-500">© 2026 TrustVerify · Demo project by Rayen Mhalla</p>
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