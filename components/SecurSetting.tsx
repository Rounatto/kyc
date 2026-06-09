import { Smartphone } from "lucide-react";
export default function SecurSetting() {
    return (
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col w-full bg-white rounded-sm border border-gray-400">
                            <div className="border-b border-gray-400 px-5 md:px-6 py-4 md:py-5 bg-gray-50/50 rounded-t-xl">
                                <h3 className="text-base md:text-lg font-bold text-gray-900">Password Management</h3>
                            </div>
                            <div className="flex flex-col p-5 md:p-6 gap-5">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Current Password</label>
                                    <input type="password" defaultValue="........" className="w-full border border-gray-400 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold text-gray-700">New Password</label>
                                        <input type="password" className="w-full border border-gray-400 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold text-gray-700">Confirm New Password</label>
                                        <input type="password" className="w-full border border-gray-400 rounded-sm px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 transition-colors" />
                                    </div>
                                </div>
                                <div className="flex flex-row justify-end mt-2">
                                    <button className="text-sm font-bold bg-blue-700 text-white px-5 py-2.5 rounded-sm hover:bg-blue-800 transition-colors shadow-sm w-full md:w-auto cursor-pointer">
                                        Update Password
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-row items-center justify-between p-4 md:p-6 bg-white rounded-sm border border-gray-400 gap-3 md:gap-4">
                            <div className="flex flex-row gap-3 md:gap-4 items-start md:items-center">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-100/50 flex items-center justify-center shrink-0">
                                    <Smartphone className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h4 className="text-sm font-bold text-gray-900">Two-Factor Authentication (2FA)</h4>
                                    <p className="text-xs text-gray-500 leading-relaxed max-w-md">Add an extra layer of security to your account by requiring more than just a password to log in.</p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                                        <span className="text-xs font-bold text-red-600">Currently Disabled</span>
                                    </div>
                                </div>
                            </div>
                            <button className="text-xs md:text-sm font-bold text-blue-700 bg-white border border-blue-700 px-3 md:px-5 py-2 md:py-2.5 rounded-sm hover:bg-blue-50 transition-colors shrink-0 text-center cursor-pointer">
                                Enable<br className="block sm:hidden" /> 2FA
                            </button>
                        </div>
                    </div>
                );
}