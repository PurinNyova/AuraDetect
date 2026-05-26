"use client";

import type {
	DashboardHistoryFilters,
	DashboardSavedView,
} from "./dashboard-api";

import { useCallback, useEffect, useState } from "react";
import {
	DashboardApiError,
	requestDashboardApi,
} from "./dashboard-api";

type SavedViewInput = {
	filters: DashboardHistoryFilters;
	isDefault?: boolean;
	name: string;
};

type UseDashboardSavedViewsResult = {
	createSavedView: (input: SavedViewInput) => Promise<DashboardSavedView>;
	error: DashboardApiError | null;
	loading: boolean;
	refresh: () => Promise<void>;
	removeSavedView: (savedViewId: number) => Promise<void>;
	savedViews: DashboardSavedView[];
	updateSavedView: (
		savedViewId: number,
		input: Partial<SavedViewInput>,
	) => Promise<DashboardSavedView>;
};

export function useDashboardSavedViews(): UseDashboardSavedViewsResult {
	const [savedViews, setSavedViews] = useState<DashboardSavedView[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<DashboardApiError | null>(null);

	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await requestDashboardApi<{ items: DashboardSavedView[] }>(
				"/dashboard/history/saved-views",
			);
			setSavedViews(response.items);
		}
		catch (nextError) {
			setError(
				nextError instanceof DashboardApiError
					? nextError
					: new DashboardApiError("Unable to load saved views.", 500),
			);
		}
		finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const createSavedView = useCallback(
		async (input: SavedViewInput) => {
			const response = await requestDashboardApi<DashboardSavedView>(
				"/dashboard/history/saved-views",
				{
					method: "POST",
					body: JSON.stringify(input),
				},
			);
			setSavedViews(current => [response, ...current]);
			return response;
		},
		[],
	);

	const updateSavedView = useCallback(
		async (savedViewId: number, input: Partial<SavedViewInput>) => {
			const response = await requestDashboardApi<DashboardSavedView>(
				`/dashboard/history/saved-views/${savedViewId}`,
				{
					method: "PATCH",
					body: JSON.stringify(input),
				},
			);
			setSavedViews(current =>
				current.map(savedView => (savedView.id === savedViewId ? response : savedView)),
			);
			return response;
		},
		[],
	);

	const removeSavedView = useCallback(async (savedViewId: number) => {
		await requestDashboardApi<{ success: boolean }>(
			`/dashboard/history/saved-views/${savedViewId}`,
			{
				method: "DELETE",
			},
		);
		setSavedViews(current => current.filter(savedView => savedView.id !== savedViewId));
	}, []);

	return {
		createSavedView,
		error,
		loading,
		refresh,
		removeSavedView,
		savedViews,
		updateSavedView,
	};
}
