"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

interface NewVerificationButtonProps {
    mobileOnly?: boolean;
}

export default function NewVerificationButton({ mobileOnly = false }: NewVerificationButtonProps) {
    return (
        <>
            {!mobileOnly && (
                <Link 
                    href="/dashboard/customers/new-verification" 
                    className="hidden lg:flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm"
                >
                    <Plus className="w-4 h-4" /> New Verification
                </Link>
            )}

            <Link 
                href="/dashboard/customers/new-verification" 
                className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-blue-700 hover:bg-blue-800 text-white rounded-full flex items-center justify-center shadow-xl z-[9999] transition-transform active:scale-95"
            >
                <Plus className="w-6 h-6" />
            </Link>
        </>
    );
}