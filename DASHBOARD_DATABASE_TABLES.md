# AuraDetect Dashboard: Required Database Tables

This document defines the database tables needed to fully implement the current dashboard feature set in the frontend:

- Overview stats (weekly scans, likely AI count, avg confidence)
- History feed (verdict, confidence, source, timestamps)
- History filters and saved views
- Save scan result from /scan into dashboard
- Settings (alert threshold, retention)
- Privacy mode and retention behavior
- High-risk notifications

## 1) users (existing, extend as needed)

Purpose: account identity for all dashboard data.

Columns:

- id INTEGER PRIMARY KEY
- email TEXT UNIQUE NOT NULL
- name TEXT NOT NULL
- password_hash TEXT NOT NULL
- created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- last_login_at DATETIME NULL

Notes:

- You already have this table in backend Sequelize model.

## 2) user_dashboard_settings

Purpose: store settings from /dashboard/settings page.

Columns:

- id INTEGER PRIMARY KEY
- user_id INTEGER NOT NULL REFERENCES users(id)
- high_risk_alerts_enabled BOOLEAN NOT NULL DEFAULT 1
- keep_originals_for_audits BOOLEAN NOT NULL DEFAULT 0
- retention_hours INTEGER NOT NULL DEFAULT 24
- alert_threshold_percent INTEGER NOT NULL DEFAULT 85
- privacy_mode_enabled BOOLEAN NOT NULL DEFAULT 1
- created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

Constraints:

- CHECK(retention_hours >= 1)
- CHECK(alert_threshold_percent >= 1 AND alert_threshold_percent <= 100)

Indexes:

- UNIQUE(user_id)

## 3) scans

Purpose: one row per uploaded image scan, used by dashboard overview and history.

Columns:

- id INTEGER PRIMARY KEY
- user_id INTEGER NOT NULL REFERENCES users(id)
- original_filename TEXT NOT NULL
- mime_type TEXT NOT NULL
- file_size_bytes INTEGER NOT NULL
- image_url TEXT NOT NULL
- source TEXT NOT NULL CHECK (source IN ('direct_upload', 'api_import', 'bulk_upload'))
- predicted_label TEXT NOT NULL
- verdict TEXT NOT NULL CHECK (verdict IN ('likely_ai_generated', 'likely_authentic'))
- confidence REAL NOT NULL
- scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- expires_at DATETIME NULL
- deleted_at DATETIME NULL

Constraints:

- CHECK(confidence >= 0 AND confidence <= 1)

Indexes:

- INDEX(user_id, scanned_at DESC)
- INDEX(verdict, scanned_at DESC)
- INDEX(expires_at)

## 4) scan_scores

Purpose: store class probabilities (AI/Real and future classes).

Columns:

- id INTEGER PRIMARY KEY
- scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE
- label TEXT NOT NULL
- score REAL NOT NULL

Constraints:

- CHECK(score >= 0 AND score <= 1)

Indexes:

- UNIQUE(scan_id, label)
- INDEX(label)

## 5) saved_views

Purpose: history "saved filters" for quick switching.

Columns:

- id INTEGER PRIMARY KEY
- user_id INTEGER NOT NULL REFERENCES users(id)
- name TEXT NOT NULL
- is_default BOOLEAN NOT NULL DEFAULT 0
- filters_json TEXT NOT NULL
- created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

Notes:

- filters_json stores structured filter state, for example verdicts, source list, confidence range, and date range.

Indexes:

- INDEX(user_id)
- UNIQUE(user_id, name)

## 6) notifications

Purpose: high-risk alert records and read/unread state.

Columns:

- id INTEGER PRIMARY KEY
- user_id INTEGER NOT NULL REFERENCES users(id)
- type TEXT NOT NULL CHECK (type IN ('high_risk_scan'))
- related_scan_id INTEGER NULL REFERENCES scans(id)
- payload_json TEXT NOT NULL
- is_read BOOLEAN NOT NULL DEFAULT 0
- created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- read_at DATETIME NULL

Indexes:

- INDEX(user_id, is_read, created_at DESC)

## Data flow mapping to UI features

- Save To Dashboard button on /scan:
  1. insert scans
  2. insert scan_scores
  3. if confidence \* 100 >= alert_threshold_percent and high-risk alerts enabled, insert notifications(type='high_risk_scan')

