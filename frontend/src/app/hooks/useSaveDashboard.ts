"use client";

import type {
	SaveDashboardInput,
	SaveDashboardResponse,
} from "./dashboard-api";

import { useState } from "react";
import {
	DashboardApiError,
	requestDashboardApi,
} from "./dashboard-api";

function useSaveDashboard() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<DashboardApiError | null>(null);
	const [savedScan, setSavedScan] = useState<SaveDashboardResponse | null>(null);

	const saveDashboard = async (payload: SaveDashboardInput) => {
		try {
			setLoading(true);
			setError(null);
			const response = await requestDashboardApi<SaveDashboardResponse>(
				"/dashboard/scans",
				{
					method: "POST",
					body: JSON.stringify(payload),
				},
			);
			setSavedScan(response);
			return response;
		}
		catch (err) {
			const nextError
				= err instanceof DashboardApiError
					? err
					: new DashboardApiError("Unable to save scan to the dashboard.", 500);
			setError(nextError);
			return null;
		}
		finally {
			setLoading(false);
		}
	};

	return { error, loading, saveDashboard, savedScan };
}

export default useSaveDashboard;
