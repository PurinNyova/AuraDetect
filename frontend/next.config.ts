import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localh.ost:4444/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
