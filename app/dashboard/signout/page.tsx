// ⚠️ Page orpheline : aucune référence à "/dashboard/signout" ailleurs dans le
// code (grep sur tout app/ et components/ ne trouve aucun lien ni redirection
// vers cette route). Le vrai bouton de déconnexion (voir dashboard/layout.tsx)
// appelle `signOut({ callbackUrl: '/login' })` directement, sans jamais
// transiter par ici. Probablement un reliquat d'une itération précédente,
// à supprimer si confirmé inutile.
export default function SignoutPage() {
	return null;
}
