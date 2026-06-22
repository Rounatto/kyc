import { withAuth } from "next-auth/middleware";

// Exportation d'une fonction explicite pour satisfaire Next.js 16
export default withAuth({
  pages: {
    signIn: "/login", // En cas de blocage, on renvoie poliment ici
  },
});

export const config = {
  // Les caméras de sécurité restent sur le dashboard
  matcher: ["/dashboard/:path*"],
};