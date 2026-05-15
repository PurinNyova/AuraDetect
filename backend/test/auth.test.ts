import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { initializeDatabase, sequelize } from "../src/db.js";

describe("POST /api/v1/auth/register", () => {
  beforeEach(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
  });

  it("registers a new user and starts a session", async () => {
    const agent = request.agent(app);

    const response = await agent
      .post("/api/v1/auth/register")
      .set("Accept", "application/json")
      .send({
        email: "demo@example.com",
        name: "Demo User",
        password: "strong-pass-123",
      })
      .expect("Content-Type", /json/)
      .expect(201);

    expect(response.body).toEqual({
      message: "Registered successfully.",
      user: {
        email: "demo@example.com",
        id: 1,
        name: "Demo User",
      },
    });

    await agent
      .post("/api/v1/auth/logout")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200, {
        message: "Logged out successfully.",
      });
  });

  it("rejects invalid credentials during login", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: "demo@example.com",
        name: "Demo User",
        password: "strong-pass-123",
      })
      .expect(201);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Accept", "application/json")
      .send({
        email: "demo@example.com",
        password: "wrong-pass-123",
      })
      .expect("Content-Type", /json/)
      .expect(401);

    expect(response.body.message).toBe("Invalid email or password.");
    expect(response.body.stack).toEqual(expect.any(String));
  });

  it("logs in an existing user", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: "demo@example.com",
        name: "Demo User",
        password: "strong-pass-123",
      })
      .expect(201);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Accept", "application/json")
      .send({
        email: "demo@example.com",
        password: "strong-pass-123",
      })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body).toEqual({
      message: "Logged in successfully.",
      user: {
        email: "demo@example.com",
        id: 1,
        name: "Demo User",
      },
    });
  });
});