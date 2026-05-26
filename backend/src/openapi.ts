const messageResponseSchema = {
  additionalProperties: false,
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
  type: "object",
} as const;

const errorResponseSchema = {
  additionalProperties: false,
  properties: {
    message: { type: "string" },
    stack: { type: "string" },
  },
  required: ["message", "stack"],
  type: "object",
} as const;

const userSchema = {
  additionalProperties: false,
  properties: {
    email: { format: "email", type: "string" },
    id: { type: "integer" },
    name: { type: "string" },
  },
  required: ["email", "id", "name"],
  type: "object",
} as const;

const scanScoreSchema = {
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    score: { maximum: 1, minimum: 0, type: "number" },
  },
  required: ["label", "score"],
  type: "object",
} as const;

const scanSchema = {
  additionalProperties: false,
  properties: {
    confidence: { maximum: 1, minimum: 0, type: "number" },
    deletedAt: { format: "date-time", nullable: true, type: "string" },
    expiresAt: { format: "date-time", nullable: true, type: "string" },
    fileSizeBytes: { minimum: 0, type: "integer" },
    id: { type: "integer" },
    imageUrl: { nullable: true, type: "string" },
    mimeType: { type: "string" },
    originalFilename: { type: "string" },
    predictedLabel: { type: "string" },
    scannedAt: { format: "date-time", nullable: true, type: "string" },
    scores: {
      items: { $ref: "#/components/schemas/ScanScore" },
      type: "array",
    },
    source: { $ref: "#/components/schemas/DashboardSource" },
    verdict: { $ref: "#/components/schemas/DashboardVerdict" },
  },
  required: ["confidence", "deletedAt", "expiresAt", "fileSizeBytes", "id", "imageUrl", "mimeType", "originalFilename", "predictedLabel", "scannedAt", "scores", "source", "verdict"],
  type: "object",
} as const;

const historyFilterProperties = {
  from: { format: "date-time", type: "string" },
  maxConfidence: { maximum: 1, minimum: 0, type: "number" },
  minConfidence: { maximum: 1, minimum: 0, type: "number" },
  page: { minimum: 1, type: "integer" },
  pageSize: { maximum: 100, minimum: 1, type: "integer" },
  query: { type: "string" },
  sources: {
    items: { $ref: "#/components/schemas/DashboardSource" },
    type: "array",
  },
  to: { format: "date-time", type: "string" },
  verdicts: {
    items: { $ref: "#/components/schemas/DashboardVerdict" },
    type: "array",
  },
} as const;

const savedViewSchema = {
  additionalProperties: false,
  properties: {
    createdAt: { format: "date-time", nullable: true, type: "string" },
    filters: {
      additionalProperties: false,
      properties: historyFilterProperties,
      type: "object",
    },
    id: { type: "integer" },
    isDefault: { type: "boolean" },
    name: { type: "string" },
    updatedAt: { format: "date-time", nullable: true, type: "string" },
  },
  required: ["createdAt", "filters", "id", "isDefault", "name", "updatedAt"],
  type: "object",
} as const;

const settingsSchema = {
  additionalProperties: false,
  properties: {
    alertThresholdPercent: { maximum: 100, minimum: 1, type: "integer" },
    highRiskAlertsEnabled: { type: "boolean" },
    id: { type: "integer" },
    keepOriginalsForAudits: { type: "boolean" },
    privacyModeEnabled: { type: "boolean" },
    retentionHours: { minimum: 1, type: "integer" },
    updatedAt: { format: "date-time", nullable: true, type: "string" },
  },
  required: ["alertThresholdPercent", "highRiskAlertsEnabled", "id", "keepOriginalsForAudits", "privacyModeEnabled", "retentionHours", "updatedAt"],
  type: "object",
} as const;

const notificationSchema = {
  additionalProperties: false,
  properties: {
    createdAt: { format: "date-time", nullable: true, type: "string" },
    id: { type: "integer" },
    isRead: { type: "boolean" },
    payload: { additionalProperties: true, type: "object" },
    readAt: { format: "date-time", nullable: true, type: "string" },
    relatedScanId: { nullable: true, type: "integer" },
    type: { type: "string" },
  },
  required: ["createdAt", "id", "isRead", "payload", "readAt", "relatedScanId", "type"],
  type: "object",
} as const;

const unauthorizedResponse = {
  description: "Authentication is required.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
} as const;

const validationErrorResponse = {
  description: "The request body or query parameters failed validation.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
} as const;

const notFoundResponse = {
  description: "The requested resource was not found.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
} as const;

