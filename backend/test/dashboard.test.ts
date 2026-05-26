import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { initializeDatabase, sequelize } from "../src/db.js";

async function createAuthenticatedAgent() {
  const agent = request.agent(app);

  await agent
    .post("/api/v1/auth/register")
    .send({
      email: "demo@example.com",
      name: "Demo User",
      password: "strong-pass-123",
    })
    .expect(201);

  return agent;
}

const scanPayload = {
  confidence: 0.96,
  fileSizeBytes: 451221,
  imageDataUrl: "data:image/png;base64,abc123",
  mimeType: "image/png",
  originalFilename: "portrait-session-04.png",
  predictedLabel: "Ai",
  scannedAt: "2026-05-26T08:44:00.000Z",
  scores: [
    { label: "Ai", score: 0.96 },
    { label: "Real", score: 0.04 },
  ],
  source: "direct_upload",
  verdict: "likely_ai_generated",
};

describe("dashboard API", () => {
  beforeEach(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
  });

  it("requires authentication", async () => {
    const response = await request(app)
      .get("/dashboard/settings")
      .expect("Content-Type", /json/)
      .expect(401);

    expect(response.body.message).toBe("Authentication required.");
  });

  it("loads and updates dashboard settings", async () => {
    const agent = await createAuthenticatedAgent();

    const defaults = await agent
      .get("/dashboard/settings")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(defaults.body).toMatchObject({
      alertThresholdPercent: 85,
      highRiskAlertsEnabled: true,
      keepOriginalsForAudits: false,
      privacyModeEnabled: true,
      retentionHours: 24,
    });

    const updated = await agent
      .patch("/dashboard/settings")
      .send({
        alertThresholdPercent: 95,
        retentionHours: 72,
      })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(updated.body).toMatchObject({
      alertThresholdPercent: 95,
      retentionHours: 72,
    });
  });

  it("saves scans with scores and creates high-risk notifications", async () => {
    const agent = await createAuthenticatedAgent();

    const response = await agent
      .post("/dashboard/scans")
      .send(scanPayload)
      .expect("Content-Type", /json/)
      .expect(201);

    expect(response.body.scan).toMatchObject({
      confidence: 0.96,
      fileSizeBytes: 451221,
      imageUrl: "data:image/png;base64,abc123",
      originalFilename: "portrait-session-04.png",
      scores: [
        { label: "Ai", score: 0.96 },
        { label: "Real", score: 0.04 },
      ],
      source: "direct_upload",
      verdict: "likely_ai_generated",
    });
    expect(response.body.scan.expiresAt).toBe("2026-05-27T08:44:00.000Z");
    expect(response.body.notification).toMatchObject({
      isRead: false,
      payload: {
        confidence: 0.96,
        title: "High-risk scan detected",
        verdict: "likely_ai_generated",
      },
      relatedScanId: response.body.scan.id,
      type: "high_risk_scan",
    });
  });

  it("returns history with filters, summary, and stats", async () => {
    const agent = await createAuthenticatedAgent();

    await agent.post("/dashboard/scans").send(scanPayload).expect(201);
    await agent.post("/dashboard/scans").send({
      ...scanPayload,
      confidence: 0.64,
      originalFilename: "landscape-real.jpg",
      scores: [
        { label: "Ai", score: 0.36 },
        { label: "Real", score: 0.64 },
      ],
      verdict: "likely_authentic",
    }).expect(201);

    const history = await agent
      .get("/dashboard/history")
      .query({
        minConfidence: 0.9,
        verdict: "likely_ai_generated",
      })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(history.body).toMatchObject({
      appliedFilters: {
        minConfidence: 0.9,
        page: 1,
        pageSize: 25,
        verdicts: ["likely_ai_generated"],
      },
      page: 1,
      pageSize: 25,
      summary: {
        likelyAiCount: 1,
        likelyAuthenticCount: 0,
        totalScans: 1,
      },
      total: 1,
    });
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].originalFilename).toBe("portrait-session-04.png");

    const stats = await agent
      .get("/dashboard/stats")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(stats.body).toMatchObject({
      highRiskNotificationCount: 1,
      likelyAiCount: 1,
    });
  });

  it("manages saved views", async () => {
    const agent = await createAuthenticatedAgent();

    const created = await agent
      .post("/dashboard/history/saved-views")
      .send({
        filters: {
          minConfidence: 0.85,
          page: 1,
          pageSize: 25,
          verdicts: ["likely_ai_generated"],
        },
        isDefault: true,
        name: "Likely AI",
      })
      .expect("Content-Type", /json/)
      .expect(201);

    expect(created.body).toMatchObject({
      filters: {
        minConfidence: 0.85,
        page: 1,
        pageSize: 25,
        verdicts: ["likely_ai_generated"],
      },
      isDefault: true,
      name: "Likely AI",
    });

    const updated = await agent
      .patch(`/dashboard/history/saved-views/${created.body.id}`)
      .send({ name: "High-confidence AI" })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(updated.body.name).toBe("High-confidence AI");

    const list = await agent
      .get("/dashboard/history/saved-views")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].name).toBe("High-confidence AI");

    await agent
      .delete(`/dashboard/history/saved-views/${created.body.id}`)
      .expect("Content-Type", /json/)
      .expect(200, { success: true });
  });

  it("lists and marks notifications as read", async () => {
    const agent = await createAuthenticatedAgent();
    const scan = await agent.post("/dashboard/scans").send(scanPayload).expect(201);

    const list = await agent
      .get("/dashboard/notifications")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(list.body).toMatchObject({
      unreadCount: 1,
    });
    expect(list.body.items).toHaveLength(1);

    const read = await agent
      .post(`/dashboard/notifications/${scan.body.notification.id}/read`)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(read.body.isRead).toBe(true);
    expect(read.body.readAt).toEqual(expect.any(String));

    await agent.post("/dashboard/scans").send({
      ...scanPayload,
      originalFilename: "another-ai.png",
    }).expect(201);

    const readAll = await agent
      .post("/dashboard/notifications/read-all")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(readAll.body).toEqual({
      items: [],
      unreadCount: 0,
    });
  });
});
