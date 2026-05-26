import { Box, Container, Grid, Heading, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";

const navigationItems = [
	{
		title: "Overview",
		href: "/dashboard",
	},
	{
		title: "History",
		href: "/dashboard/history",
	},
	{
		title: "Settings",
		href: "/dashboard/settings",
	},
] as const;

type DashboardShellProps = {
	activePath: string;
	children: React.ReactNode;
	heading?: string;
	kicker?: string;
};

export function DashboardShell({
	activePath,
	children,
	heading = "Welcome back",
	kicker = "Dashboard",
}: DashboardShellProps) {
	return (
		<Container maxW="1400px" px={{ base: "4", md: "6" }} py={{ base: "6", md: "8" }}>
			<Grid templateColumns={{ base: "1fr", lg: "280px minmax(0, 1fr)" }} gap={{ base: "6", lg: "8" }}>
				<Box as="aside" alignSelf="start" position={{ lg: "sticky" }} top={{ lg: "96px" }}>
					<VStack align="stretch" gap="5" pl={{ lg: "1" }}>
						<Box pb="4" borderBottomWidth="1px" borderColor="border.subtle">
							<Text fontSize="0.85rem" fontWeight="700" color="brand.primary" textTransform="uppercase" letterSpacing="0.12em">
								{kicker}
							</Text>
							<Heading as="h1" fontSize="1.75rem" mt="2">
								{heading}
							</Heading>
						</Box>

						<VStack as="nav" align="stretch" gap="1">
							{navigationItems.map((item) => {
								const isActive = activePath === item.href;

								return (
									<Link key={item.title} href={item.href} style={{ textDecoration: "none" }}>
										<Box
											borderLeftWidth="3px"
											borderLeftColor={isActive ? "brand.primary" : "transparent"}
											color={isActive ? "fg.default" : "fg.muted"}
											px="4"
											py="3"
											transition="color 0.2s ease, border-color 0.2s ease, transform 0.2s ease"
											_hover={{ borderLeftColor: "brand.primary", color: "fg.default", transform: "translateX(2px)" }}
										>
											<Text fontWeight="700">{item.title}</Text>
										</Box>
									</Link>
								);
							})}
						</VStack>
					</VStack>
				</Box>

				<VStack align="stretch" gap="6">{children}</VStack>
			</Grid>
		</Container>
	);
}
