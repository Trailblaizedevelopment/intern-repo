import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-markdown v10+ and its deps are ESM-only — Next.js needs to transpile them
  transpilePackages: [
    'react-markdown',
    'remark-parse',
    'remark-rehype',
    'unified',
    'unist-util-visit',
    'vfile',
    'hast-util-to-jsx-runtime',
    'html-url-attributes',
    'mdast-util-to-hast',
    'devlop',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ssqpfkiesxwnmphwyezb.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'media.licdn.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  async redirects() {
    return [
      // Redirect old portal routes to new workspace routes
      {
        source: '/portal',
        destination: '/workspace',
        permanent: true,
      },
      {
        source: '/portal/tasks',
        destination: '/workspace/tasks',
        permanent: true,
      },
      {
        source: '/portal/leads',
        destination: '/workspace/leads',
        permanent: true,
      },
      {
        source: '/portal/inbox',
        destination: '/workspace/inbox',
        permanent: true,
      },
      {
        source: '/portal/projects',
        destination: '/workspace/projects',
        permanent: true,
      },
      {
        source: '/portal/team',
        destination: '/workspace/team',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
