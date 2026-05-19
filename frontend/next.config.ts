import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/scan/:path*",
        destination: "http://localhost:5000/:path*",
      },
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/:path*",
      }
    ];
  },
};

export default nextConfig;
