"use client";

import type { ReactNode } from "react";
import { ChakraProvider } from "@chakra-ui/react";

import { AuthProvider } from "@/app/hooks/auth-context";
import { system } from "@/theme";

type ProvidersProps = {
	children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
	return (
		<ChakraProvider value={system}>
			<AuthProvider>{children}</AuthProvider>
		</ChakraProvider>
	);
}
