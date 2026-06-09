import { Plus, Eye, Trash2, Info } from "lucide-react";

export default function ApIwebhooksSetting() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex flex-row justify-between items-center px-4 md:px-6 py-4 md:py-5 border-b border-gray-200 bg-gray-50/50 gap-4">
                    <h3 className="text-base md:text-lg font-bold text-gray-900 shrink-0">API Access Keys</h3>
                    <button className="flex items-center justify-center gap-1.5 bg-blue-700 text-white px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-bold hover:bg-blue-800 transition-colors shadow-sm shrink-0 whitespace-nowrap">
                        <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
                        Generate New Key
                    </button>
                </div>
                
                <div className="w-full overflow-hidden">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                            <tr>
                                <th className="w-[30%] md:w-[22%] px-3 md:px-4 py-3 md:py-4 font-bold text-left truncate">LABEL</th>
                                <th className="w-[40%] md:w-[33%] px-2 md:px-4 py-3 md:py-4 font-bold text-left truncate">KEY HINT</th>
                                <th className="w-[15%] md:w-[15%] px-2 md:px-4 py-3 md:py-4 font-bold text-left truncate">CREATED</th>
                                <th className="w-[15%] md:w-[15%] px-2 md:px-4 py-3 md:py-4 font-bold text-left truncate">LAST USED</th>
                                <th className="hidden md:table-cell md:w-[15%] px-2 md:px-4 py-3 md:py-4 font-bold text-center truncate">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[11px] md:text-sm text-gray-700 font-medium">
                            <tr className="hover:bg-gray-50 transition-colors">
                                <td className="px-3 md:px-4 py-4">
                                    <div className="truncate w-full font-bold text-gray-900">
                                        Production-Main
                                    </div>
                                </td>
                                <td className="px-2 md:px-4 py-4">
                                    <div className="w-full flex items-center">
                                        <span className="bg-gray-100 text-gray-600 px-1.5 md:px-2 py-1 rounded font-mono text-[10px] md:text-xs truncate max-w-full block">
                                            pk_live_...x4R9
                                        </span>
                                    </div>
                                </td>
                                <td className="px-2 md:px-4 py-4">
                                    <div className="truncate w-full text-gray-500">
                                        Oct 12, 2023
                                    </div>
                                </td>
                                <td className="px-2 md:px-4 py-4">
                                    <div className="truncate w-full text-gray-500">
                                        2 mins ago
                                    </div>
                                </td>
                                <td className="hidden md:table-cell px-2 md:px-4 py-4">
                                    <div className="flex items-center justify-center gap-2 md:gap-3 w-full">
                                        <Eye className="w-4 h-4 md:w-5 md:h-5 text-gray-500 hover:text-gray-900 cursor-pointer transition-colors shrink-0" />
                                        <Trash2 className="w-4 h-4 md:w-5 md:h-5 text-gray-500 hover:text-red-600 cursor-pointer transition-colors shrink-0" />
                                    </div>
                                </td>
                            </tr>
                            <tr className="hover:bg-gray-50 transition-colors">
                                <td className="px-3 md:px-4 py-4">
                                    <div className="truncate w-full font-bold text-gray-900">
                                        Staging-Sandbox
                                    </div>
                                </td>
                                <td className="px-2 md:px-4 py-4">
                                    <div className="w-full flex items-center">
                                        <span className="bg-gray-100 text-gray-600 px-1.5 md:px-2 py-1 rounded font-mono text-[10px] md:text-xs truncate max-w-full block">
                                            pk_test_...m8S2
                                        </span>
                                    </div>
                                </td>
                                <td className="px-2 md:px-4 py-4">
                                    <div className="truncate w-full text-gray-500">
                                        Jan 04, 2024
                                    </div>
                                </td>
                                <td className="px-2 md:px-4 py-4">
                                    <div className="truncate w-full text-gray-500">
                                        Yesterday
                                    </div>
                                </td>
                                <td className="hidden md:table-cell px-2 md:px-4 py-4">
                                    <div className="flex items-center justify-center gap-2 md:gap-3 w-full">
                                        <Eye className="w-4 h-4 md:w-5 md:h-5 text-gray-500 hover:text-blue-700 cursor-pointer transition-colors shrink-0" />
                                        <Trash2 className="w-4 h-4 md:w-5 md:h-5 text-gray-500 hover:text-red-600 cursor-pointer transition-colors shrink-0" />
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex flex-row items-start gap-3 md:gap-4 p-5 md:p-6 bg-blue-50/60 rounded-xl border border-blue-100/80">
                <Info className="w-5 h-5 md:w-6 md:h-6 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1.5 md:gap-2">
                    <h4 className="text-sm font-bold text-gray-900">Developer Documentation</h4>
                    <p className="text-xs md:text-sm text-gray-600 leading-relaxed">
                        Need help integrating TrustVerify into your application? Explore our comprehensive API documentation and SDK guides.
                    </p>
                    <button className="text-xs md:text-sm font-bold text-blue-700 mt-1 md:mt-2 hover:underline w-max flex items-center cursor-pointer">
                        Read Documentation <span className="ml-1 text-lg leading-none">→</span>
                    </button>
                </div>
            </div>
        </div>
    );
}