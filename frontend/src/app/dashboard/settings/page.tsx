import {
	Box,
	Button,
	Flex,
	Grid,
	Heading,
	SimpleGrid,
	Switch,
	Text,
	VStack,
} from "@chakra-ui/react";
import Link from "next/link";

import { DashboardShell } from "../dashboard-shell";

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

const preferences = [
	{
		title: "Auto-export reports",
		description: "Create PDF summaries as soon as a scan reaches a final verdict.",
		defaultChecked: true,
	},
	{
		title: "High-risk alerts",
		description: "Notify your team when confidence crosses the likely AI-generated threshold.",
		defaultChecked: true,
	},
	{
		title: "Keep originals for audits",
		description: "Retain uploaded images for internal review beyond the default cleanup window.",
		defaultChecked: false,
	},
] as const;

export default function DashboardSettingsPage() {
	return (
		<DashboardShell activePath="/dashboard/settings" heading="Settings" kicker="Dashboard">
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
							Tune how AuraDetect stores, shares, and escalates scan results.
						</Heading>
						<Text color="fg.muted" mt="3" maxW="3xl">
							These settings shape your team workflow, retention defaults, and the kinds of signals that should trigger follow-up review.
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
						{preferences.map((preference) => (
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
								<Switch.Root defaultChecked={preference.defaultChecked} colorPalette="orange">
									<Switch.HiddenInput />
									<Switch.Control />
								</Switch.Root>
							</Flex>
						))}
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
							<Heading as="h3" fontSize="2rem" mt="3">24 hrs</Heading>
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
							<Heading as="h3" fontSize="2rem" mt="3">85%</Heading>
							<Text color="status.error.text" mt="2" fontWeight="600">Escalate on likely AI results</Text>
						</Box>
					</SimpleGrid>
				</VStack>
			</Grid>
		</DashboardShell>
	);
}