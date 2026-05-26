import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
	globalCss: {
		html: {
			bg: "bg.app",
			color: "fg.default",
			transitionProperty: "background-color, color",
			transitionDuration: "0.3s",
		},
		body: {
			bg: "bg.app",
			color: "fg.default",
			fontFamily: "body",
			minHeight: "100vh",
			transitionProperty: "background-color, color",
			transitionDuration: "0.3s",
		},
	},
	theme: {
		tokens: {
			fonts: {
				heading: { value: "var(--font-inter), sans-serif" },
				body: { value: "var(--font-inter), sans-serif" },
			},
			colors: {
				brand: {
					primary: { value: "#F888B5" },
					hover: { value: "#BAA4ED" },
				},
			},
			radii: {
				panel: { value: "16px" },
				action: { value: "12px" },
				control: { value: "8px" },
			},
			shadows: {
				panel: { value: "0 10px 30px rgba(0, 0, 0, 0.1)" },
			},
		},
		semanticTokens: {
			colors: {
				bg: {
					app: {
						value: {
							_dark: "#1A1419",
							_light: "#F4EEF7",
						},
					},
					panel: {
						value: {
							_dark: "#1D1921",
							_light: "#FFFFFF",
						},
					},
					input: {
						value: {
							_dark: "#1A1419",
							_light: "#F4EEF7",
						},
					},
					dropdown: {
						value: {
							_dark: "#1A1419",
							_light: "#FFFFFF",
						},
					},
					overlay: {
						value: {
							_dark: "rgba(248, 136, 181, 0.1)",
							_light: "rgba(248, 136, 181, 0.18)",
						},
					},
				},
				fg: {
					default: {
						value: {
							_dark: "#D2C7E1",
							_light: "#231728",
						},
					},
					muted: {
						value: {
							_dark: "#7A6483",
							_light: "#715B7A",
						},
					},
					subtle: {
						value: {
							_dark: "#A692B4",
							_light: "#8F7F98",
						},
					},
					accent: {
						value: "{colors.brand.primary}",
					},
				},
				border: {
					default: {
						value: {
							_dark: "#7A6483",
							_light: "rgba(113, 91, 122, 0.28)",
						},
					},
					subtle: {
						value: {
							_dark: "rgba(122, 100, 131, 0.4)",
							_light: "rgba(113, 91, 122, 0.18)",
						},
					},
				},
				status: {
					success: {
						text: {
							value: {
								_dark: "#96D0BB",
								_light: "#1D6B51",
							},
						},
						bg: {
							value: {
								_dark: "rgba(150, 208, 187, 0.1)",
								_light: "rgba(150, 208, 187, 0.16)",
							},
						},
						border: {
							value: {
								_dark: "rgba(150, 208, 187, 0.3)",
								_light: "rgba(29, 107, 81, 0.22)",
							},
						},
					},
					error: {
						text: {
							value: {
								_dark: "#F85149",
								_light: "#B42318",
							},
						},
						bg: {
							value: {
								_dark: "rgba(248, 81, 73, 0.1)",
								_light: "rgba(248, 81, 73, 0.12)",
							},
						},
						border: {
							value: {
								_dark: "rgba(248, 81, 73, 0.3)",
								_light: "rgba(180, 35, 24, 0.22)",
							},
						},
					},
				},
			},
		},
	},
});

export const system = createSystem(defaultConfig, config);
