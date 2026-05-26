export type DashboardVerdict = "likely_ai_generated" | "likely_authentic";

export type DashboardSource = "direct_upload" | "api_import" | "bulk_upload";

export type DashboardScanScore = {
	label: string;
	score: number;
};

export type DashboardHistoryFilters = {
	verdicts?: DashboardVerdict[];
	sources?: DashboardSource[];
	minConfidence?: number;
	maxConfidence?: number;
	from?: string;
	to?: string;
	query?: string;
	savedViewId?: number;
	page?: number;
	pageSize?: number;
};

export type DashboardStats = {
	weeklyScans: number;
	weeklyScanDelta: number;
	likelyAiCount: number;
	avgConfidence: number;
	highRiskNotificationCount: number;
};

export type DashboardHistorySummary = {
	totalScans: number;
	likelyAiCount: number;
	likelyAuthenticCount: number;
	avgConfidence: number;
};

export type DashboardHistoryItem = {
	id: number;
	originalFilename: string;
	mimeType: string;
	fileSizeBytes: number;
	imageUrl: string | null;
	source: DashboardSource;
	predictedLabel: string;
	verdict: DashboardVerdict;
	confidence: number;
	scannedAt: string;
	expiresAt: string | null;
	deletedAt: string | null;
	scores: DashboardScanScore[];
};

export type DashboardHistoryResponse = {
	items: DashboardHistoryItem[];
	total: number;
	page: number;
	pageSize: number;
	summary: DashboardHistorySummary;
	appliedFilters: DashboardHistoryFilters;
};

export type DashboardSavedView = {
	id: number;
	name: string;
	isDefault: boolean;
	filters: DashboardHistoryFilters;
	createdAt: string;
	updatedAt: string;
};

export type DashboardSettings = {
	id: number;
	highRiskAlertsEnabled: boolean;
	keepOriginalsForAudits: boolean;
	retentionHours: number;
	alertThresholdPercent: number;
	privacyModeEnabled: boolean;
	updatedAt: string;
};

export type DashboardNotificationPayload = {
	title: string;
	message: string;
	confidence?: number;
	verdict?: DashboardVerdict;
};

export type DashboardNotification = {
	id: number;
	type: "high_risk_scan";
	relatedScanId: number | null;
	payload: DashboardNotificationPayload;
	isRead: boolean;
	createdAt: string;
	readAt: string | null;
};

export type DashboardNotificationsResponse = {
	items: DashboardNotification[];
	unreadCount: number;
};

export type SaveDashboardInput = {
	originalFilename: string;
	mimeType: string;
	fileSizeBytes: number;
	imageDataUrl?: string;
	source: DashboardSource;
	predictedLabel: string;
	verdict: DashboardVerdict;
	confidence: number;
	scores: DashboardScanScore[];
	scannedAt?: string;
};

export type SaveDashboardResponse = {
	scan: DashboardHistoryItem;
	notification: DashboardNotification | null;
};

type PrimitiveQueryValue = boolean | number | string;

export class DashboardApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "DashboardApiError";
		this.status = status;
	}
}

export function buildDashboardQuery(
	params: Record<string, PrimitiveQueryValue | PrimitiveQueryValue[] | undefined>,
) {
	const searchParams = new URLSearchParams();

	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === "") {
			return;
		}

		if (Array.isArray(value)) {
			value.forEach((entry) => {
				searchParams.append(key, String(entry));
			});
			return;
		}

		searchParams.set(key, String(value));
	});

	const query = searchParams.toString();
	return query ? `?${query}` : "";
}

export async function requestDashboardApi<T>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(`/api${path}`, {
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
				?? (payload?.error as string | undefined)
				?? "Dashboard request failed.";

		throw new DashboardApiError(message, response.status);
	}

	return payload as T;
}

export function mapScanResponseToSaveInput(input: {
	confidence: number;
	file: File;
	predictedLabel: string;
	scores: Record<string, number>;
	verdict: string;
	imageDataUrl?: string;
}): SaveDashboardInput {
	return {
		originalFilename: input.file.name,
		mimeType: input.file.type,
		fileSizeBytes: input.file.size,
		imageDataUrl: input.imageDataUrl,
		source: "direct_upload",
		predictedLabel: input.predictedLabel,
		verdict:
			input.verdict.trim().toLowerCase() === "real"
				? "likely_authentic"
				: "likely_ai_generated",
		confidence: input.confidence,
		scores: Object.entries(input.scores).map(([label, score]) => ({
			label,
			score,
		})),
	};
}

export function formatDashboardVerdict(verdict: DashboardVerdict) {
	return verdict === "likely_ai_generated"
		? "Likely AI-generated"
		: "Likely authentic";
}

export function formatDashboardSource(source: DashboardSource) {
	if (source === "api_import") {
		return "API import";
	}

	if (source === "bulk_upload") {
		return "Bulk upload";
	}

	return "Direct upload";
}
