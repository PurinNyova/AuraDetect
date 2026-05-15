import {
	Badge,
	Box,
	Button,
	Flex,
	Grid,
	Heading,
	HStack,
	SimpleGrid,
	Text,
	VStack,
} from "@chakra-ui/react";
import Link from "next/link";

import { DashboardShell } from "./dashboard-shell";

const stats = [
	{
		label: "Scans this week",
		value: "18",
		detail: "+5 from last week",
		tone: "status.success.text",
	},
	{
		label: "Likely AI results",
		value: "6",
		detail: "2 pending review",
		tone: "status.error.text",
	},
	{
		label: "Average confidence",
		value: "91%",
		detail: "Across your last 12 uploads",
		tone: "brand.primary",
	},
	{
		label: "Saved reports",
		value: "24",
		detail: "PDF and CSV exports ready",
		tone: "fg.default",
	},
] as const;

const recentScans = [
	{
		name: "portrait-session-04.png",
		time: "12 minutes ago",
		verdict: "Likely AI-generated",
		confidence: "96%",
		tone: "error",
	},
	{
		name: "event-photo-final.jpg",
		time: "Yesterday",
		verdict: "Likely authentic",
		confidence: "14%",
		tone: "success",
	},
	{
		name: "marketplace-banner.webp",
		time: "2 days ago",
		verdict: "Needs review",
		confidence: "63%",
		tone: "warning",
	},
] as const;

const accountSignals = [
	{
		title: "Report exports",
		value: "Enabled",
		description: "Automatic PDF summaries are attached after each completed scan.",
	},
	{
		title: "Privacy mode",
		value: "On",
		description: "Uploads are cleared after 24 hours unless you save the report.",
	},
	{
		title: "Team sharing",
		value: "Off",
		description: "Your dashboard is currently visible only to your own account.",
	},
] as const;

function getToneColors(tone: "error" | "success" | "warning") {
	if (tone === "error") {
		return {
			bg: "status.error.bg",
			border: "status.error.border",
			color: "status.error.text",
		};
	}

	if (tone === "success") {
		return {
			bg: "status.success.bg",
			border: "status.success.border",
			color: "status.success.text",
		};
	}

	return {
		bg: "bg.overlay",
		border: "border.subtle",
		color: "fg.default",
	};
}

export default function DashboardPage() {
	return (
		<DashboardShell activePath="/dashboard">
					<Box
						bg="bg.panel"
						borderWidth="1px"
						borderColor="border.subtle"
						borderRadius="panel"
						p={{ base: "5", md: "6" }}
						boxShadow="panel"
					>
						<Flex justify="space-between" align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} gap="4">
							<Box>
								<Heading as="h2" fontSize={{ base: "1.8rem", md: "2.2rem" }}>
									Keep an eye on what you scanned and what needs a second look.
								</Heading>
								<Text color="fg.muted" mt="3" maxW="3xl">
									Jump into dedicated history and settings views without leaving the dashboard workspace.
								</Text>
							</Box>

							<Link href="/scan" style={{ textDecoration: "none" }}>
								<Button
									height="auto"
									minW="auto"
									bg="brand.primary"
									color="#1A1419"
									px="5"
									py="3"
									borderRadius="action"
									fontWeight="700"
									transition="all 0.2s ease"
									_hover={{ bg: "brand.hover", transform: "translateY(-1px)" }}
									_active={{ transform: "translateY(0)" }}
								>
									Run new AI scan
								</Button>
							</Link>
						</Flex>
					</Box>

					<SimpleGrid minChildWidth="220px" gap="4">
						{stats.map((stat) => (
							<Box
								key={stat.label}
								bg="bg.panel"
								borderWidth="1px"
								borderColor="border.subtle"
								borderRadius="panel"
								p="5"
								boxShadow="panel"
							>
								<Text color="fg.muted" fontSize="0.92rem">
									{stat.label}
								</Text>
								<Heading as="h3" fontSize="2rem" mt="3">
									{stat.value}
								</Heading>
								<Text color={stat.tone} mt="2" fontWeight="600">
									{stat.detail}
								</Text>
							</Box>
						))}
					</SimpleGrid>

					<Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1.45fr) minmax(320px, 0.9fr)" }} gap="6">
						<Box
							bg="bg.panel"
							borderWidth="1px"
							borderColor="border.subtle"
							borderRadius="panel"
							p={{ base: "5", md: "6" }}
							boxShadow="panel"
						>
							<Flex justify="space-between" align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} gap="3" mb="5">
								<Box>
									<Heading as="h2" fontSize="1.35rem">
										Recent scan history preview
									</Heading>
								</Box>
								<Link href="/dashboard/history" style={{ textDecoration: "none" }}>
									<Button
										height="auto"
										minW="auto"
										bg="transparent"
										color="fg.muted"
										px="4"
										py="2.5"
										borderRadius="control"
										fontWeight="600"
										_hover={{ bg: "border.subtle", color: "fg.default" }}
									>
										Open history
									</Button>
								</Link>
							</Flex>

							<VStack align="stretch" gap="3">
								{recentScans.map((scan) => {
									const colors = getToneColors(scan.tone);

									return (
										<Box
											key={scan.name}
											borderWidth="1px"
											borderColor="border.subtle"
											borderRadius="action"
											px="4"
											py="4"
											bg="bg.input"
										>
											<Flex justify="space-between" align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} gap="3">
												<Box>
													<Text fontWeight="700">{scan.name}</Text>
													<Text color="fg.muted" mt="1">{scan.time}</Text>
												</Box>
												<HStack gap="3" flexWrap="wrap">
													<Badge bg={colors.bg} color={colors.color} borderWidth="1px" borderColor={colors.border} borderRadius="9999px" px="3" py="1">
														{scan.verdict}
													</Badge>
													<Text fontWeight="700">{scan.confidence}</Text>
												</HStack>
											</Flex>
										</Box>
									);
								})}
							</VStack>
						</Box>

						<VStack align="stretch" gap="6">
							<Box
								bg="bg.panel"
								borderWidth="1px"
								borderColor="border.subtle"
								borderRadius="panel"
								p={{ base: "5", md: "6" }}
								boxShadow="panel"
							>
								<Heading as="h2" fontSize="1.35rem">
									Settings preview
								</Heading>
								<Box mb="5" />

								<VStack align="stretch" gap="4">
									{accountSignals.map((item) => (
										<Box key={item.title} borderBottomWidth="1px" borderColor="border.subtle" pb="4" _last={{ borderBottomWidth: "0", pb: "0" }}>
											<Flex justify="space-between" gap="4" align="flex-start">
												<Box>
													<Text fontWeight="700">{item.title}</Text>
													<Text color="fg.muted" mt="1" lineHeight="1.6">
														{item.description}
													</Text>
												</Box>
												<Text color="brand.primary" fontWeight="700" whiteSpace="nowrap">
													{item.value}
												</Text>
											</Flex>
										</Box>
									))}
								</VStack>
							</Box>

							<Box bg="bg.panel" borderWidth="1px" borderColor="border.subtle" borderRadius="panel" p={{ base: "5", md: "6" }} boxShadow="panel">
								<Heading as="h2" fontSize="1.35rem">
									Next recommended action
								</Heading>
								<Link href="/dashboard/settings" style={{ textDecoration: "none" }}>
									<Button
										mt="4"
										height="auto"
										minW="auto"
										bg="transparent"
										color="fg.default"
										px="0"
										py="0"
										fontWeight="700"
										_hover={{ color: "brand.primary" }}
									>
										Open settings
									</Button>
								</Link>
							</Box>
						</VStack>
					</Grid>
		</DashboardShell>
	);
}
