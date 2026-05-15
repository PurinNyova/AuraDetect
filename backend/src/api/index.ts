import express from "express";

import type MessageResponse from "../interfaces/message-response.js";

import auth from "./auth.js";
import emojis from "./emojis.js";

const router = express.Router();

router.get<object, MessageResponse>("/", (req, res) => {
  res.json({
    message: "API - 👋🌎🌍🌏",
  });
});

router.use("/auth", auth);
router.use("/emojis", emojis);

export default router;
