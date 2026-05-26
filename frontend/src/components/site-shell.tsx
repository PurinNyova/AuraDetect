"use client";

import {
	Box,
	Button,
	Flex,
	HStack,
	Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/hooks/auth-context";

type ThemeMode = "dark" | "light";

export function SiteShell({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<ThemeMode>("dark");
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const router = useRouter();
	const { isAuthenticated, isLoading, logout, user } = useAuth();

	useEffect(() => {
		const root = document.documentElement;

		root.setAttribute("data-theme", theme);
		root.classList.remove("dark", "light");
		root.classList.add(theme);
	}, [theme]);

	const handleLogout = async () => {
		setIsLoggingOut(true);

		try {
			await logout();
			router.push("/");
		}
		finally {
			setIsLoggingOut(false);
		}
	};

	return (
		<Box minH="100vh" bg="bg.app" color="fg.default">
			<Box
				as="header"
				position="sticky"
				top="0"
				zIndex="100"
				bg="bg.panel"
				borderBottomWidth="1px"
				borderColor="border.subtle"
				px={{ base: "4", md: "8" }}
				py="4"
			>
				<Flex align="center" justify="space-between" gap="4">
					<Link href="/" style={{ textDecoration: "none" }}>
						<Flex
							align="center"
							gap="2"
							cursor="pointer"
							userSelect="none"
							color="brand.primary"
							fontSize="1.25rem"
							fontWeight="700"
						>
							<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
							</svg>
							<Text as="span" fontSize="inherit" fontWeight="inherit" color="inherit">
								AuraDetect
							</Text>
						</Flex>
					</Link>

					<HStack gap="2">
						<Button
							height="auto"
							minW="auto"
							bg="transparent"
							color="fg.muted"
							px="0"
							py="0"
							border="none"
							borderRadius="control"
							fontWeight="600"
							fontSize="1rem"
							transition="all 0.2s ease"
							_hover={{ bg: "border.subtle", color: "fg.default" }}
							_active={{ bg: "border.subtle" }}
							onClick={() => setTheme(current => (current === "dark" ? "light" : "dark"))}
						>
							<Box px="4" py="3">Toggle Theme</Box>
						</Button>
						{!isLoading && isAuthenticated
							? (
								<Link href="/dashboard" style={{ textDecoration: "none" }}>
									<Button
										height="auto"
										minW="auto"
										bg="transparent"
										color="fg.muted"
										px="4"
										py="2"
										borderRadius="control"
										fontWeight="600"
										fontSize="0.875rem"
										transition="all 0.2s ease"
										_hover={{ bg: "border.subtle", color: "fg.default" }}
										_active={{ bg: "border.subtle" }}
									>
										Dashboard
									</Button>
								</Link>
							)
							: null}
						{!isLoading && isAuthenticated
							? (
									<>
										{user?.name
											? (
													<Text fontSize="0.875rem" color="fg.muted" px="2">
														{user.name}
													</Text>
												)
											: null}
										<Button
											height="auto"
											minW="auto"
											bg="transparent"
											color="fg.muted"
											px="4"
											py="2"
											borderRadius="control"
											fontWeight="600"
											fontSize="0.875rem"
											transition="all 0.2s ease"
											_hover={{ bg: "border.subtle", color: "fg.default" }}
											_active={{ bg: "border.subtle" }}
											disabled={isLoggingOut}
											onClick={() => {
												void handleLogout();
											}}
										>
											{isLoggingOut ? "Signing out..." : "Sign Out"}
										</Button>
									</>
								)
							: (
									<Link href="/login" style={{ textDecoration: "none" }}>
										<Button
											height="auto"
											minW="auto"
											bg="transparent"
											color="fg.muted"
											px="4"
											py="2"
											borderRadius="control"
											fontWeight="600"
											fontSize="0.875rem"
											transition="all 0.2s ease"
											_hover={{ bg: "border.subtle", color: "fg.default" }}
											_active={{ bg: "border.subtle" }}
										>
											Log In
										</Button>
									</Link>
								)}
						<Link href="/scan" style={{ textDecoration: "none" }}>
							<Button
								height="auto"
								minW="auto"
								bg="brand.primary"
								color="#1A1419"
								px="4"
								py="2"
								borderRadius="control"
								fontWeight="600"
								fontSize="0.875rem"
								transition="all 0.2s ease"
								_hover={{ bg: "brand.hover", transform: "translateY(-1px)" }}
								_active={{ transform: "translateY(0)" }}
							>
								Launch App
							</Button>
						</Link>
					</HStack>
				</Flex>
			</Box>

			{children}
		</Box>
	);
}
