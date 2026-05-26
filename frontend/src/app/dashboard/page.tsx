"use client";

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

import { useDashboardHistory } from "../hooks/useDashboardHistory";
import { useDashboardNotifications } from "../hooks/useDashboardNotifications";
import { useDashboardSettings } from "../hooks/useDashboardSettings";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { DashboardShell } from "./dashboard-shell";

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

function formatVerdict(verdict: "likely_ai_generated" | "likely_authentic") {
	return verdict === "likely_ai_generated" ? "Likely AI-generated" : "Likely authentic";
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

export default function DashboardPage() {
	const { stats, loading: statsLoading, error: statsError } = useDashboardStats();
	const { history, loading: historyLoading, error: historyError } = useDashboardHistory({
		page: 1,
		pageSize: 3,
	});
	const { settings, loading: settingsLoading, error: settingsError } = useDashboardSettings();
	const { notifications, unreadCount, loading: notificationsLoading } = useDashboardNotifications({
		pageSize: 2,
		unreadOnly: true,
	});

	const overviewStats = [
		{
			label: "Scans this week",
			value: stats ? String(stats.weeklyScans) : statsLoading ? "..." : "0",
			detail: stats
				? `${stats.weeklyScanDelta >= 0 ? "+" : ""}${stats.weeklyScanDelta} from last week`
				: "Waiting for dashboard data",
			tone: stats && stats.weeklyScanDelta < 0 ? "fg.muted" : "status.success.text",
		},
		{
			label: "Likely AI results",
			value: stats ? String(stats.likelyAiCount) : statsLoading ? "..." : "0",
			detail: stats
				? `${stats.highRiskNotificationCount} high-risk alerts recorded`
				: "Waiting for dashboard data",
			tone: "status.error.text",
		},
		{
			label: "Average confidence",
			value: stats ? formatPercent(stats.avgConfidence) : statsLoading ? "..." : "0%",
			detail: history?.summary
				? `Across ${history.summary.totalScans} saved scans`
				: "Calculated from saved dashboard scans",
			tone: "brand.primary",
		},
	] as const;

	const accountSignals = settings
		? [
				{
					title: "Privacy mode",
					value: settings.privacyModeEnabled ? "On" : "Off",
					description: `Saved uploads are retained for ${settings.retentionHours} hours by default.`,
				},
				{
					title: "Alert threshold",
					value: `${settings.alertThresholdPercent}%`,
					description: settings.highRiskAlertsEnabled
						? "High-risk alerts are enabled for likely AI-generated scans."
						: "High-risk alerts are currently paused.",
				},
			]
		: [];

	return (
		<DashboardShell activePath="/dashboard">
			{statsError || historyError || settingsError
				? (
						<Box bg="status.error.bg" borderWidth="1px" borderColor="status.error.border" borderRadius="panel" p="4">
							<Text color="status.error.text" fontWeight="700">
								{statsError?.message ?? historyError?.message ?? settingsError?.message}
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
							Keep an eye on your latest scans and confidence trends.
						</Heading>
						<Text color="fg.muted" mt="3" maxW="3xl">
							Jump into dedicated history and settings views without leaving your dashboard.
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
				{overviewStats.map(stat => (
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
							<Text color="fg.muted" mt="1">
								{historyLoading ? "Loading your recent scans..." : `${history?.total ?? 0} saved scans available`}
							</Text>
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
						{history?.items.length
							? history.items.map((scan) => {
									const colors = getToneColors(
										scan.verdict === "likely_ai_generated" ? "error" : "success",
									);

									return (
										<Box
											key={scan.id}
											borderWidth="1px"
											borderColor="border.subtle"
											borderRadius="action"
											px="4"
											py="4"
											bg="bg.input"
										>
											<Flex justify="space-between" align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} gap="3">
												<Box>
													<Text fontWeight="700">{scan.originalFilename}</Text>
													<Text color="fg.muted" mt="1">{formatRelativeDate(scan.scannedAt)}</Text>
												</Box>
												<HStack gap="3" flexWrap="wrap">
													<Badge bg={colors.bg} color={colors.color} borderWidth="1px" borderColor={colors.border} borderRadius="9999px" px="3" py="1">
														{formatVerdict(scan.verdict)}
													</Badge>
													<Text fontWeight="700">{formatPercent(scan.confidence)}</Text>
												</HStack>
											</Flex>
										</Box>
									);
								})
							: (
									<Box borderWidth="1px" borderColor="border.subtle" borderRadius="action" px="4" py="5" bg="bg.input">
										<Text fontWeight="700">No saved scans yet</Text>
										<Text color="fg.muted" mt="1">
											Run a scan and save it to start building your dashboard history.
										</Text>
									</Box>
								)}
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
							{settingsLoading && !accountSignals.length
								? (
										<Text color="fg.muted">Loading settings...</Text>
									)
								: null}
							{accountSignals.map(item => (
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
							{!settingsLoading && !accountSignals.length
								? (
										<Text color="fg.muted">No dashboard settings available yet.</Text>
									)
								: null}
						</VStack>
					</Box>

					<Box bg="bg.panel" borderWidth="1px" borderColor="border.subtle" borderRadius="panel" p={{ base: "5", md: "6" }} boxShadow="panel">
						<Heading as="h2" fontSize="1.35rem">
							Next recommended action
						</Heading>
						<Text color="fg.muted" mt="3" lineHeight="1.6">
							{notificationsLoading
								? "Checking alert activity..."
								: unreadCount > 0
									? `${unreadCount} unread high-risk notifications need review.`
									: "No unread high-risk notifications. Keep saving scans to build your evidence trail."}
						</Text>
						{notifications[0]
							? (
									<Box mt="4" borderWidth="1px" borderColor="border.subtle" borderRadius="action" px="4" py="4" bg="bg.input">
										<Text fontWeight="700">{notifications[0].payload.title}</Text>
										<Text color="fg.muted" mt="1">{notifications[0].payload.message}</Text>
									</Box>
								)
							: null}
						<Link href="/dashboard/settings" style={{ textDecoration: "none" }}>
							<Button
								mt="5"
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
