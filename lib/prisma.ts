import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const prismaClientSingleton = () => {
  // On récupère l'URL de Supabase depuis le .env
  const connectionString = `${process.env.DATABASE_URL}`
  
  // On crée un pool de connexion PostgreSQL standard
  const pool = new Pool({ connectionString })
  
  // On passe ce pool à l'adaptateur Prisma
  const adapter = new PrismaPg(pool)
  
  // On initialise enfin le client avec l'adaptateur, comme exigé par la V7
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma