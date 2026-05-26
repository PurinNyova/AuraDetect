import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute, Sequelize } from "sequelize";

import {

  DataTypes,

  Model,

} from "sequelize";

import { User } from "./user.js";

export type DashboardSource = "direct_upload" | "api_import" | "bulk_upload";
export type DashboardVerdict = "likely_ai_generated" | "likely_authentic";
export type NotificationType = "high_risk_scan";

export class UserDashboardSetting extends Model<InferAttributes<UserDashboardSetting>, InferCreationAttributes<UserDashboardSetting>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare highRiskAlertsEnabled: CreationOptional<boolean>;
  declare keepOriginalsForAudits: CreationOptional<boolean>;
  declare retentionHours: CreationOptional<number>;
  declare alertThresholdPercent: CreationOptional<number>;
  declare privacyModeEnabled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Scan extends Model<InferAttributes<Scan>, InferCreationAttributes<Scan>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare originalFilename: string;
  declare mimeType: string;
  declare fileSizeBytes: number;
  declare imageUrl: string | null;
  declare source: DashboardSource;
  declare predictedLabel: string;
  declare verdict: DashboardVerdict;
  declare confidence: number;
  declare scannedAt: CreationOptional<Date>;
  declare expiresAt: Date | null;
  declare deletedAt: Date | null;
  declare scores?: NonAttribute<ScanScore[]>;
}

export class ScanScore extends Model<InferAttributes<ScanScore>, InferCreationAttributes<ScanScore>> {
  declare id: CreationOptional<number>;
  declare scanId: number;
  declare label: string;
  declare score: number;
}

export class SavedView extends Model<InferAttributes<SavedView>, InferCreationAttributes<SavedView>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare name: string;
  declare isDefault: CreationOptional<boolean>;
  declare filtersJson: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Notification extends Model<InferAttributes<Notification>, InferCreationAttributes<Notification>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare type: NotificationType;
  declare relatedScanId: number | null;
  declare payloadJson: string;
  declare isRead: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare readAt: Date | null;
}

