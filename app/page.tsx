import Image from "next/image";
import Link from 'next/link'

export default function Home() {
  return (
    <div>
      Projet KYC - TrustVerify
      <div className="flex flex-col items-center justify-center gap-4 mt-8">
        <Link href="/login" className="px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800 transition duration-200">Login</Link>
        <Link href="/register" className="px-4 py-2 bg-green-700 text-white rounded-md hover:bg-green-800 transition duration-200">Dashboard</Link>
      </div>
    </div>
  );
}