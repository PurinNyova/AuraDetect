export type AuthUser = {
	id: number;
	email: string;
	name: string;
};

type AuthResponse = {
	message: string;
	user: AuthUser;
};

type LoginPayload = {
	email: string;
	password: string;
};

type RegisterPayload = {
	name: string;
	email: string;
	password: string;
};

export class AuthApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "AuthApiError";
		this.status = status;
	}
}

async function requestAuthApi<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`/api/v1/auth${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});

	const payload = (await response.json().catch(() => null)) as
		| Record<string, unknown>
		| null;

	if (!response.ok) {
		const message
			= (payload?.message as string | undefined)
				?? (payload?.detail as string | undefined)
				?? "Authentication request failed.";
		throw new AuthApiError(message, response.status);
	}

	return payload as T;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
	return requestAuthApi<AuthResponse>("/login", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
	return requestAuthApi<AuthResponse>("/register", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function logout() {
	await requestAuthApi<{ message: string }>("/logout", {
		method: "POST",
	});
}

export async function checkSession() {
	const response = await fetch("/api/v1/dashboard/settings", {
		method: "GET",
	});

	if (response.status === 401) {
		return false;
	}

	if (!response.ok) {
		throw new AuthApiError("Unable to verify your session.", response.status);
	}

	return true;
}
