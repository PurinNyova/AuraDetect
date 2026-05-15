"use client";

import { ChakraProvider } from "@chakra-ui/react";
import type { ReactNode } from "react";

import { system } from "@/theme";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}