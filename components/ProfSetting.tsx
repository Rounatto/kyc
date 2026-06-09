import { Pencil, User } from "lucide-react";

export default function ProfSetting() {
    return (
                    <div className="flex flex-col w-full bg-white rounded-sm border border-gray-400">
                        <div className="border-b border-gray-400 px-5 md:px-6 py-4 md:py-5">
                            <h3 className="text-base md:text-lg font-bold text-gray-900">Personal Information</h3>
                        </div>
                        <div className="flex flex-col p-5 md:p-6 gap-6">
                            <div className="flex flex-row items-center gap-4 md:gap-5">
                                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gray-200 overflow-visible shrink-0 border border-gray-300">
                                    <div className="w-full h-full rounded-xl flex items-center justify-center bg-slate-300 overflow-hidden">
                                        <User className="w-8 h-8 text-gray-500" />
                                    </div>
                                    <button className="absolute -bottom-1.5 -right-1.5 bg-blue-700 text-white p-1.5 rounded-full border-2 border-white hover:bg-blue-800 transition-colors shadow-sm">
                                        <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                    </button>
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-sm font-semibold text-gray-900">Profile Picture</p>
                                    <p className="text-xs text-gray-500 mt-0.5">JPG, GIF or PNG. Max size of 800K</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-gray-700">First Name</label>
                                    <input type="text" defaultValue="Alex" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Last Name</label>
                                    <input type="text" defaultValue="Sterling" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-700">Email Address</label>
                                <input type="email" defaultValue="alex.sterling@enterprise-kyc.com" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-700">Organization</label>
                                <input type="text" defaultValue="Sterling Global Financial Services" className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                            </div>

                            <div className="flex flex-row justify-end items-center gap-4 mt-2">
                                <button className="text-sm font-bold bg-white text-gray-500 px-5 py-2.5 rounded-sm hover:bg-gray-200 transition-colors cursor-pointer">
                                    Discard
                                </button>
                                <button className="text-sm font-bold bg-blue-700 text-white px-5 py-2.5 rounded-sm hover:bg-blue-800 transition-colors shadow-sm cursor-pointer">
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                );
}