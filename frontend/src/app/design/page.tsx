"use client";

import {
	Badge,
	Box,
	Button,
	Container,
	Flex,
	Grid,
	Heading,
	HStack,
	SimpleGrid,
	Stack,
	Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

const paletteGroups = [
	{
		title: "Brand",
		description: "Core accent colors carried over from the detector concept.",
		swatches: [
			{ label: "brand.primary", value: "#F888B5" },
			{ label: "brand.hover", value: "#BAA4ED" },
		],
	},
	{
		title: "Background",
		description: "Surface tokens for page, panels, fields, dropdowns, and soft highlight overlays.",
		swatches: [
			{ label: "bg.app", dark: "#1A1419", light: "#F4EEF7", token: "bg.app" },
			{ label: "bg.panel", dark: "#1D1921", light: "#FFFFFF", token: "bg.panel" },
			{ label: "bg.input", dark: "#1A1419", light: "#F4EEF7", token: "bg.input" },
			{ label: "bg.dropdown", dark: "#1A1419", light: "#FFFFFF", token: "bg.dropdown" },
			{
				label: "bg.overlay",
				dark: "rgba(248, 136, 181, 0.1)",
				light: "rgba(248, 136, 181, 0.18)",
				token: "bg.overlay",
			},
		],
	},
	{
		title: "Foreground",
		description: "Readable text and accent tokens for headings, body copy, and secondary labels.",
		swatches: [
			{ label: "fg.default", dark: "#D2C7E1", light: "#231728", token: "fg.default" },
			{ label: "fg.muted", dark: "#7A6483", light: "#715B7A", token: "fg.muted" },
			{ label: "fg.subtle", dark: "#A692B4", light: "#8F7F98", token: "fg.subtle" },
			{ label: "fg.accent", value: "#F888B5", token: "fg.accent" },
		],
	},
	{
		title: "Border",
		description: "Default and subtle divider treatments from the original UI surfaces.",
		swatches: [
			{
				label: "border.default",
				dark: "#7A6483",
				light: "rgba(113, 91, 122, 0.28)",
				token: "border.default",
			},
			{
				label: "border.subtle",
				dark: "rgba(122, 100, 131, 0.4)",
				light: "rgba(113, 91, 122, 0.18)",
				token: "border.subtle",
			},
		],
	},
] as const;

const statusGroups = [
	{
		title: "Success",
		tokenPrefix: "status.success",
		text: { dark: "#96D0BB", light: "#1D6B51", token: "status.success.text" },
		bg: {
			dark: "rgba(150, 208, 187, 0.1)",
			light: "rgba(150, 208, 187, 0.16)",
			token: "status.success.bg",
		},
		border: {
			dark: "rgba(150, 208, 187, 0.3)",
			light: "rgba(29, 107, 81, 0.22)",
			token: "status.success.border",
		},
	},
	{
		title: "Error",
		tokenPrefix: "status.error",
		text: { dark: "#F85149", light: "#B42318", token: "status.error.text" },
		bg: {
			dark: "rgba(248, 81, 73, 0.1)",
			light: "rgba(248, 81, 73, 0.12)",
			token: "status.error.bg",
		},
		border: {
			dark: "rgba(248, 81, 73, 0.3)",
			light: "rgba(180, 35, 24, 0.22)",
			token: "status.error.border",
		},
	},
] as const;

const typeScale = [
	{ label: "Display", size: { base: "4xl", md: "6xl" }, sample: "AuraDetect forensic UI" },
	{ label: "Section heading", size: "3xl", sample: "Token groups and semantic surfaces" },
	{ label: "Body", size: "md", sample: "Readable analysis copy for reports, upload flows, and notes." },
	{ label: "Caption", size: "sm", sample: "Muted metadata and annotations" },
] as const;

const radiusSamples = [
	{ label: "control", value: "8px", rounded: "control" },
	{ label: "action", value: "12px", rounded: "action" },
	{ label: "panel", value: "16px", rounded: "panel" },
] as const;

const shadowSamples = [{ label: "panel", value: "0 10px 30px rgba(0, 0, 0, 0.1)", shadow: "panel" }] as const;

type ThemeMode = "dark" | "light";

export default function DesignPage() {
	const [theme, setTheme] = useState<ThemeMode>("dark");

	useEffect(() => {
		const root = document.documentElement;

		root.setAttribute("data-theme", theme);
		root.classList.remove("dark", "light");
		root.classList.add(theme);
	}, [theme]);

	return (
		<Box minH="100vh" bg="bg.app" color="fg.default">
			<Box
				as="header"
				position="sticky"
				top="0"
				zIndex="docked"
				bg="bg.panel"
				borderBottomWidth="1px"
				borderColor="border.subtle"
				backdropFilter="blur(18px)"
			>
				<Container maxW="7xl" py="4">
					<Flex align="center" justify="space-between" gap="4" wrap="wrap">
						<Stack gap="1">
							<Text fontWeight="700" textTransform="uppercase" letterSpacing="0.12em" color="fg.accent">
								Design Tokens
							</Text>
							<Heading as="h1" size="lg">
								AuraDetect theme reference
							</Heading>
						</Stack>

						<HStack gap="3" wrap="wrap">
							<Button
								variant="ghost"
								color="fg.muted"
								_hover={{ bg: "bg.overlay", color: "fg.default" }}
								onClick={() => setTheme(current => (current === "dark" ? "light" : "dark"))}
							>
								Toggle Theme
							</Button>
							<Link href="/">
								<Button rounded="action" bg="brand.primary" color="#1A1419" _hover={{ bg: "brand.hover" }}>
									Back Home
								</Button>
							</Link>
						</HStack>
					</Flex>
				</Container>
			</Box>

			<Container maxW="7xl" py={{ base: "10", md: "14" }}>
				<Stack gap={{ base: "10", md: "14" }}>
					<Box
						rounded="panel"
						borderWidth="1px"
						borderColor="border.subtle"
						bg="bg.panel"
						p={{ base: "6", md: "8" }}
						shadow="panel"
					>
						<Stack gap="5">
							<Badge w="fit-content" px="4" py="2" rounded="full" bg="bg.overlay" color="fg.accent">
								Theme:
								{" "}
								{theme}
							</Badge>
							<Heading fontSize={{ base: "3xl", md: "5xl" }} lineHeight="1.05">
								All palettes and styles, at a glance.
							</Heading>
							<Text maxW="3xl" color="fg.muted" fontSize={{ base: "md", md: "lg" }} lineHeight="1.8">
								This page previews the Chakra tokens extracted from the original detector prototype,
								including semantic surfaces, text roles, status treatments, radii, and shadow depth.
							</Text>
						</Stack>
					</Box>

					<SimpleGrid columns={{ base: 1, xl: 2 }} gap="6">
						{paletteGroups.map(group => (
							<Box
								key={group.title}
								rounded="panel"
								borderWidth="1px"
								borderColor="border.subtle"
								bg="bg.panel"
								p={{ base: "6", md: "7" }}
								shadow="panel"
							>
								<Heading as="h2" fontSize="2xl" mb="2">
									{group.title}
								</Heading>
								<Text color="fg.muted" mb="6" lineHeight="1.7">
									{group.description}
								</Text>

								<Stack gap="4">
									{group.swatches.map(swatch => (
										<Box key={swatch.label}>
											<Flex justify="space-between" gap="4" align="center" mb="2">
												<Stack gap="0">
													<Text fontWeight="700">{swatch.label}</Text>
													<Text fontSize="sm" color="fg.subtle">
														{"token" in swatch && swatch.token ? swatch.token : "raw value"}
													</Text>
												</Stack>
												<Text fontSize="sm" color="fg.subtle">
													{"value" in swatch && swatch.value ? swatch.value : `${swatch.dark} / ${swatch.light}`}
												</Text>
											</Flex>

											<Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="3">
												<ColorSwatchCard
													label="Dark"
													bgValue={"token" in swatch && swatch.token ? swatch.token : swatch.value}
													rawValue={"value" in swatch && swatch.value ? swatch.value : swatch.dark}
												/>
												<ColorSwatchCard
													label="Light"
													bgValue={"token" in swatch && swatch.token ? swatch.token : swatch.value}
													rawValue={"value" in swatch && swatch.value ? swatch.value : swatch.light}
												/>
											</Grid>
										</Box>
									))}
								</Stack>
							</Box>
						))}
					</SimpleGrid>

					<Grid templateColumns={{ base: "1fr", xl: "1.1fr 0.9fr" }} gap="6">
						<Box
							rounded="panel"
							borderWidth="1px"
							borderColor="border.subtle"
							bg="bg.panel"
							p={{ base: "6", md: "7" }}
							shadow="panel"
						>
							<Heading as="h2" fontSize="2xl" mb="2">
								Status Styles
							</Heading>
							<Text color="fg.muted" mb="6" lineHeight="1.7">
								Ready-made semantic treatments for safe and risky detector outputs.
							</Text>

							<Stack gap="5">
								{statusGroups.map(group => (
									<Box
										key={group.title}
										rounded="panel"
										borderWidth="1px"
										borderColor={group.border.token}
										bg={group.bg.token}
										p="5"
									>
										<Text color={group.text.token} fontWeight="800" mb="3">
											{group.title}
										</Text>
										<Text color="fg.muted" mb="4">
											{group.tokenPrefix}
											.text, .bg, and .border
										</Text>
										<Grid templateColumns={{ base: "1fr", md: "repeat(3, minmax(0, 1fr))" }} gap="3">
											<TokenMeta label="Text" dark={group.text.dark} light={group.text.light} />
											<TokenMeta label="Background" dark={group.bg.dark} light={group.bg.light} />
											<TokenMeta label="Border" dark={group.border.dark} light={group.border.light} />
										</Grid>
									</Box>
								))}
							</Stack>
						</Box>

						<Stack gap="6">
							<Box
								rounded="panel"
								borderWidth="1px"
								borderColor="border.subtle"
								bg="bg.panel"
								p={{ base: "6", md: "7" }}
								shadow="panel"
							>
								<Heading as="h2" fontSize="2xl" mb="2">
									Typography
								</Heading>
								<Text color="fg.muted" mb="6">
									Inter is applied to both heading and body roles through the theme.
								</Text>
								<Stack gap="5">
									{typeScale.map(sample => (
										<Box key={sample.label}>
											<Text color="fg.subtle" fontSize="sm" textTransform="uppercase" letterSpacing="0.12em" mb="2">
												{sample.label}
											</Text>
											<Text fontSize={sample.size} lineHeight="1.15" fontWeight={sample.label === "Body" || sample.label === "Caption" ? "500" : "700"}>
												{sample.sample}
											</Text>
										</Box>
									))}
								</Stack>
							</Box>

							<Box
								rounded="panel"
								borderWidth="1px"
								borderColor="border.subtle"
								bg="bg.panel"
								p={{ base: "6", md: "7" }}
								shadow="panel"
							>
								<Heading as="h2" fontSize="2xl" mb="6">
									Shape and Depth
								</Heading>

								<Stack gap="5">
									{radiusSamples.map(sample => (
										<Flex key={sample.label} align="center" justify="space-between" gap="4">
											<Stack gap="1">
												<Text fontWeight="700">
													radius.
													{sample.label}
												</Text>
												<Text fontSize="sm" color="fg.subtle">
													{sample.value}
												</Text>
											</Stack>
											<Box w="20" h="14" rounded={sample.rounded} bg="bg.overlay" borderWidth="1px" borderColor="border.subtle" />
										</Flex>
									))}

									{shadowSamples.map(sample => (
										<Flex key={sample.label} align="center" justify="space-between" gap="4">
											<Stack gap="1">
												<Text fontWeight="700">
													shadow.
													{sample.label}
												</Text>
												<Text fontSize="sm" color="fg.subtle">
													{sample.value}
												</Text>
											</Stack>
											<Box
												w="24"
												h="16"
												rounded="panel"
												bg="bg.dropdown"
												borderWidth="1px"
												borderColor="border.subtle"
												shadow={sample.shadow}
											/>
										</Flex>
									))}
								</Stack>
							</Box>
						</Stack>
					</Grid>

					<Box
						rounded="panel"
						borderWidth="1px"
						borderColor="border.subtle"
						bg="bg.panel"
						p={{ base: "6", md: "7" }}
						shadow="panel"
					>
						<Heading as="h2" fontSize="2xl" mb="6">
							Component Snapshot
						</Heading>

						<SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
							<Stack rounded="panel" borderWidth="1px" borderColor="border.subtle" bg="bg.input" p="5" gap="4">
								<Text fontWeight="700">Primary action</Text>
								<Button rounded="action" bg="brand.primary" color="#1A1419" _hover={{ bg: "brand.hover" }}>
									Scan Image
								</Button>
							</Stack>

							<Stack rounded="panel" borderWidth="1px" borderColor="border.subtle" bg="bg.input" p="5" gap="4">
								<Text fontWeight="700">Secondary action</Text>
								<Button variant="outline" rounded="action" borderColor="border.default" color="fg.default" _hover={{ bg: "bg.overlay" }}>
									View Details
								</Button>
							</Stack>

							<Stack rounded="panel" borderWidth="1px" borderColor="border.subtle" bg="bg.input" p="5" gap="4">
								<Text fontWeight="700">Accent badge</Text>
								<Badge px="4" py="2" rounded="full" bg="bg.overlay" color="fg.accent" w="fit-content">
									Open Source
								</Badge>
							</Stack>

							<Stack rounded="panel" borderWidth="1px" borderColor="status.error.border" bg="status.error.bg" p="5" gap="3">
								<Text color="status.error.text" fontWeight="800">
									High AI probability
								</Text>
								<Text color="fg.subtle">Synthetic artifacts remain visible across the frame.</Text>
							</Stack>
						</SimpleGrid>
					</Box>
				</Stack>
			</Container>
		</Box>
	);
}

type ColorSwatchCardProps = {
	label: string;
	bgValue?: string;
	rawValue?: string;
};

function ColorSwatchCard({ label, bgValue, rawValue }: ColorSwatchCardProps) {
	return (
		<Box rounded="panel" borderWidth="1px" borderColor="border.subtle" overflow="hidden">
			<Flex h="20" bg={bgValue} align="end" p="3">
				<Box px="2" py="1" rounded="control" bg="bg.panel" borderWidth="1px" borderColor="border.subtle">
					<Text fontSize="xs" color="fg.subtle">
						{label}
					</Text>
				</Box>
			</Flex>
			<Box p="3" bg="bg.input">
				<Text fontSize="sm" color="fg.subtle">
					{rawValue}
				</Text>
			</Box>
		</Box>
	);
}

type TokenMetaProps = {
	label: string;
	dark: string;
	light: string;
};

function TokenMeta({ label, dark, light }: TokenMetaProps) {
	return (
		<Box rounded="panel" borderWidth="1px" borderColor="border.subtle" bg="bg.panel" p="4">
			<Text fontWeight="700" mb="2">
				{label}
			</Text>
			<Text fontSize="sm" color="fg.subtle">
				Dark:
				{" "}
				{dark}
			</Text>
			<Text fontSize="sm" color="fg.subtle">
				Light:
				{" "}
				{light}
			</Text>
		</Box>
	);
}
