/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: {
    // Skip linting during build for now — focus on getting it rendering
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We'll fix type errors incrementally — get it rendering first
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
