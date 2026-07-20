// Bouton "Sign in" générique — pas branché à une logique propre : c'est un
// simple `type="submit"` conçu pour être placé DANS un <form> parent qui gère
// le vrai `onSubmit` (ex: usage prévu sur app/login/page.tsx, qui en réalité
// n'importe même pas ce composant et redéfinit son propre bouton inline —
// voir la note dans login/page.tsx, Lot 6, sur l'import LoginBtn inutilisé).
export default function LoginBtn() {
    return (
        <button 
            type="submit" 
            className="flex items-center w-full justify-center bg-blue-700 hover:bg-blue-800 text-white rounded-md shadow-md transition duration-200 my-2 py-2 mb-3 text-sm font-medium cursor-pointer"
        >
            Sign in
        </button>
    );
}