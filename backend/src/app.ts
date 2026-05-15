import cors from "cors";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import morgan from "morgan";

import type MessageResponse from "./interfaces/message-response.js";

import api from "./api/index.js";
import { ensureDatabaseReady } from "./db.js";
import * as middlewares from "./middlewares.js";
import { env } from "./env.js";

const app = express();

app.use(morgan("dev"));
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  },
  name: "auradetect.sid",
  resave: false,
  saveUninitialized: false,
  secret: env.SESSION_SECRET,
}));

app.get<object, MessageResponse>("/", (req, res) => {
  res.json({
    message: "🦄🌈✨👋🌎🌍🌏✨🌈🦄",
  });
});

app.use("/api/v1", ensureDatabaseReady, api);

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

export default app;
