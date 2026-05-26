import {
	Box,
	Button,
	Container,
	Flex,
	Heading,
	SimpleGrid,
	Text,
} from "@chakra-ui/react";
import Link from "next/link";

const featureCards = [
	{
		title: "Visual Transformer based Detection",
		iconPath:
      "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
		description:
      "Identifies micro-artifacts left behind by AI Generation models that are completely invisible to the human eye.",
	},
	{
		title: "Diffusion Noise Analysis",
		iconPath:
      "M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-.9 2-2V5c0-1-1-2-2-2zM5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6H5z",
		description:
      "Analyzes image noise profiles specifically looking for uniform diffusion patterns found in tools like Midjourney and Stable Diffusion.",
	},
	{
		title: "Detects many types of models",
		iconPath:
      "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
		description:
      "Flux, Stable Diffusion, Midjourney, DALL-E, Gemini, and more. We are constantly adding support for new models as they are released.",
	},
] as const;

export default function Home() {
	return (
		<Container maxW="1200px" px={{ base: "4", md: "6" }} py="8" mx="auto">
			<Box animation="fadeIn 0.5s ease-out" width="100%">
				<Box textAlign="center" pt="16" pb="12" maxW="900px" mx="auto">
					<Heading
						as="h1"
						fontSize={{ base: "2.5rem", md: "3.5rem" }}
						lineHeight="1.2"
						mb="6"
						fontWeight="700"
						color="fg.default"
					>
						Free & Open Source AI Detection
					</Heading>
					<Text color="fg.muted" fontSize="1.25rem" mb="10" lineHeight="1.6">
						An advanced, community-driven neural network designed to detect AI-generated
						imagery, deepfakes, and synthetic manipulations. 100% free, transparent, and open
						source.
					</Text>
					<Link href="/scan" style={{ textDecoration: "none" }}>
						<Button
							height="auto"
							minW="auto"
							bg="brand.primary"
							color="#1A1419"
							px="8"
							py="4"
							borderRadius="action"
							fontWeight="600"
							fontSize="1.125rem"
							transition="all 0.2s ease"
							_hover={{ bg: "brand.hover", transform: "translateY(-1px)" }}
							_active={{ transform: "translateY(0)" }}
						>
							Start Scanning Now
						</Button>
					</Link>
				</Box>

				<SimpleGrid minChildWidth="280px" gap="8" mt="16">
					{featureCards.map(feature => (
						<Box
							key={feature.title}
							bg="bg.panel"
							borderWidth="1px"
							borderColor="border.subtle"
							p="8"
							borderRadius="panel"
							transition="transform 0.2s, box-shadow 0.2s, border-color 0.2s"
							_hover={{
								transform: "translateY(-4px)",
								boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
								borderColor: "bg.overlay",
							}}
						>
							<Flex
								width="48px"
								height="48px"
								bg="bg.overlay"
								borderRadius="action"
								align="center"
								justify="center"
								mb="6"
								color="brand.primary"
							>
								<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path d={feature.iconPath} />
								</svg>
							</Flex>
							<Heading as="h3" fontSize="1.25rem" mb="3">
								{feature.title}
							</Heading>
							<Text color="fg.muted" lineHeight="1.5">
								{feature.description}
							</Text>
						</Box>
					))}
				</SimpleGrid>
			</Box>
		</Container>
	);
}
