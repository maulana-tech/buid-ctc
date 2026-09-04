import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The Foundry project one level up has its own lockfile; without this, Turbopack
  // infers the wrong workspace root.
  turbopack: { root: __dirname },
}

export default nextConfig
