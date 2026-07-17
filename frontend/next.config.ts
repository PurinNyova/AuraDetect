import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	allowedDevOrigins: ["100.107.196.44", "dev-pc.purinnyova.com"],
	async rewrites() {
		return [
			{
				source: "/scan/:path*",
				destination: "http://localhost:5000/:path*",
			},
			{
				source: "/api/:path*",
				destination: "http://localhost:4444/:path*",
			},
		];
	},
};

export default nextConfig;
