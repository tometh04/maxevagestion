/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  // Optimizaciones de rendimiento
  compress: true,
  poweredByHeader: false,
  // Optimizar bundle
  swcMinify: true,
  // React strict mode (desactivado temporalmente para mejor rendimiento en dev)
  reactStrictMode: process.env.NODE_ENV === 'production',
}

module.exports = nextConfig