export function initializeDashboardModels(sequelize: Sequelize) {
  UserDashboardSetting.init({
    alertThresholdPercent: {
      allowNull: false,
      defaultValue: 85,
      field: "alert_threshold_percent",
      type: DataTypes.INTEGER,
      validate: {
        max: 100,
        min: 1,
      },
    },
    createdAt: {
      allowNull: false,
      field: "created_at",
      type: DataTypes.DATE,
    },
    highRiskAlertsEnabled: {
      allowNull: false,
      defaultValue: true,
      field: "high_risk_alerts_enabled",
      type: DataTypes.BOOLEAN,
    },
    id: {
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    keepOriginalsForAudits: {
      allowNull: false,
      defaultValue: false,
      field: "keep_originals_for_audits",
      type: DataTypes.BOOLEAN,
    },
    privacyModeEnabled: {
      allowNull: false,
      defaultValue: true,
      field: "privacy_mode_enabled",
      type: DataTypes.BOOLEAN,
    },
    retentionHours: {
      allowNull: false,
      defaultValue: 24,
      field: "retention_hours",
      type: DataTypes.INTEGER,
      validate: {
        min: 1,
      },
    },
    updatedAt: {
      allowNull: false,
      field: "updated_at",
      type: DataTypes.DATE,
    },
    userId: {
      allowNull: false,
      field: "user_id",
      type: DataTypes.INTEGER,
      unique: true,
    },
  }, {
    modelName: "UserDashboardSetting",
    sequelize,
    tableName: "user_dashboard_settings",
  });

  Scan.init({
    confidence: {
      allowNull: false,
      type: DataTypes.REAL,
      validate: {
        max: 1,
        min: 0,
      },
    },
    deletedAt: {
      allowNull: true,
      field: "deleted_at",
      type: DataTypes.DATE,
    },
    expiresAt: {
      allowNull: true,
      field: "expires_at",
      type: DataTypes.DATE,
    },
    fileSizeBytes: {
      allowNull: false,
      field: "file_size_bytes",
      type: DataTypes.INTEGER,
    },
    id: {
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    imageUrl: {
      allowNull: true,
      field: "image_url",
      type: DataTypes.TEXT,
    },
    mimeType: {
      allowNull: false,
      field: "mime_type",
      type: DataTypes.TEXT,
    },
    originalFilename: {
      allowNull: false,
      field: "original_filename",
      type: DataTypes.TEXT,
    },
    predictedLabel: {
      allowNull: false,
      field: "predicted_label",
      type: DataTypes.TEXT,
    },
    scannedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "scanned_at",
      type: DataTypes.DATE,
    },
    source: {
      allowNull: false,
      type: DataTypes.TEXT,
      validate: {
        isIn: [["direct_upload", "api_import", "bulk_upload"]],
      },
    },
    userId: {
      allowNull: false,
      field: "user_id",
      type: DataTypes.INTEGER,
    },
    verdict: {
      allowNull: false,
      type: DataTypes.TEXT,
      validate: {
        isIn: [["likely_ai_generated", "likely_authentic"]],
      },
    },
  }, {
    createdAt: false,
    indexes: [
      { fields: ["user_id", "scanned_at"] },
      { fields: ["verdict", "scanned_at"] },
      { fields: ["expires_at"] },
    ],
    modelName: "Scan",
    sequelize,
    tableName: "scans",
    updatedAt: false,
  });

  ScanScore.init({
    id: {
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    label: {
      allowNull: false,
      type: DataTypes.TEXT,
    },
    scanId: {
      allowNull: false,
      field: "scan_id",
      type: DataTypes.INTEGER,
    },
    score: {
      allowNull: false,
      type: DataTypes.REAL,
      validate: {
        max: 1,
        min: 0,
      },
    },
  }, {
    indexes: [
      { fields: ["scan_id", "label"], unique: true },
      { fields: ["label"] },
    ],
    modelName: "ScanScore",
    sequelize,
    tableName: "scan_scores",
    timestamps: false,
  });

  SavedView.init({
    createdAt: {
      allowNull: false,
      field: "created_at",
      type: DataTypes.DATE,
    },
    filtersJson: {
      allowNull: false,
      field: "filters_json",
      type: DataTypes.TEXT,
    },
    id: {
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    isDefault: {
      allowNull: false,
      defaultValue: false,
      field: "is_default",
      type: DataTypes.BOOLEAN,
    },
    name: {
      allowNull: false,
      type: DataTypes.TEXT,
    },
    updatedAt: {
      allowNull: false,
      field: "updated_at",
      type: DataTypes.DATE,
    },
    userId: {
      allowNull: false,
      field: "user_id",
      type: DataTypes.INTEGER,
    },
  }, {
    indexes: [
      { fields: ["user_id"] },
      { fields: ["user_id", "name"], unique: true },
    ],
    modelName: "SavedView",
    sequelize,
    tableName: "saved_views",
  });

  Notification.init({
    createdAt: {
      allowNull: false,
      field: "created_at",
      type: DataTypes.DATE,
    },
    id: {
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    isRead: {
      allowNull: false,
      defaultValue: false,
      field: "is_read",
      type: DataTypes.BOOLEAN,
    },
    payloadJson: {
      allowNull: false,
      field: "payload_json",
      type: DataTypes.TEXT,
    },
    readAt: {
      allowNull: true,
      field: "read_at",
      type: DataTypes.DATE,
    },
    relatedScanId: {
      allowNull: true,
      field: "related_scan_id",
      type: DataTypes.INTEGER,
    },
    type: {
      allowNull: false,
      type: DataTypes.TEXT,
      validate: {
        isIn: [["high_risk_scan"]],
      },
    },
    userId: {
      allowNull: false,
      field: "user_id",
      type: DataTypes.INTEGER,
    },
  }, {
    indexes: [
      { fields: ["user_id", "is_read", "created_at"] },
    ],
    modelName: "Notification",
    sequelize,
    tableName: "notifications",
    updatedAt: false,
  });

  User.hasOne(UserDashboardSetting, { foreignKey: "userId" });
  UserDashboardSetting.belongsTo(User, { foreignKey: "userId" });

  User.hasMany(Scan, { foreignKey: "userId" });
  Scan.belongsTo(User, { foreignKey: "userId" });
  Scan.hasMany(ScanScore, { as: "scores", foreignKey: "scanId", onDelete: "CASCADE" });
  ScanScore.belongsTo(Scan, { foreignKey: "scanId" });

  User.hasMany(SavedView, { foreignKey: "userId" });
  SavedView.belongsTo(User, { foreignKey: "userId" });

  User.hasMany(Notification, { foreignKey: "userId" });
  Notification.belongsTo(User, { foreignKey: "userId" });
  Scan.hasMany(Notification, { foreignKey: "relatedScanId" });
  Notification.belongsTo(Scan, { foreignKey: "relatedScanId" });
}
