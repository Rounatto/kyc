// components/TrendIndicator.tsx
"use client";

// ============================================================================
// 🆕 [FIX TENDANCES] PASTILLE D'ÉVOLUTION — COMPOSANT PARTAGÉ
// ============================================================================
// Extrait des deux pages (dashboard + customers) où il était copié-collé à
// l'identique. Une seule source à maintenir.
//
// ❌ AVANT : `const safeValue = Number(value) || 0;`
//   `NaN || 0` → 0, et `Infinity` passait tel quel. Une carte passée de 0 à 4
//   affichait donc "0,0 %" (icône neutre) = "aucun changement", alors que le
//   changement était total.
//
// ✅ TROIS ÉTATS DISTINCTS :
//   • un pourcentage réel → hausse ou baisse, colorée selon le sens
//   • "New"               → activité apparue sans période de référence
//   • "No data"           → rien avant, rien maintenant
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";

type Props = {
    // ⚠️ `null` EST UNE VALEUR ATTENDUE. L'API la renvoie quand la période
    // précédente est vide : le pourcentage n'existe pas mathématiquement.
    value?: number | null;
    // Compteur ACTUEL. Distingue "New" de "No data" quand `value` est null.
    current?: number;
    // Métriques où une HAUSSE est mauvaise (alertes de risque) → rouge.
    invertColors?: boolean;
    // Métriques ni bonnes ni mauvaises (file d'attente).
    neutral?: boolean;
};

export default function TrendIndicator({
    value,
    current = 0,
    invertColors = false,
    neutral = false,
}: Props) {
    // ------------------------------------------------------------------------
    // CAS 1 — AUCUNE BASE DE COMPARAISON
    // ------------------------------------------------------------------------
    // `Number.isFinite` (pas le global `isFinite`, qui coerce null → 0 → true).
    // Après ce if, TypeScript sait que `value` est un `number`.
    if (value === null || value === undefined || !Number.isFinite(value)) {
        if (current > 0) {
            return (
                <div className="flex items-center justify-center rounded-sm px-2 py-1 text-[10px] font-bold gap-1 text-blue-700 bg-blue-100 truncate">
                    <Sparkles className="w-3 h-3" />
                    New
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center rounded-sm px-2 py-1 text-[10px] font-bold gap-1 text-gray-500 bg-gray-100 truncate">
                <Minus className="w-3 h-3" />
                No data
            </div>
        );
    }

    // ------------------------------------------------------------------------
    // CAS 2 — UN POURCENTAGE RÉEL
    // ------------------------------------------------------------------------
    const isPositive = value > 0;
    const isZero = value === 0;

    let colorClass = "text-gray-500 bg-gray-100";
    if (!isZero) {
        if (neutral) {
            colorClass = "text-orange-700 bg-yellow-300/40";
        } else if (invertColors) {
            colorClass = isPositive ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100";
        } else {
            colorClass = isPositive ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100";
        }
    }

    return (
        <div className={`flex items-center justify-center rounded-sm px-2 py-1 text-[10px] font-bold gap-1 ${colorClass} truncate`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : isZero ? <Minus className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? "+" : ""}
            {value.toFixed(1)}%
        </div>
    );
}