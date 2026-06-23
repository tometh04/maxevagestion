const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling these so the file tracer picks them up and
  // includes them in the serverless deployment.
  // - @afipsdk/afip.js: CJS module
  // - unpdf: usa pdf.js (worker/wasm) para extraer texto de PDFs en el OCR de
  //   facturas de compra; bundlearlo lo rompe solo en producción.
  serverExternalPackages: ['@afipsdk/afip.js', 'unpdf'],
  outputFileTracingRoot: path.join(__dirname),
  // 2026-05-05: removido `typescript.ignoreBuildErrors`. tsc pasa con 0 errores
  // tras limpiar V1 import (dead code), corregir casts en tablas no tipadas
  // (agency_settings, user_notification_preferences) y sumar campos faltantes
  // del mock user. Si una migration nueva agrega tablas/columnas y rompe el
  // build, regenerar types con `npm run db:generate` antes de mergear.
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
  // PERF: tree-shake automático de barrel imports en librerías grandes.
  // Sin esto, importar `import { Foo } from 'recharts'` arrastra todo el
  // paquete. Con esto, Next reescribe a sub-imports específicos.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@tabler/icons-react',
      'recharts',
      '@radix-ui/react-icons',
      'date-fns',
    ],
  },
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
