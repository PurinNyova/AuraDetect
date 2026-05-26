"use client";

import type { DashboardHistoryFilters } from "../../hooks/dashboard-api";
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

import { startTransition, useDeferredValue, useState } from "react";
import {

	formatDashboardSource,
	formatDashboardVerdict,
} from "../../hooks/dashboard-api";
import { useDashboardHistory } from "../../hooks/useDashboardHistory";
import { useDashboardSavedViews } from "../../hooks/useDashboardSavedViews";
import { DashboardShell } from "../dashboard-shell";

function formatPercent(value: number) {
	return `${Math.round(value * 100)}%`;
}

function formatRelativeDate(value: string) {
	const diffMs = new Date(value).getTime() - Date.now();
	const diffMinutes = Math.round(diffMs / 60000);
	const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

	if (Math.abs(diffMinutes) < 60) {
		return formatter.format(diffMinutes, "minute");
	}

	const diffHours = Math.round(diffMinutes / 60);
	if (Math.abs(diffHours) < 24) {
		return formatter.format(diffHours, "hour");
	}

	const diffDays = Math.round(diffHours / 24);
	return formatter.format(diffDays, "day");
}

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
	const [filters, setFilters] = useState<DashboardHistoryFilters>({
		page: 1,
		pageSize: 8,
	});
	const deferredFilters = useDeferredValue(filters);
	const { history, loading, error } = useDashboardHistory(deferredFilters);
	const {
		savedViews,
		loading: savedViewsLoading,
		createSavedView,
		error: savedViewsError,
	} = useDashboardSavedViews();

	const historyStats = [
		{
			label: "Total scans",
			value: history ? String(history.summary.totalScans) : loading ? "..." : "0",
			detail: history ? `Showing ${history.items.length} results on this page` : "Across your saved dashboard history",
			tone: "fg.default",
		},
		{
			label: "Likely AI detections",
			value: history ? String(history.summary.likelyAiCount) : loading ? "..." : "0",
			detail: "Potential AI-generated images",
			tone: "status.error.text",
		},
		{
			label: "Likely authentic",
			value: history ? String(history.summary.likelyAuthenticCount) : loading ? "..." : "0",
			detail: "Low-risk uploads",
			tone: "status.success.text",
		},
	] as const;

	const applyFilters = (nextFilters: Partial<DashboardHistoryFilters>) => {
		startTransition(() => {
			setFilters(current => ({
				...current,
				...nextFilters,
				page: 1,
			}));
		});
	};

	const handleSaveCurrentView = async () => {
		const name = window.prompt("Name this saved history view");
		if (!name) {
			return;
		}

		await createSavedView({
			name,
			filters: { ...filters, page: 1, pageSize: 25 },
		});
	};

	return (
		<DashboardShell activePath="/dashboard/history" heading="History" kicker="Dashboard">
			{error || savedViewsError
				? (
						<Box bg="status.error.bg" borderWidth="1px" borderColor="status.error.border" borderRadius="panel" p="4">
							<Text color="status.error.text" fontWeight="700">
								{error?.message ?? savedViewsError?.message}
							</Text>
						</Box>
					)
				: null}

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
							Track every scan that passed through AuraDetect.
						</Heading>
						<Text color="fg.muted" mt="3" maxW="3xl">
							Use the history feed to retrace verdicts, confidence swings, and upload sources.
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
				{historyStats.map(stat => (
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
						{history?.items.length
							? history.items.map((entry) => {
									const colors = getToneColors(
										entry.verdict === "likely_ai_generated" ? "error" : "success",
									);

									return (
										<Box
											key={entry.id}
											borderWidth="1px"
											borderColor="border.subtle"
											borderRadius="action"
											px="4"
											py="4"
											bg="bg.input"
										>
											<Flex justify="space-between" align={{ base: "flex-start", lg: "center" }} direction={{ base: "column", lg: "row" }} gap="3">
												<Box>
													<Text fontWeight="700">{entry.originalFilename}</Text>
													<Text color="fg.muted" mt="1">{formatRelativeDate(entry.scannedAt)}</Text>
													<Text color="fg.subtle" mt="2" fontSize="0.92rem">
														Source:
														{" "}
														{formatDashboardSource(entry.source)}
													</Text>
												</Box>
												<HStack gap="3" flexWrap="wrap">
													<Badge bg={colors.bg} color={colors.color} borderWidth="1px" borderColor={colors.border} borderRadius="9999px" px="3" py="1">
														{formatDashboardVerdict(entry.verdict)}
													</Badge>
													<Text fontWeight="700">{formatPercent(entry.confidence)}</Text>
												</HStack>
											</Flex>
										</Box>
									);
								})
							: (
									<Box borderWidth="1px" borderColor="border.subtle" borderRadius="action" px="4" py="5" bg="bg.input">
										<Text fontWeight="700">No history results</Text>
										<Text color="fg.muted" mt="1">
											Adjust your filters or save more scans from the scanner.
										</Text>
									</Box>
								)}
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
							<Text color="fg.muted" mt="1">Switch between reusable filter presets stored in the dashboard backend.</Text>
							<Flex gap="2" mt="3" wrap="wrap">
								<Button size="sm" variant="outline" onClick={() => void handleSaveCurrentView()}>
									Save current view
								</Button>
								{savedViews.map(savedView => (
									<Button
										key={savedView.id}
										size="sm"
										bg={filters.savedViewId === savedView.id ? "brand.primary" : "transparent"}
										color={filters.savedViewId === savedView.id ? "fg.inverted" : "fg.default"}
										borderWidth="1px"
										borderColor="border.subtle"
										onClick={() => applyFilters({ ...savedView.filters, savedViewId: savedView.id })}
									>
										{savedView.name}
									</Button>
								))}
							</Flex>
							{savedViewsLoading ? <Text color="fg.subtle" mt="2">Loading saved views...</Text> : null}
						</Box>
						<Box borderBottomWidth="1px" borderColor="border.subtle" pb="4">
							<Text fontWeight="700">Confidence range</Text>
							<Text color="fg.muted" mt="1">Filter scans by confidence score to focus on stronger signals.</Text>
							<Flex gap="2" mt="3" wrap="wrap">
								{[
									{ label: "All", minConfidence: undefined },
									{ label: "60%+", minConfidence: 0.6 },
									{ label: "85%+", minConfidence: 0.85 },
								].map(option => (
									<Button
										key={option.label}
										size="sm"
										variant="outline"
										onClick={() => applyFilters({ savedViewId: undefined, minConfidence: option.minConfidence })}
									>
										{option.label}
									</Button>
								))}
							</Flex>
						</Box>
						<Box>
							<Text fontWeight="700">Upload source</Text>
							<Text color="fg.muted" mt="1">Narrow results by direct upload, API import, or bulk upload.</Text>
							<Flex gap="2" mt="3" wrap="wrap">
								{[
									{ label: "All", sources: undefined },
									{ label: "Direct", sources: ["direct_upload"] },
									{ label: "API", sources: ["api_import"] },
									{ label: "Bulk", sources: ["bulk_upload"] },
								].map(option => (
									<Button
										key={option.label}
										size="sm"
										variant="outline"
										onClick={() => applyFilters({
											savedViewId: undefined,
											sources: option.sources as DashboardHistoryFilters["sources"],
										})}
									>
										{option.label}
									</Button>
								))}
							</Flex>
							<Flex gap="2" mt="3" wrap="wrap">
								<Button size="sm" variant="outline" onClick={() => applyFilters({ savedViewId: undefined, verdicts: undefined, sources: undefined, minConfidence: undefined })}>
									Clear filters
								</Button>
								<Button size="sm" variant="outline" onClick={() => applyFilters({ savedViewId: undefined, verdicts: ["likely_ai_generated"] })}>
									Likely AI only
								</Button>
								<Button size="sm" variant="outline" onClick={() => applyFilters({ savedViewId: undefined, verdicts: ["likely_authentic"] })}>
									Likely authentic only
								</Button>
							</Flex>
						</Box>
					</VStack>
				</Box>
			</Grid>
		</DashboardShell>
	);
}
