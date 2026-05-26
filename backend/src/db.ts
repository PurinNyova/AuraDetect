import type { NextFunction, Request, Response } from "express";

import { DataTypes, Sequelize } from "sequelize";

import { env } from "./env.js";
import { initializeDashboardModels } from "./models/dashboard.js";
import { initializeUserModel } from "./models/user.js";

const storage = env.NODE_ENV === "test" ? ":memory:" : env.DB_STORAGE;

export const sequelize = new Sequelize({
  dialect: "sqlite",
  logging: false,
  storage,
});

let initializePromise: Promise<void> | undefined;

async function ensureUsersTableCompatibility() {
  const queryInterface = sequelize.getQueryInterface();

  const table = await queryInterface.describeTable("users");

  if ("createdAt" in table && !("created_at" in table)) {
    await queryInterface.renameColumn("users", "createdAt", "created_at");
  }

  if ("updatedAt" in table && !("updated_at" in table)) {
    await queryInterface.renameColumn("users", "updatedAt", "updated_at");
  }

  if ("lastLoginAt" in table && !("last_login_at" in table)) {
    await queryInterface.renameColumn("users", "lastLoginAt", "last_login_at");
  }

  const refreshedTable = await queryInterface.describeTable("users");

  if (!("last_login_at" in refreshedTable) && !("lastLoginAt" in refreshedTable)) {
    await queryInterface.addColumn("users", "last_login_at", {
      allowNull: true,
      type: DataTypes.DATE,
    });
  }
}

export function initializeDatabase() {
  if (!sequelize.models.User) {
    initializeUserModel(sequelize);
    initializeDashboardModels(sequelize);
  }

  if (!initializePromise) {
    initializePromise = sequelize.authenticate()
      .then(async () => sequelize.sync())
      .then(async () => ensureUsersTableCompatibility())
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
