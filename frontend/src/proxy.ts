import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

function isAuthenticated(request: NextRequest) {
	return Boolean(request.cookies.get("auradetect.sid")?.value);
}

export function proxy(request: NextRequest) {
	const { nextUrl } = request;
	const authed = isAuthenticated(request);
	const isDashboardPath = nextUrl.pathname.startsWith("/dashboard");
	const isLoginPath = nextUrl.pathname === "/login";

	if (isDashboardPath && !authed) {
		const loginUrl = new URL("/login", request.url);
		loginUrl.searchParams.set(
			"redirect",
			`${nextUrl.pathname}${nextUrl.search}`,
		);
		return NextResponse.redirect(loginUrl);
	}

	if (isLoginPath && authed) {
		const redirectUrl = new URL("/dashboard", request.url);
		return NextResponse.redirect(redirectUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/dashboard/:path*", "/login"],
};
