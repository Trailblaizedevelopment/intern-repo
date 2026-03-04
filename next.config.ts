import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
