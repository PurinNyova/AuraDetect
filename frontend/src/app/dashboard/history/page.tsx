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

import { DashboardShell } from "../dashboard-shell";

const historyStats = [
	{
		label: "Total scans",
		value: "124",
		detail: "Across the last 90 days",
		tone: "fg.default",
	},
	{
		label: "Flagged for review",
		value: "19",
		detail: "Potential AI-generated images",
		tone: "status.error.text",
	},
	{
		label: "Cleared as authentic",
		value: "81",
		detail: "Reviewed and approved",
		tone: "status.success.text",
	},
] as const;

const historyEntries = [
	{
		name: "portrait-session-04.png",
		time: "12 minutes ago",
		verdict: "Likely AI-generated",
		confidence: "96%",
		source: "Direct upload",
		tone: "error",
	},
	{
		name: "event-photo-final.jpg",
		time: "Yesterday",
		verdict: "Likely authentic",
		confidence: "14%",
		source: "Shared by team",
		tone: "success",
	},
	{
		name: "marketplace-banner.webp",
		time: "2 days ago",
		verdict: "Needs review",
		confidence: "63%",
		source: "API import",
		tone: "warning",
	},
	{
		name: "product-hero-v2.png",
		time: "4 days ago",
		verdict: "Likely AI-generated",
		confidence: "88%",
		source: "Bulk upload",
		tone: "error",
	},
	{
		name: "team-headshot-anna.jpg",
		time: "Last week",
		verdict: "Likely authentic",
		confidence: "11%",
		source: "Direct upload",
		tone: "success",
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

export default function DashboardHistoryPage() {
	return (
		<DashboardShell activePath="/dashboard/history" heading="History" kicker="Dashboard">
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
							Review every scan that passed through AuraDetect.
						</Heading>
						<Text color="fg.muted" mt="3" maxW="3xl">
							Use the history feed to retrace verdicts, confidence swings, and upload sources before exporting a final report.
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
				{historyStats.map((stat) => (
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

			<Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1.35fr) minmax(320px, 0.8fr)" }} gap="6">
				<Box
					bg="bg.panel"
					borderWidth="1px"
					borderColor="border.subtle"
					borderRadius="panel"
					p={{ base: "5", md: "6" }}
					boxShadow="panel"
				>
					<Heading as="h2" fontSize="1.35rem" mb="5">
						Recent scan history
					</Heading>

					<VStack align="stretch" gap="3">
						{historyEntries.map((entry) => {
							const colors = getToneColors(entry.tone);

							return (
								<Box
									key={entry.name}
									borderWidth="1px"
									borderColor="border.subtle"
									borderRadius="action"
									px="4"
									py="4"
									bg="bg.input"
								>
									<Flex justify="space-between" align={{ base: "flex-start", lg: "center" }} direction={{ base: "column", lg: "row" }} gap="3">
										<Box>
											<Text fontWeight="700">{entry.name}</Text>
											<Text color="fg.muted" mt="1">{entry.time}</Text>
											<Text color="fg.subtle" mt="2" fontSize="0.92rem">
												Source: {entry.source}
											</Text>
										</Box>
										<HStack gap="3" flexWrap="wrap">
											<Badge bg={colors.bg} color={colors.color} borderWidth="1px" borderColor={colors.border} borderRadius="9999px" px="3" py="1">
												{entry.verdict}
											</Badge>
											<Text fontWeight="700">{entry.confidence}</Text>
										</HStack>
									</Flex>
								</Box>
							);
						})}
					</VStack>
				</Box>

				<Box
					bg="bg.panel"
					borderWidth="1px"
					borderColor="border.subtle"
					borderRadius="panel"
					p={{ base: "5", md: "6" }}
					boxShadow="panel"
				>
					<Heading as="h2" fontSize="1.35rem">
						History filters
					</Heading>
					<VStack align="stretch" gap="4" mt="5">
						<Box borderBottomWidth="1px" borderColor="border.subtle" pb="4">
							<Text fontWeight="700">Saved views</Text>
							<Text color="fg.muted" mt="1">Switch between all scans, flagged images, or recently exported reports.</Text>
						</Box>
						<Box borderBottomWidth="1px" borderColor="border.subtle" pb="4">
							<Text fontWeight="700">Confidence range</Text>
							<Text color="fg.muted" mt="1">Spot borderline detections before they move into a final workflow.</Text>
						</Box>
						<Box>
							<Text fontWeight="700">Export queue</Text>
							<Text color="fg.muted" mt="1">Three report bundles are ready for PDF or CSV delivery.</Text>
						</Box>
					</VStack>
				</Box>
			</Grid>
		</DashboardShell>
	);
}