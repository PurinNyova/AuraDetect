"use client";

import type {
	DashboardNotification,
	DashboardNotificationsResponse,
} from "./dashboard-api";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buildDashboardQuery,
	DashboardApiError,
	requestDashboardApi,
} from "./dashboard-api";

type NotificationsQuery = {
	pageSize?: number;
	unreadOnly?: boolean;
};

type UseDashboardNotificationsResult = {
	error: DashboardApiError | null;
	loading: boolean;
	markAllAsRead: () => Promise<void>;
	markAsRead: (notificationId: number) => Promise<DashboardNotification>;
	notifications: DashboardNotification[];
	refresh: () => Promise<void>;
	unreadCount: number;
};

export function useDashboardNotifications(
	query: NotificationsQuery = {},
): UseDashboardNotificationsResult {
	const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<DashboardApiError | null>(null);

	const queryString = useMemo(
		() => buildDashboardQuery({ pageSize: query.pageSize, unreadOnly: query.unreadOnly }),
		[query.pageSize, query.unreadOnly],
	);

	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await requestDashboardApi<DashboardNotificationsResponse>(
				`/dashboard/notifications${queryString}`,
			);
			setNotifications(response.items);
			setUnreadCount(response.unreadCount);
		}
		catch (nextError) {
			setError(
				nextError instanceof DashboardApiError
					? nextError
					: new DashboardApiError("Unable to load dashboard notifications.", 500),
			);
		}
		finally {
			setLoading(false);
		}
	}, [queryString]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const markAsRead = useCallback(async (notificationId: number) => {
		const response = await requestDashboardApi<DashboardNotification>(
			`/dashboard/notifications/${notificationId}/read`,
			{
				method: "POST",
			},
		);
		setNotifications(current =>
			current.map(item => (item.id === notificationId ? response : item)),
		);
		setUnreadCount(current => Math.max(0, current - 1));
		return response;
	}, []);

	const markAllAsRead = useCallback(async () => {
		const response = await requestDashboardApi<DashboardNotificationsResponse>(
			"/dashboard/notifications/read-all",
			{
				method: "POST",
			},
		);
		setNotifications(response.items);
		setUnreadCount(response.unreadCount);
	}, []);

	return {
		error,
		loading,
		markAllAsRead,
		markAsRead,
		notifications,
		refresh,
		unreadCount,
	};
}
