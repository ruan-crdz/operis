import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  images: { unoptimized: true },
  transpilePackages: ['@operis/ui', '@operis/domain', '@operis/types'],
};
export default config;
