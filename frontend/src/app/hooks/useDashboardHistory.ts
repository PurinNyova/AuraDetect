"use client";

import type {
	DashboardHistoryFilters,
	DashboardHistoryResponse,
} from "./dashboard-api";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buildDashboardQuery,
	DashboardApiError,
	requestDashboardApi,
} from "./dashboard-api";

type UseDashboardHistoryResult = {
	error: DashboardApiError | null;
	history: DashboardHistoryResponse | null;
	loading: boolean;
	refresh: () => Promise<void>;
};

export function useDashboardHistory(
	filters: DashboardHistoryFilters = {},
): UseDashboardHistoryResult {
	const [history, setHistory] = useState<DashboardHistoryResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<DashboardApiError | null>(null);

	const query = useMemo(
		() =>
			buildDashboardQuery({
				verdict: filters.verdicts,
				source: filters.sources,
				minConfidence: filters.minConfidence,
				maxConfidence: filters.maxConfidence,
				from: filters.from,
				to: filters.to,
				query: filters.query,
				savedViewId: filters.savedViewId,
				page: filters.page,
				pageSize: filters.pageSize,
			}),
		[filters],
	);

	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const nextHistory = await requestDashboardApi<DashboardHistoryResponse>(
				`/dashboard/history${query}`,
			);
			setHistory(nextHistory);
		}
		catch (nextError) {
			setError(
				nextError instanceof DashboardApiError
					? nextError
					: new DashboardApiError("Unable to load dashboard history.", 500),
			);
		}
		finally {
			setLoading(false);
		}
	}, [query]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return { error, history, loading, refresh };
}
