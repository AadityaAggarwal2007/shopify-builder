/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Keep `npx tsc --noEmit` at 0 yourself: the build does not stop on type errors (same as ShipTrack).
  typescript: { ignoreBuildErrors: true },
  // sharp is a native module: never bundle it.
  experimental: { serverComponentsExternalPackages: ['sharp'] },
};
module.exports = nextConfig;
