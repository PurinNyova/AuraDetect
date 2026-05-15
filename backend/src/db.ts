import type { NextFunction, Request, Response } from "express";

import { Sequelize } from "sequelize";

import { env } from "./env.js";
import { initializeUserModel } from "./models/user.js";

const storage = env.NODE_ENV === "test" ? ":memory:" : env.DB_STORAGE;

export const sequelize = new Sequelize({
  dialect: "sqlite",
  logging: false,
  storage,
});

let initializePromise: Promise<void> | undefined;

export function initializeDatabase() {
  if (!sequelize.models.User) {
    initializeUserModel(sequelize);
  }

  if (!initializePromise) {
    initializePromise = sequelize.authenticate()
      .then(async () => sequelize.sync())
      .then(() => undefined);
  }

  return initializePromise;
}

export async function ensureDatabaseReady(_req: Request, _res: Response, next: NextFunction) {
  try {
    await initializeDatabase();
    next();
  }
  catch (error) {
    next(error);
  }
}