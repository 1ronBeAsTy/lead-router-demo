import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma тянет нативный движок — в серверном бандле он должен остаться внешним,
  // иначе сборщик пытается упаковать .node-файл и падает.
  serverExternalPackages: ['@prisma/client', 'prisma'],
  typedRoutes: false,
}

export default nextConfig