- Dashboard overview cards:
  - Scans this week: count(scans where scanned_at in current week)
  - Likely AI results: count(scans where verdict='likely_ai_generated')
  - Average confidence: avg(scans.confidence)

- History page list:
  - primary data from scans
  - source from scans.source

- History filters and saved views:
  - query scans with filter predicates
  - persist presets in saved_views

- Settings page:
  - read/update user_dashboard_settings

## Suggested implementation order

1. Add tables: scans, scan_scores
2. Add settings and history support: user_dashboard_settings, saved_views
3. Add alerts: notifications

## Frontend API contract

The frontend dashboard hooks now expect authenticated JSON routes under `/api/...`.
Use camelCase in the HTTP contract even if the database uses snake_case internally.

### 1) GET /api/dashboard/stats

Purpose: populate the overview cards on `/dashboard`.

Response:

```json
{
	"weeklyScans": 18,
	"weeklyScanDelta": 5,
	"likelyAiCount": 6,
	"avgConfidence": 0.91,
	"highRiskNotificationCount": 2
}
```

### 2) GET /api/dashboard/history

Purpose: history feed, history stats, and the overview page preview list.

Query params:

- `page` number, default `1`
- `pageSize` number, default `25`
- `verdict` repeated param, values: `likely_ai_generated`, `likely_authentic`
- `source` repeated param, values: `direct_upload`, `api_import`, `bulk_upload`
- `minConfidence` decimal between `0` and `1`
- `maxConfidence` decimal between `0` and `1`
- `from` ISO datetime
- `to` ISO datetime
- `query` text search on filename
- `savedViewId` integer shortcut to a persisted filter preset

Response:

```json
{
	"items": [
		{
			"id": 101,
			"originalFilename": "portrait-session-04.png",
			"mimeType": "image/png",
			"fileSizeBytes": 451221,
			"imageUrl": "https://cdn.example.com/scans/101.png",
			"source": "direct_upload",
			"predictedLabel": "Ai",
			"verdict": "likely_ai_generated",
			"confidence": 0.96,
			"scannedAt": "2026-05-26T08:44:00.000Z",
			"expiresAt": "2026-05-27T08:44:00.000Z",
			"deletedAt": null,
			"scores": [
				{ "label": "Ai", "score": 0.96 },
				{ "label": "Real", "score": 0.04 }
			]
		}
	],
	"total": 124,
	"page": 1,
	"pageSize": 25,
	"summary": {
		"totalScans": 124,
		"likelyAiCount": 19,
		"likelyAuthenticCount": 81,
		"avgConfidence": 0.74
	},
	"appliedFilters": {
		"verdicts": ["likely_ai_generated"],
		"sources": ["direct_upload"],
		"minConfidence": 0.85,
		"page": 1,
		"pageSize": 25
	}
}
```

### 3) GET /api/dashboard/history/saved-views

Purpose: load saved filter presets for the history page.

Response:

```json
{
	"items": [
		{
			"id": 7,
			"name": "Likely AI, direct uploads",
			"isDefault": false,
			"filters": {
				"verdicts": ["likely_ai_generated"],
				"sources": ["direct_upload"],
				"minConfidence": 0.85,
				"page": 1,
				"pageSize": 25
			},
			"createdAt": "2026-05-26T08:00:00.000Z",
			"updatedAt": "2026-05-26T08:00:00.000Z"
		}
	]
}
```

### 4) POST /api/dashboard/history/saved-views

Purpose: create a saved history view from the current filters.

Request:

```json
{
	"name": "Likely AI, direct uploads",
	"isDefault": false,
	"filters": {
		"verdicts": ["likely_ai_generated"],
		"sources": ["direct_upload"],
		"minConfidence": 0.85,
		"page": 1,
		"pageSize": 25
	}
}
```

Response: saved view object, same shape as items in `GET /api/dashboard/history/saved-views`.

### 5) PATCH /api/dashboard/history/saved-views/:id

Purpose: rename or update a saved filter preset.

Request:

```json
{
	"name": "High-confidence AI",
	"isDefault": true,
	"filters": {
		"verdicts": ["likely_ai_generated"],
		"minConfidence": 0.9,
		"page": 1,
		"pageSize": 25
	}
}
```

Response: updated saved view object.

### 6) DELETE /api/dashboard/history/saved-views/:id

