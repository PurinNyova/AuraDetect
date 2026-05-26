"use client";

import type { ReactNode } from "react";
import type { AuthUser } from "./auth-api";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

import { checkSession, login, logout, register } from "./auth-api";

const AUTH_USER_STORAGE_KEY = "auradetect.auth.user";

type LoginInput = {
	email: string;
	password: string;
};

type RegisterInput = {
	name: string;
	email: string;
	password: string;
};

type AuthContextValue = {
	user: AuthUser | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	login: (payload: LoginInput) => Promise<AuthUser>;
	register: (payload: RegisterInput) => Promise<AuthUser>;
	logout: () => Promise<void>;
	refreshSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function persistUser(user: AuthUser | null) {
	if (typeof window === "undefined") {
		return;
	}

	if (!user) {
		window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
		return;
	}

	window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

function readStoredUser(): AuthUser | null {
	if (typeof window === "undefined") {
		return null;
	}

	const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<AuthUser>;
		if (
			typeof parsed.id === "number"
			&& typeof parsed.email === "string"
			&& typeof parsed.name === "string"
		) {
			return {
				id: parsed.id,
				email: parsed.email,
				name: parsed.name,
			};
		}
	}
	catch {
		return null;
	}

	return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	const clearAuthState = useCallback(() => {
		setUser(null);
		setIsAuthenticated(false);
		persistUser(null);
	}, []);

	const refreshSession = useCallback(async () => {
		setIsLoading(true);

		try {
			const hasSession = await checkSession();
			setIsAuthenticated(hasSession);
			if (!hasSession) {
				clearAuthState();
			}
			return hasSession;
		}
		catch {
			clearAuthState();
			return false;
		}
		finally {
			setIsLoading(false);
		}
	}, [clearAuthState]);

	useEffect(() => {
		void refreshSession();
	}, [refreshSession]);

	const loginUser = useCallback(async (payload: LoginInput) => {
		const response = await login(payload);
		setUser(response.user);
		setIsAuthenticated(true);
		persistUser(response.user);
		return response.user;
	}, []);

	const registerUser = useCallback(async (payload: RegisterInput) => {
		const response = await register(payload);
		setUser(response.user);
		setIsAuthenticated(true);
		persistUser(response.user);
		return response.user;
	}, []);

	const logoutUser = useCallback(async () => {
		try {
			await logout();
		}
		finally {
			clearAuthState();
		}
	}, [clearAuthState]);

	const value = useMemo<AuthContextValue>(() => ({
		user,
		isAuthenticated,
		isLoading,
		login: loginUser,
		register: registerUser,
		logout: logoutUser,
		refreshSession,
	}), [isAuthenticated, isLoading, loginUser, logoutUser, refreshSession, registerUser, user]);

	return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
	const context = use(AuthContext);

	if (!context) {
		throw new Error("useAuth must be used inside AuthProvider.");
	}

	return context;
}
