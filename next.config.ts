import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 💡 L'ajout magique : on dit à Next.js de ne pas casser les workers de Tesseract !
  serverExternalPackages: ["tesseract.js"],
  
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mrizqoqlwcfnwgupuhyl.supabase.co',
      },
    ],
  },
};

export default nextConfig;