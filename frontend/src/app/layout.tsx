import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { SiteShell } from "@/components/site-shell";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "AuraDetect | AI Image Scanner",
	description: "Open source AI-generated image detection with a Chakra-based theme system.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" data-theme="dark" className={`${inter.variable} dark h-full antialiased`}>
			<body className="min-h-full">
				<Providers>
					<SiteShell>{children}</SiteShell>
				</Providers>
			</body>
		</html>
	);
}
