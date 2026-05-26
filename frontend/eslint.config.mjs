import antfu from "@antfu/eslint-config";

export default antfu({
	type: "app",
	react: true,
	typescript: true,
	formatters: true,
	stylistic: {
		indent: "tab",
		semi: true,
		quotes: "double",
	},
	ignores: [
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",
	],
}, {
	rules: {
		"no-restricted-syntax": ["error", "ForInStatement", "LabeledStatement", "WithStatement"],
		"no-alert": "off",
		"react/no-implicit-key": "off",
		"style/no-tabs": "off",
		"ts/consistent-type-definitions": "off",
	},
});
