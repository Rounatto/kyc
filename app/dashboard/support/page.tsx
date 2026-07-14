"use client";

import { Book, Mail, MessageCircle, FileCode2, ExternalLink, ArrowRight, LifeBuoy, FileText } from "lucide-react";
import Link from "next/link";

export default function SupportPage() {
    return (
        <div className="w-full min-h-screen bg-gray-50 pb-12">
            {/* Header simple pour la page support */}
            <div className="bg-white border-b border-gray-200 px-6 lg:px-12 py-8">
                <div className="max-w-[1200px] mx-auto">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <LifeBuoy className="w-8 h-8 text-blue-700" />
                        Help & Support Center
                    </h1>
                    <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                        Find documentation, integration guides, and get help from our Compliance Engineering team.
                    </p>
                </div>
            </div>

            <div className="px-6 lg:px-12 mt-8 max-w-[1200px] mx-auto flex flex-col gap-8">
                
                {/* Section Principale : Documentation & API */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 md:p-8 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <FileCode2 className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">API Documentation</h2>
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                            Integrate the TrustVerify KYC engine directly into your backend. Learn about authentication, rate limits, and webhook event payloads.
                        </p>
                        <button className="flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800 hover:underline">
                            Read the API Docs <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="w-12 h-12 bg-gray-100 text-gray-700 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <Book className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Platform Guides</h2>
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                            Learn how to manage your workspace, invite team members, set up 2FA, and configure custom KYC rules using our Dashboard.
                        </p>
                        <button className="flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800 hover:underline">
                            Explore Guides <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Section Secondaire : FAQ & Contact */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                        <h3 className="text-lg font-bold text-gray-900">Need direct assistance?</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                        <div className="p-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gray-100 rounded-full text-gray-600 shrink-0"><MessageCircle className="w-5 h-5"/></div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900">Live Compliance Chat</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">Available 24/7 for Enterprise Tier customers.</p>
                                </div>
                            </div>
                            <Link href="/dashboard/chat" className="text-sm font-bold text-gray-900 border border-gray-300 bg-white px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                                Open Chat
                            </Link>
                        </div>

                        <div className="p-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gray-100 rounded-full text-gray-600 shrink-0"><Mail className="w-5 h-5"/></div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900">Email Engineering Support</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">Average response time: 2 hours.</p>
                                </div>
                            </div>
                            <a href="mailto:support@trustverify.com" className="text-sm font-bold text-gray-900 border border-gray-300 bg-white px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2 shrink-0">
                                Contact Us <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}