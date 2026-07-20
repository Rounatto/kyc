"use client";

// ============================================================================
// ➕ BOUTON "NOUVELLE VÉRIFICATION" — 2 VARIANTES RESPONSIVE
// ============================================================================
// Un seul composant rend 2 boutons DIFFÉRENTS selon la taille d'écran plutôt
// que de cacher/afficher le même élément en CSS : un bouton texte classique
// en desktop (`hidden lg:flex`), un bouton flottant circulaire (FAB) fixé en
// bas à droite en mobile (`md:hidden`). `mobileOnly` permet aux pages qui ont
// déjà leur propre bouton desktop ailleurs (ex: dashboard/page.tsx) de ne
// monter QUE la variante mobile ici, pour éviter un doublon visuel.
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