function dashboardPaths(prefix: string) {
  return {
    [`${prefix}/history`]: {
      get: {
        description: "Returns paginated scan history and summary metrics for the authenticated user.",
        parameters: [
          { in: "query", name: "from", schema: { format: "date-time", type: "string" } },
          { in: "query", name: "to", schema: { format: "date-time", type: "string" } },
          { in: "query", name: "minConfidence", schema: { maximum: 1, minimum: 0, type: "number" } },
          { in: "query", name: "maxConfidence", schema: { maximum: 1, minimum: 0, type: "number" } },
          { in: "query", name: "page", schema: { default: 1, minimum: 1, type: "integer" } },
          { in: "query", name: "pageSize", schema: { default: 25, maximum: 100, minimum: 1, type: "integer" } },
          { in: "query", name: "query", schema: { type: "string" } },
          { in: "query", name: "savedViewId", schema: { minimum: 1, type: "integer" } },
          { in: "query", name: "source", schema: { $ref: "#/components/schemas/DashboardSource" } },
          { in: "query", name: "verdict", schema: { $ref: "#/components/schemas/DashboardVerdict" } },
        ],
        responses: {
          200: {
            description: "Scan history page.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HistoryResponse" },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
          404: notFoundResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "List scan history",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/history/saved-views`]: {
      get: {
        description: "Lists saved history filters for the authenticated user.",
        responses: {
          200: {
            description: "Saved views.",
            content: {
              "application/json": {
                schema: {
                  additionalProperties: false,
                  properties: {
                    items: { items: { $ref: "#/components/schemas/SavedView" }, type: "array" },
                  },
                  required: ["items"],
                  type: "object",
                },
              },
            },
          },
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "List saved views",
        tags: ["Dashboard"],
      },
      post: {
        description: "Creates a saved set of scan history filters.",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SavedViewInput" },
            },
          },
          required: true,
        },
        responses: {
          201: {
            description: "Created saved view.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SavedView" },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Create saved view",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/history/saved-views/{id}`]: {
      delete: {
        description: "Deletes one saved history filter by id.",
        parameters: [{ in: "path", name: "id", required: true, schema: { minimum: 1, type: "integer" } }],
        responses: {
          200: {
            description: "Delete result.",
            content: {
              "application/json": {
                schema: {
                  additionalProperties: false,
                  properties: { success: { type: "boolean" } },
                  required: ["success"],
                  type: "object",
                },
              },
            },
          },
          401: unauthorizedResponse,
          404: notFoundResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Delete saved view",
        tags: ["Dashboard"],
      },
      patch: {
        description: "Updates a saved history filter by id.",
        parameters: [{ in: "path", name: "id", required: true, schema: { minimum: 1, type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SavedViewUpdate" },
            },
          },
          required: true,
        },
        responses: {
          200: {
            description: "Updated saved view.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SavedView" },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
          404: notFoundResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Update saved view",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/notifications`]: {
      get: {
        description: "Returns recent dashboard notifications for the authenticated user.",
        parameters: [
          { in: "query", name: "pageSize", schema: { default: 20, maximum: 100, minimum: 1, type: "integer" } },
          { in: "query", name: "unreadOnly", schema: { default: false, type: "boolean" } },
        ],
        responses: {
          200: {
            description: "Notifications.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotificationsResponse" },
              },
            },
          },
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "List notifications",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/notifications/read-all`]: {
      post: {
        description: "Marks all unread notifications as read.",
        responses: {
          200: {
            description: "Empty notification list and zero unread count.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotificationsResponse" },
              },
            },
          },
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Mark all notifications read",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/notifications/{id}/read`]: {
      post: {
        description: "Marks a single notification as read.",
        parameters: [{ in: "path", name: "id", required: true, schema: { minimum: 1, type: "integer" } }],
        responses: {
          200: {
            description: "Updated notification.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Notification" },
              },
            },
          },
          401: unauthorizedResponse,
          404: notFoundResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Mark notification read",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/scans`]: {
      post: {
        description: "Persists a completed scan and may create a high-risk notification.",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ScanInput" },
            },
          },
          required: true,
        },
        responses: {
          201: {
            description: "Saved scan and optional notification.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateScanResponse" },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Save scan",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/settings`]: {
      get: {
        description: "Returns dashboard settings for the authenticated user, creating defaults when absent.",
        responses: {
          200: {
            description: "Dashboard settings.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardSettings" },
              },
            },
          },
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Get settings",
        tags: ["Dashboard"],
      },
      patch: {
        description: "Updates one or more dashboard settings.",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DashboardSettingsUpdate" },
            },
          },
          required: true,
        },
        responses: {
          200: {
            description: "Updated dashboard settings.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardSettings" },
              },
            },
          },
          400: validationErrorResponse,
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Update settings",
        tags: ["Dashboard"],
      },
    },
    [`${prefix}/stats`]: {
      get: {
        description: "Returns weekly scan counts, AI verdict counts, average confidence, and unread high-risk alert count.",
        responses: {
          200: {
            description: "Dashboard statistics.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardStats" },
              },
            },
          },
          401: unauthorizedResponse,
        },
        security: [{ sessionCookie: [] }],
        summary: "Get dashboard stats",
        tags: ["Dashboard"],
      },
    },
  };
}

