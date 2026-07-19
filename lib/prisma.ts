// ============================================================================
// 🗄️ CLIENT PRISMA — SINGLETON DE CONNEXION BASE DE DONNÉES
// ============================================================================
// Pourquoi ce fichier existe : dans un projet Next.js, importer `new PrismaClient()`
// directement dans chaque route créerait une NOUVELLE connexion à chaque hot-reload
// en développement (Next.js recharge les modules à chaque sauvegarde de fichier).
// Résultat sans singleton : on épuise rapidement le nombre de connexions autorisées
// par Postgres/Supabase ("too many connections"). Ce fichier garantit qu'il n'existe
// qu'UNE seule instance de PrismaClient, réutilisée partout via `import prisma from "@/lib/prisma"`.
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const prismaClientSingleton = () => {
  // DATABASE_URL pointe vers le pooler Supabase en mode "transaction" (port 6543,
  // pgbouncer=true) — indispensable en environnement serverless (Vercel) où chaque
  // invocation de fonction pourrait sinon ouvrir sa propre connexion Postgres.
  const connectionString = `${process.env.DATABASE_URL}`

  // Pool de connexions `pg` classique, partagé par toutes les requêtes de ce process.
  const pool = new Pool({ connectionString })

  // Prisma 7+ ne se connecte plus directement à la DB : il délègue la connexion
  // réseau à un "driver adapter" (ici PrismaPg), qui s'appuie sur notre Pool `pg`.
  const adapter = new PrismaPg(pool)

  return new PrismaClient({ adapter })
}

// On étend le type global pour pouvoir y accrocher notre instance sans erreur TypeScript.
declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

// Si une instance existe déjà sur globalThis (rechargement à chaud), on la réutilise.
// Sinon (premier démarrage), on en crée une nouvelle.
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

// En production (Vercel), chaque nouvelle invocation serverless part d'un contexte
// frais : pas besoin (et pas souhaitable) de persister l'instance sur globalThis.
// En dev en revanche, on la mémorise pour survivre aux hot-reloads de Next.js.
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma