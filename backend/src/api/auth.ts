import { compare, hash } from "bcryptjs";
import express from "express";
import { z } from "zod/v4";

import { User } from "../models/user.js";

const router = express.Router();

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(100),
});

function serializeUser(user: User) {
  return {
    email: user.email,
    id: user.id,
    name: user.name,
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const email = payload.email.toLowerCase();
    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      res.status(409);
      throw new Error("A user with that email already exists.");
    }

    const user = await User.create({
      email,
      name: payload.name,
      passwordHash: await hash(payload.password, 12),
    });

    req.session.userId = user.id;

    res.status(201).json({
      message: "Registered successfully.",
      user: serializeUser(user),
    });
  }
  catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const payload = credentialsSchema.parse(req.body);
    const email = payload.email.toLowerCase();
    const user = await User.findOne({ where: { email } });

    if (!user || !(await compare(payload.password, user.passwordHash))) {
      res.status(401);
      throw new Error("Invalid email or password.");
    }

    await user.update({ lastLoginAt: new Date() });

    req.session.userId = user.id;

    res.json({
      message: "Logged in successfully.",
      user: serializeUser(user),
    });
  }
  catch (error) {
    next(error);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }

    res.clearCookie("auradetect.sid");
    res.json({
      message: "Logged out successfully.",
    });
  });
});

export default router;