export const openApiDocument = {
  components: {
    securitySchemes: {
      sessionCookie: {
        in: "cookie",
        name: "auradetect.sid",
        type: "apiKey",
      },
    },
    schemas: {
      AuthResponse: {
        additionalProperties: false,
        properties: {
          message: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
        required: ["message", "user"],
        type: "object",
      },
      CreateScanResponse: {
        additionalProperties: false,
        properties: {
          notification: {
            anyOf: [
              { $ref: "#/components/schemas/Notification" },
              { nullable: true, type: "object" },
            ],
          },
          scan: { $ref: "#/components/schemas/Scan" },
        },
        required: ["notification", "scan"],
        type: "object",
      },
      DashboardSettings: settingsSchema,
      DashboardSettingsUpdate: {
        additionalProperties: false,
        minProperties: 1,
        properties: settingsSchema.properties,
        type: "object",
      },
      DashboardSource: {
        enum: ["direct_upload", "api_import", "bulk_upload"],
        type: "string",
      },
      DashboardStats: {
        additionalProperties: false,
        properties: {
          avgConfidence: { maximum: 1, minimum: 0, type: "number" },
          highRiskNotificationCount: { minimum: 0, type: "integer" },
          likelyAiCount: { minimum: 0, type: "integer" },
          weeklyScanDelta: { type: "integer" },
          weeklyScans: { minimum: 0, type: "integer" },
        },
        required: ["avgConfidence", "highRiskNotificationCount", "likelyAiCount", "weeklyScanDelta", "weeklyScans"],
        type: "object",
      },
      DashboardVerdict: {
        enum: ["likely_ai_generated", "likely_authentic"],
        type: "string",
      },
      ErrorResponse: errorResponseSchema,
      HistoryFilters: {
        additionalProperties: false,
        properties: {
          ...historyFilterProperties,
          savedViewId: { minimum: 1, type: "integer" },
        },
        type: "object",
      },
      HistoryResponse: {
        additionalProperties: false,
        properties: {
          appliedFilters: { $ref: "#/components/schemas/HistoryFilters" },
          items: { items: { $ref: "#/components/schemas/Scan" }, type: "array" },
          page: { minimum: 1, type: "integer" },
          pageSize: { minimum: 1, type: "integer" },
          summary: {
            additionalProperties: false,
            properties: {
              avgConfidence: { maximum: 1, minimum: 0, type: "number" },
              likelyAiCount: { minimum: 0, type: "integer" },
              likelyAuthenticCount: { minimum: 0, type: "integer" },
              totalScans: { minimum: 0, type: "integer" },
            },
            required: ["avgConfidence", "likelyAiCount", "likelyAuthenticCount", "totalScans"],
            type: "object",
          },
          total: { minimum: 0, type: "integer" },
        },
        required: ["appliedFilters", "items", "page", "pageSize", "summary", "total"],
        type: "object",
      },
      MessageResponse: messageResponseSchema,
      Notification: notificationSchema,
      NotificationsResponse: {
        additionalProperties: false,
        properties: {
          items: { items: { $ref: "#/components/schemas/Notification" }, type: "array" },
          unreadCount: { minimum: 0, type: "integer" },
        },
        required: ["items", "unreadCount"],
        type: "object",
      },
      SavedView: savedViewSchema,
      SavedViewInput: {
        additionalProperties: false,
        properties: {
          filters: {
            additionalProperties: false,
            default: {},
            properties: historyFilterProperties,
            type: "object",
          },
          isDefault: { default: false, type: "boolean" },
          name: { maxLength: 100, minLength: 1, type: "string" },
        },
        required: ["name"],
        type: "object",
      },
      SavedViewUpdate: {
        additionalProperties: false,
        minProperties: 1,
        properties: {
          filters: {
            additionalProperties: false,
            properties: historyFilterProperties,
            type: "object",
          },
          isDefault: { type: "boolean" },
          name: { maxLength: 100, minLength: 1, type: "string" },
        },
        type: "object",
      },
      Scan: scanSchema,
      ScanInput: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          fileSizeBytes: { minimum: 0, type: "integer" },
          imageDataUrl: { type: "string" },
          mimeType: { type: "string" },
          originalFilename: { type: "string" },
          predictedLabel: { type: "string" },
          scannedAt: { format: "date-time", type: "string" },
          scores: { items: { $ref: "#/components/schemas/ScanScore" }, minItems: 1, type: "array" },
          source: { $ref: "#/components/schemas/DashboardSource" },
          verdict: { $ref: "#/components/schemas/DashboardVerdict" },
        },
        required: ["confidence", "fileSizeBytes", "mimeType", "originalFilename", "predictedLabel", "scores", "source", "verdict"],
        type: "object",
      },
      ScanScore: scanScoreSchema,
      User: userSchema,
    },
  },
  info: {
    description: "Backend API for AuraDetect authentication, scan history, dashboard settings, notifications, and utility endpoints.",
    title: "AuraDetect Backend API",
    version: "1.0.0",
  },
  openapi: "3.0.3",
  paths: {
    "/": {
      get: {
        description: "Returns a health-style welcome message from the backend service.",
        responses: {
          200: {
            description: "Welcome message.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
        },
        summary: "Backend root",
        tags: ["System"],
      },
    },
    "/api/v1": {
      get: {
        description: "Returns a welcome message for the versioned API root.",
        responses: {
          200: {
            description: "API welcome message.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
        },
        summary: "API root",
        tags: ["System"],
      },
    },
    "/api/v1/auth/login": {
      post: {
        description: "Authenticates a user and starts a cookie-backed session.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: false,
                properties: {
                  email: { format: "email", type: "string" },
                  password: { minLength: 8, type: "string" },
                },
                required: ["email", "password"],
                type: "object",
              },
            },
          },
          required: true,
        },
        responses: {
          200: {
            description: "Login succeeded.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          400: validationErrorResponse,
          401: {
            description: "The email or password is invalid.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
        summary: "Log in",
        tags: ["Auth"],
      },
    },
    "/api/v1/auth/logout": {
      post: {
        description: "Destroys the current session and clears the session cookie.",
        responses: {
          200: {
            description: "Logout succeeded.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
        },
        security: [{ sessionCookie: [] }],
        summary: "Log out",
        tags: ["Auth"],
      },
    },
    "/api/v1/auth/register": {
      post: {
        description: "Creates a user account and starts a cookie-backed session.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: false,
                properties: {
                  email: { format: "email", type: "string" },
                  name: { maxLength: 100, minLength: 1, type: "string" },
                  password: { minLength: 8, type: "string" },
                },
                required: ["email", "name", "password"],
                type: "object",
              },
            },
          },
          required: true,
        },
        responses: {
          201: {
            description: "Registration succeeded.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          400: validationErrorResponse,
          409: {
            description: "A user with the submitted email already exists.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
        summary: "Register",
        tags: ["Auth"],
      },
    },
    "/api/v1/emojis": {
      get: {
        description: "Returns the sample emoji list used by the starter API.",
        responses: {
          200: {
            description: "Emoji list.",
            content: {
              "application/json": {
                schema: { items: { type: "string" }, type: "array" },
              },
            },
          },
        },
        summary: "List emojis",
        tags: ["Utility"],
      },
    },
    "/docs": {
      get: {
        description: "Serves the interactive Swagger UI for this OpenAPI document.",
        responses: {
          200: { description: "Swagger UI HTML." },
        },
        summary: "Swagger UI",
        tags: ["Documentation"],
      },
    },
    "/docs/openapi.json": {
      get: {
        description: "Returns the OpenAPI 3.0 document used by Swagger UI.",
        responses: {
          200: {
            description: "OpenAPI document.",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
        summary: "OpenAPI JSON",
        tags: ["Documentation"],
      },
    },
    ...dashboardPaths("/api/v1/dashboard"),
    ...dashboardPaths("/api/dashboard"),
    ...dashboardPaths("/dashboard"),
  },
  servers: [
    {
      description: "Current backend origin",
      url: "/",
    },
  ],
  tags: [
    { description: "Service roots and health-style endpoints.", name: "System" },
    { description: "Interactive and machine-readable API documentation.", name: "Documentation" },
    { description: "Registration, login, logout, and session handling.", name: "Auth" },
    { description: "Scan history, settings, saved views, stats, and notifications.", name: "Dashboard" },
    { description: "Starter utility endpoints.", name: "Utility" },
  ],
} as const;
