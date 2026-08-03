"use client";

// ============================================================================
// ⚙️ PAGE SETTINGS — ROUTEUR D'ONGLETS
// ============================================================================
// Ce composant NE FAIT QUE choisir quel sous-composant afficher selon l'onglet
// actif. Toute la vraie logique (fetch, formulaires) vit dans les composants
// importés (ProfSetting, SecurSetting, etc.).
// Les onglets Team/Billing/Audit sont réservés aux COMPANY_ADMIN : masqués du
// menu ET protégés une 2e fois dans `renderContent` (double vérification —
// même si le slug était forcé dans l'URL, `renderContent` renvoie `null`).
//
// 🆕 L'ONGLET ACTIF VIT DÉSORMAIS DANS L'URL (`?tab=security`), plus dans un
// `useState`.
//
// LE BUG QUE ÇA CORRIGE : l'onglet était un simple état local initialisé à
// "Profile Info". Or un état local disparaît dès que le composant est remonté
// — ce qui arrive à chaque rafraîchissement de session NextAuth (`update()`),
// après un changement d'avatar, une activation de 2FA, ou un simple F5.
// L'utilisateur se retrouvait alors brutalement renvoyé sur l'onglet Profil,
// en perdant au passage tout l'état des composants enfants.
//
// L'URL, elle, survit à un remontage, à un rechargement de page et même à un
// partage de lien. Trois bénéfices au passage :
//   1. F5 conserve l'onglet
//   2. Un lien vers un onglet précis devient partageable
//   3. Le bouton Retour du navigateur redevient cohérent
import Header from "@/components/header";
import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { User, Lock, Bell, Code, ShieldAlert, Users, CreditCard, Loader2 } from "lucide-react";
import ProfSetting from "@/components/ProfSetting";
import SecurSetting from "@/components/SecurSetting";
import ApIwebhooksSetting from "@/components/API&webhooksSetting";
import NotifSetting from "@/components/NotifSetting";
import AuditSetting from "@/components/AuditSetting";
import TeamSetting from "@/components/TeamSetting";
import BillingSetting from "@/components/BillingTabSetting";

// ============================================================================
// 🆕 DÉFINITION CENTRALISÉE DES ONGLETS
// ============================================================================
// 💡 POURQUOI UN `slug` DISTINCT DU `name` : le nom affiché contient des
// espaces et des esperluettes. Le mettre tel quel dans l'URL donnerait
// "?tab=API%20%26%20Webhooks" — illisible, fragile à recopier, et pénible à
// partager. Un slug court et stable règle le problème.
//
// 💡 Le slug est aussi un CONTRAT : si tu renommes un jour "Billing & Plans"
// en "Subscription", les liens déjà partagés continueront de fonctionner tant
// que le slug ne bouge pas.
const TABS = [
    { slug: "profile", name: "Profile Info", icon: User, adminOnly: false },
    { slug: "security", name: "Security", icon: Lock, adminOnly: false },
    { slug: "notifications", name: "Notifications", icon: Bell, adminOnly: false },
    { slug: "api", name: "API & Webhooks", icon: Code, adminOnly: false },
    { slug: "team", name: "Team Management", icon: Users, adminOnly: true },
    { slug: "billing", name: "Billing & Plans", icon: CreditCard, adminOnly: true },
    { slug: "audit", name: "Audit Trail", icon: ShieldAlert, adminOnly: true },
] as const;

const DEFAULT_TAB = "profile";

