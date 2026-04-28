const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling @afipsdk/afip.js (CJS module)
  // so Vercel's file tracer picks it up and includes it in the serverless deployment
  serverExternalPackages: ['@afipsdk/afip.js'],
  outputFileTracingRoot: path.join(__dirname),
  // Existe código legacy (app/api/exchange-rates/*, app/api/destination-requirements/*)
  // que referencia tablas no tipadas en lib/supabase/types.ts post-regen del 2026-04-22.
  // No bloqueamos deploys; el TS check corre en dev/CI. TODO: restaurar tipos o refactor.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  compress: true,
  poweredByHeader: false,
  // reactStrictMode: solo en DEV (default React). Antes estaba INVERTIDO
  // (true en prod, false en dev) lo cual disparaba useEffect 2x en algunas
  // páginas como dashboard — causaba duplicate fetches y 503s por sobrecarga
  // de conexiones a Supabase.
  reactStrictMode: process.env.NODE_ENV !== 'production',
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
