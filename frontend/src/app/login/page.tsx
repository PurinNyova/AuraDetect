"use client";

import {
	Box,
	Button,
	Container,
	Heading,
	HStack,
	Input,
	Text,
	VStack,
} from "@chakra-ui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthApiError } from "@/app/hooks/auth-api";
import { useAuth } from "@/app/hooks/auth-context";

type AuthMode = "login" | "register";

function getRedirectPath(value: string | null) {
	if (!value || !value.startsWith("/") || value.startsWith("//")) {
		return "/dashboard";
	}

	return value;
}

export default function LoginPage() {
	const router = useRouter();
	const [redirectPath] = useState(() => {
		if (typeof window === "undefined") {
			return "/dashboard";
		}

		const query = new URLSearchParams(window.location.search);
		return getRedirectPath(query.get("redirect"));
	});
	const { isAuthenticated, isLoading, login, register } = useAuth();
	const [mode, setMode] = useState<AuthMode>("login");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isLoading && isAuthenticated) {
			router.replace(redirectPath);
		}
	}, [isAuthenticated, isLoading, redirectPath, router]);

	const submit = async () => {
		setError(null);
		setIsSubmitting(true);

		try {
			if (mode === "login") {
				await login({ email, password });
			}
			else {
				await register({ name, email, password });
			}

			router.replace(redirectPath);
		}
		catch (nextError) {
			setError(
				nextError instanceof AuthApiError
					? nextError.message
					: "Unable to authenticate right now.",
			);
		}
		finally {
			setIsSubmitting(false);
		}
	};

	if (isLoading) {
		return (
			<Container maxW="lg" px="4" py="10">
				<Box bg="bg.panel" borderWidth="1px" borderColor="border.subtle" borderRadius="panel" p="6">
					<Text color="fg.muted">Checking your session...</Text>
				</Box>
			</Container>
		);
	}

	return (
		<Container maxW="lg" px="4" py={{ base: "10", md: "16" }}>
			<VStack gap="6" align="stretch">
				<Box>
					<Heading as="h1" fontSize={{ base: "2rem", md: "2.5rem" }}>
						Access AuraDetect Dashboard
					</Heading>
					<Text color="fg.muted" mt="3">
						Sign in to save scans, view history, and manage dashboard settings.
					</Text>
				</Box>

				<Box bg="bg.panel" borderWidth="1px" borderColor="border.subtle" borderRadius="panel" p={{ base: "5", md: "6" }}>
					<VStack gap="4" align="stretch">
						<HStack gap="2">
							<Button
								flex="1"
								bg={mode === "login" ? "brand.primary" : "transparent"}
								color={mode === "login" ? "fg.inverted" : "fg.muted"}
								borderWidth="1px"
								borderColor={mode === "login" ? "brand.primary" : "border.subtle"}
								onClick={() => setMode("login")}
							>
								Log In
							</Button>
							<Button
								flex="1"
								bg={mode === "register" ? "brand.primary" : "transparent"}
								color={mode === "register" ? "fg.inverted" : "fg.muted"}
								borderWidth="1px"
								borderColor={mode === "register" ? "brand.primary" : "border.subtle"}
								onClick={() => setMode("register")}
							>
								Create Account
							</Button>
						</HStack>

						{mode === "register"
							? (
									<Input
										placeholder="Full name"
										value={name}
										onChange={event => setName(event.target.value)}
										disabled={isSubmitting}
									/>
								)
							: null}

						<Input
							type="email"
							placeholder="Email"
							value={email}
							onChange={event => setEmail(event.target.value)}
							disabled={isSubmitting}
						/>
						<Input
							type="password"
							placeholder="Password"
							value={password}
							onChange={event => setPassword(event.target.value)}
							disabled={isSubmitting}
						/>

						{error
							? (
									<Text color="status.error.text" fontSize="0.9rem">
										{error}
									</Text>
								)
							: null}

						<Button
							bg="brand.primary"
							color="fg.inverted"
							fontWeight="700"
							disabled={
								isSubmitting
								|| !email.trim()
								|| password.length < 8
								|| (mode === "register" && !name.trim())
							}
							onClick={() => {
								void submit();
							}}
						>
							{isSubmitting
								? mode === "login"
									? "Signing in..."
									: "Creating account..."
								: mode === "login"
									? "Sign In"
									: "Create Account"}
						</Button>
					</VStack>
				</Box>

				<Text color="fg.muted" fontSize="0.9rem">
					Want to run a quick scan without saving? Visit
					{" "}
					<Link href="/scan" style={{ color: "var(--chakra-colors-brand-primary)" }}>
						the scanner
					</Link>
					.
				</Text>
			</VStack>
		</Container>
	);
}
