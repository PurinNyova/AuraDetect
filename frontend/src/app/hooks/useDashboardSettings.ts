"use client";

import type {
	DashboardSettings,
} from "./dashboard-api";

import { useCallback, useEffect, useState } from "react";
import {
	DashboardApiError,
	requestDashboardApi,
} from "./dashboard-api";

type UpdateDashboardSettingsInput = Partial<
	Omit<DashboardSettings, "id" | "updatedAt">
>;

type UseDashboardSettingsResult = {
	error: DashboardApiError | null;
	loading: boolean;
	refresh: () => Promise<void>;
	saving: boolean;
	settings: DashboardSettings | null;
	updateSettings: (
		input: UpdateDashboardSettingsInput,
	) => Promise<DashboardSettings | null>;
};

export function useDashboardSettings(): UseDashboardSettingsResult {
	const [settings, setSettings] = useState<DashboardSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<DashboardApiError | null>(null);

	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const nextSettings = await requestDashboardApi<DashboardSettings>(
				"/dashboard/settings",
			);
			setSettings(nextSettings);
		}
		catch (nextError) {
			setError(
				nextError instanceof DashboardApiError
					? nextError
					: new DashboardApiError("Unable to load dashboard settings.", 500),
			);
		}
		finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const updateSettings = useCallback(
		async (input: UpdateDashboardSettingsInput) => {
			try {
				setSaving(true);
				setError(null);
				const nextSettings = await requestDashboardApi<DashboardSettings>(
					"/dashboard/settings",
					{
						method: "PATCH",
						body: JSON.stringify(input),
					},
				);
				setSettings(nextSettings);
				return nextSettings;
			}
			catch (nextError) {
				setError(
					nextError instanceof DashboardApiError
						? nextError
						: new DashboardApiError("Unable to update dashboard settings.", 500),
				);
				return null;
			}
			finally {
				setSaving(false);
			}
		},
		[],
	);

	return { error, loading, refresh, saving, settings, updateSettings };
}
