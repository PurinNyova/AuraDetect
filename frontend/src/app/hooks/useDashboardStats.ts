"use client";

import type { DashboardStats } from "./dashboard-api";

import { useCallback, useEffect, useState } from "react";
import { DashboardApiError, requestDashboardApi } from "./dashboard-api";

type UseDashboardStatsResult = {
	error: DashboardApiError | null;
	loading: boolean;
	refresh: () => Promise<void>;
	stats: DashboardStats | null;
};

export function useDashboardStats(): UseDashboardStatsResult {
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<DashboardApiError | null>(null);

	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const nextStats = await requestDashboardApi<DashboardStats>("/dashboard/stats");
			setStats(nextStats);
		}
		catch (nextError) {
			setError(
				nextError instanceof DashboardApiError
					? nextError
					: new DashboardApiError("Unable to load dashboard stats.", 500),
			);
		}
		finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return { error, loading, refresh, stats };
}