Purpose: remove a saved view.

Response:

```json
{ "success": true }
```

### 7) GET /api/dashboard/settings

Purpose: load settings for `/dashboard/settings` and overview previews.

Response:

```json
{
	"id": 1,
	"highRiskAlertsEnabled": true,
	"keepOriginalsForAudits": false,
	"retentionHours": 24,
	"alertThresholdPercent": 85,
	"privacyModeEnabled": true,
	"updatedAt": "2026-05-26T08:12:00.000Z"
}
```

### 8) PATCH /api/dashboard/settings

Purpose: update one or more dashboard settings.

Request:

```json
{
	"highRiskAlertsEnabled": true,
	"keepOriginalsForAudits": false,
	"retentionHours": 72,
	"alertThresholdPercent": 95,
	"privacyModeEnabled": true
}
```

Response: full updated settings object, same shape as `GET /api/dashboard/settings`.

### 9) POST /api/dashboard/scans

Purpose: save a scan result from `/scan` into the dashboard.

Request:

```json
{
	"originalFilename": "portrait-session-04.png",
	"mimeType": "image/png",
	"fileSizeBytes": 451221,
	"imageDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
	"source": "direct_upload",
	"predictedLabel": "Ai",
	"verdict": "likely_ai_generated",
	"confidence": 0.96,
	"scores": [
		{ "label": "Ai", "score": 0.96 },
		{ "label": "Real", "score": 0.04 }
	]
}
```

Notes:

- `imageDataUrl` is optional if the backend already has an upload token or can derive storage from the scan pipeline. If omitted, backend should still save the scan and may return `imageUrl: null`.
- Backend should store the image if provided and return the resolved `imageUrl` in the response.
- Backend should evaluate settings and create a notification when `confidence * 100 >= alertThresholdPercent` and `highRiskAlertsEnabled = true`.

Response:

```json
{
	"scan": {
		"id": 101,
		"originalFilename": "portrait-session-04.png",
		"mimeType": "image/png",
		"fileSizeBytes": 451221,
		"imageUrl": "https://cdn.example.com/scans/101.png",
		"source": "direct_upload",
		"predictedLabel": "Ai",
		"verdict": "likely_ai_generated",
		"confidence": 0.96,
		"scannedAt": "2026-05-26T08:44:00.000Z",
		"expiresAt": "2026-05-27T08:44:00.000Z",
		"deletedAt": null,
		"scores": [
			{ "label": "Ai", "score": 0.96 },
			{ "label": "Real", "score": 0.04 }
		]
	},
	"notification": {
		"id": 88,
		"type": "high_risk_scan",
		"relatedScanId": 101,
		"payload": {
			"title": "High-risk scan detected",
			"message": "portrait-session-04.png crossed your 85% alert threshold.",
			"confidence": 0.96,
			"verdict": "likely_ai_generated"
		},
		"isRead": false,
		"createdAt": "2026-05-26T08:44:01.000Z",
		"readAt": null
	}
}
```

### 10) GET /api/dashboard/notifications

Purpose: show recent high-risk alerts on the overview and settings pages.

Query params:

- `pageSize` number, default `20`
- `unreadOnly` boolean

Response:

```json
{
	"items": [
		{
			"id": 88,
			"type": "high_risk_scan",
			"relatedScanId": 101,
			"payload": {
				"title": "High-risk scan detected",
				"message": "portrait-session-04.png crossed your 85% alert threshold.",
				"confidence": 0.96,
				"verdict": "likely_ai_generated"
			},
			"isRead": false,
			"createdAt": "2026-05-26T08:44:01.000Z",
			"readAt": null
		}
	],
	"unreadCount": 3
}
```

### 11) POST /api/dashboard/notifications/:id/read

Purpose: mark a single notification as read.

Response: updated notification object.

### 12) POST /api/dashboard/notifications/read-all

Purpose: mark all notifications as read.

Response:

```json
{
	"items": [],
	"unreadCount": 0
}
```

### Error shape

All endpoints should return a non-2xx response with this shape when possible:

```json
{
	"message": "Human readable error message"
}
```

## Optional but useful additions

- Add an audit_log table for compliance-sensitive actions (settings updates, high-risk alert events).
- Add soft-delete strategy for scans for restore workflows.
- Add a background job table if you want generic async processing for periodic cleanup and notifications.