function SettingsContent() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();

    const isAdmin = (session?.user as any)?.role === "COMPANY_ADMIN";

    // 🆕 L'onglet demandé vient de l'URL, plus d'un état local.
    const requestedSlug = searchParams.get("tab") ?? DEFAULT_TAB;

    // 🆕 VALIDATION DU SLUG.
    //
    // L'URL est une entrée UTILISATEUR : elle peut contenir n'importe quoi,
    // qu'on l'ait tapé à la main ou reçu par un lien périmé. On vérifie donc
    // que le slug existe réellement, sinon on retombe sur l'onglet par défaut
    // plutôt que d'afficher une page vide.
    const matchedTab = TABS.find((t) => t.slug === requestedSlug);

    // ⚠️ CAS SUBTIL — LE CHARGEMENT DE SESSION.
    //
    // Au tout premier rendu, `session` est encore `undefined` : `isAdmin` vaut
    // donc `false`, même pour un vrai administrateur. Si on refusait l'accès
    // immédiatement, quelqu'un ouvrant "?tab=team" serait renvoyé sur Profil
    // AVANT même que ses droits ne soient connus — un rejet fondé sur une
    // information pas encore chargée.
    //
    // On ne tranche donc qu'une fois `status` sorti de "loading".
    const isSessionReady = status !== "loading";
    const isTabAllowed = matchedTab && (!matchedTab.adminOnly || isAdmin);

    // L'onglet réellement affiché : celui demandé s'il est valide et autorisé,
    // sinon celui par défaut.
    const activeSlug =
        isSessionReady && isTabAllowed ? matchedTab.slug : DEFAULT_TAB;

    // 🆕 CHANGEMENT D'ONGLET = CHANGEMENT D'URL.
    //
    // 💡 `replace` et non `push` : chaque clic ajouterait sinon une entrée
    // d'historique, et il faudrait appuyer six fois sur Retour pour sortir des
    // Settings. Avec `replace`, le bouton Retour ramène là où l'utilisateur
    // était AVANT d'entrer dans les réglages — ce qu'il attend.
    //
    // 💡 `scroll: false` empêche Next.js de remonter en haut de page à chaque
    // changement d'onglet, ce qui serait désagréable sur mobile.
    const handleTabChange = (slug: string) => {
        router.replace(`/dashboard/settings?tab=${slug}`, { scroll: false });
    };

    // Le menu ne montre que les onglets accessibles à l'utilisateur.
    const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

    const renderContent = () => {
        // Tant que la session charge, on ne rend rien de définitif : afficher
        // l'onglet Profil puis basculer sur Team une fraction de seconde plus
        // tard produirait un clignotement désagréable.
        if (!isSessionReady) {
            return (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
                </div>
            );
        }

        switch (activeSlug) {
            case "profile":
                return <ProfSetting />;
            case "security":
                return <SecurSetting />;
            case "notifications":
                return <NotifSetting />;
            case "api":
                return <ApIwebhooksSetting />;

            // 💡 DOUBLE VÉRIFICATION ADMIN, conservée telle quelle.
            // `activeSlug` ne peut normalement pas valoir un onglet admin pour
            // un non-admin (le calcul plus haut l'en empêche), mais cette
            // seconde barrière ne coûte rien et protège d'une régression future
            // dans la logique ci-dessus.
            case "team":
                return isAdmin ? <TeamSetting /> : null;
            case "billing":
                return isAdmin ? <BillingSetting /> : null;
            case "audit":
                return isAdmin ? <AuditSetting /> : null;

            default:
                return null;
        }
    };

    return (
        <div className="w-full min-h-screen bg-gray-50 pb-12">
            <Header />
            <div className="px-4 lg:px-12 mt-8 max-w-[1200px]">
                <div className="mb-6 md:mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Account Settings</h2>
                    <p className="text-sm text-gray-500 mt-1 md:mt-1.5">Manage your personal information, security preferences, and integration keys.</p>
                </div>

                <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                    <div className="flex md:flex-col flex-row overflow-x-auto md:overflow-visible border-b md:border-b-0 md:border-l border-gray-200 md:w-56 shrink-0">
                        {visibleTabs.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeSlug === item.slug;
                            return (
                                <button
                                    key={item.slug}
                                    onClick={() => handleTabChange(item.slug)}
                                    className={`flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all whitespace-nowrap border-b-3 md:border-b-0 md:border-r-3 outline-none cursor-pointer
                                    ${isActive 
                                        ? "text-blue-700 border-blue-700 bg-blue-50/50" 
                                        : "text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900"}`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {item.name}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 w-full max-w-3xl">
                        {renderContent()} 
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// 🆕 COQUILLE AVEC FRONTIÈRE SUSPENSE
// ============================================================================
// ⚠️ CONTRAINTE STRICTE DE NEXT.JS : `useSearchParams()` force le rendu
// dynamique du composant qui l'utilise. Sans `<Suspense>` autour, le BUILD
// ÉCHOUE avec l'erreur :
//     "useSearchParams() should be wrapped in a suspense boundary"
//
// Ce n'est pas une bonne pratique optionnelle mais une exigence de l'App
// Router — la même qu'on a déjà rencontrée sur la page /reset-password.
export default function Settings() {
    return (
        <Suspense
            fallback={
                <div className="w-full min-h-screen bg-gray-50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
                </div>
            }
        >
            <SettingsContent />
        </Suspense>
    );
}