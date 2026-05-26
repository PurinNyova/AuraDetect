"use client";

import {
	Badge,
	Box,
	Button,
	Flex,
	Grid,
	Heading,
	SimpleGrid,
	Text,
	VStack,
} from "@chakra-ui/react";
import Link from "next/link";

import { useDashboardNotifications } from "../../hooks/useDashboardNotifications";
import { useDashboardSettings } from "../../hooks/useDashboardSettings";
import { DashboardShell } from "../dashboard-shell";

export default function DashboardSettingsPage() {
	const { settings, loading, saving, error, updateSettings } = useDashboardSettings();
	const { unreadCount } = useDashboardNotifications({ pageSize: 5, unreadOnly: true });

	const preferences = settings
		? [
				{
					key: "highRiskAlertsEnabled" as const,
					title: "High-risk alerts",
					description: "Notify you when confidence crosses the likely AI-generated threshold.",
					checked: settings.highRiskAlertsEnabled,
				},
				{
					key: "keepOriginalsForAudits" as const,
					title: "Keep originals for audits",
					description: "Retain uploaded images for audit needs beyond the default cleanup window.",
					checked: settings.keepOriginalsForAudits,
				},
				{
					key: "privacyModeEnabled" as const,
					title: "Privacy mode",
					description: "Clear saved uploads after the configured retention window unless audits require them.",
					checked: settings.privacyModeEnabled,
				},
			]
		: [];

	const accountSignals = settings
		? [
				{
					title: "Retention window",
					value: `${settings.retentionHours} hrs`,
					description: "Saved scan evidence is retained for this long before cleanup applies.",
				},
				{
					title: "Alert threshold",
					value: `${settings.alertThresholdPercent}%`,
					description: `${unreadCount} unread high-risk notifications are currently waiting for review.`,
				},
			]
		: [];

	return (
		<DashboardShell activePath="/dashboard/settings" heading="Settings" kicker="Dashboard">
			{error
				? (
						<Box bg="status.error.bg" borderWidth="1px" borderColor="status.error.border" borderRadius="panel" p="4">
							<Text color="status.error.text" fontWeight="700">{error.message}</Text>
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
							Tune how AuraDetect stores and escalates scan results.
						</Heading>
						<Text color="fg.muted" mt="3" maxW="3xl">
							These settings shape your workflow, retention defaults, and the kinds of signals that should trigger alerts.
						</Text>
					</Box>

					<Link href="/dashboard/history" style={{ textDecoration: "none" }}>
						<Button
							height="auto"
							minW="auto"
							bg="transparent"
							color="fg.default"
							px="4"
							py="3"
							borderRadius="control"
							fontWeight="700"
							_hover={{ bg: "border.subtle" }}
						>
							View scan history
						</Button>
					</Link>
				</Flex>
			</Box>

			<Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1.1fr) minmax(320px, 0.9fr)" }} gap="6">
				<Box
					bg="bg.panel"
					borderWidth="1px"
					borderColor="border.subtle"
					borderRadius="panel"
					p={{ base: "5", md: "6" }}
					boxShadow="panel"
				>
					<Heading as="h2" fontSize="1.35rem">
						Preferences
					</Heading>

					<VStack align="stretch" gap="4" mt="5">
						{preferences.map(preference => (
							<Flex
								key={preference.title}
								justify="space-between"
								gap="4"
								align="flex-start"
								borderBottomWidth="1px"
								borderColor="border.subtle"
								pb="4"
								_last={{ borderBottomWidth: "0", pb: "0" }}
							>
								<Box>
									<Text fontWeight="700">{preference.title}</Text>
									<Text color="fg.muted" mt="1" lineHeight="1.6">
										{preference.description}
									</Text>
								</Box>
								<Button
									height="auto"
									minW="88px"
									bg={preference.checked ? "brand.primary" : "transparent"}
									color={preference.checked ? "fg.inverted" : "fg.default"}
									borderWidth="1px"
									borderColor="border.subtle"
									borderRadius="control"
									fontWeight="700"
									disabled={!settings || saving}
									onClick={() => void updateSettings({ [preference.key]: !preference.checked })}
								>
									{preference.checked ? "Enabled" : "Disabled"}
								</Button>
							</Flex>
						))}
						{loading ? <Text color="fg.muted">Loading settings...</Text> : null}
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
						<Heading as="h2" fontSize="1.35rem" mb="5">
							Account signals
						</Heading>

						<VStack align="stretch" gap="4">
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
							{!loading && !accountSignals.length ? <Text color="fg.muted">No settings available yet.</Text> : null}
						</VStack>
					</Box>

					<SimpleGrid minChildWidth="220px" gap="4">
						<Box
							bg="bg.panel"
							borderWidth="1px"
							borderColor="border.subtle"
							borderRadius="panel"
							p="5"
							boxShadow="panel"
						>
							<Text color="fg.muted" fontSize="0.92rem">Retention window</Text>
							<Heading as="h3" fontSize="2rem" mt="3">{settings ? `${settings.retentionHours} hrs` : "..."}</Heading>
							<Flex gap="2" mt="3" wrap="wrap">
								{[12, 24, 72].map(hours => (
									<Button key={hours} size="sm" variant="outline" disabled={!settings || saving} onClick={() => void updateSettings({ retentionHours: hours })}>
										{hours}
										h
									</Button>
								))}
							</Flex>
							<Text color="brand.primary" mt="2" fontWeight="600">Short-lived by default</Text>
						</Box>
						<Box
							bg="bg.panel"
							borderWidth="1px"
							borderColor="border.subtle"
							borderRadius="panel"
							p="5"
							boxShadow="panel"
						>
							<Text color="fg.muted" fontSize="0.92rem">Alert threshold</Text>
							<Heading as="h3" fontSize="2rem" mt="3">{settings ? `${settings.alertThresholdPercent}%` : "..."}</Heading>
							<Flex gap="2" mt="3" wrap="wrap">
								{[70, 85, 95].map(threshold => (
									<Button key={threshold} size="sm" variant="outline" disabled={!settings || saving} onClick={() => void updateSettings({ alertThresholdPercent: threshold })}>
										{threshold}
										%
									</Button>
								))}
							</Flex>
							<Flex mt="3" align="center" gap="2">
								<Badge colorPalette={settings?.highRiskAlertsEnabled ? "orange" : "gray"}>
									{settings?.highRiskAlertsEnabled ? "Alerts active" : "Alerts paused"}
								</Badge>
								<Text color="status.error.text" fontWeight="600">Escalate on likely AI results</Text>
							</Flex>
						</Box>
					</SimpleGrid>
				</VStack>
			</Grid>
		</DashboardShell>
	);
}
