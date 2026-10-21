/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only produce standalone for Docker builds, NOT for Vercel (Vercel uses its own serverless NFT tracing)
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
