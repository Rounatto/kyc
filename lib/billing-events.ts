// ============================================================================
// 🔔 SIGNAL "LA FACTURATION A CHANGÉ" (client uniquement)
// ============================================================================
// Le badge de plan vit dans le header, l'écran de facturation dans l'onglet
// Settings : deux arbres React sans parent commun qui interrogent tous les deux
// /api/billing/quota. Résultat, après une annulation ou une reprise, le badge
// restait figé sur l'ancienne valeur jusqu'à un rechargement complet de la page
// — c'est la moitié "le header ne se met pas à jour" du bug.
//
// Un simple événement `window` suffit ici : pas de state global à installer, et
// aucun composant n'a besoin de connaître l'existence des autres. Un Context
// aurait imposé de remonter un provider au-dessus du header ET des settings
// pour un seul signal booléen.
//
// À appeler après TOUTE mutation de facturation (cancel, resume, retour de
// paiement Stripe réussi).

export const BILLING_CHANGED_EVENT = "trustverify:billing-changed";

export function notifyBillingChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(BILLING_CHANGED_EVENT));
}

export function onBillingChanged(handler: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(BILLING_CHANGED_EVENT, handler);
    return () => window.removeEventListener(BILLING_CHANGED_EVENT, handler);
}
