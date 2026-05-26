import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from "sequelize";

import {

  DataTypes,

  Model,

} from "sequelize";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare name: string;
  declare passwordHash: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastLoginAt: Date | null;
}

export function initializeUserModel(sequelize: Sequelize) {
  User.init({
    email: {
      allowNull: false,
      type: DataTypes.STRING,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    id: {
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    createdAt: {
      allowNull: false,
      field: "created_at",
      type: DataTypes.DATE,
    },
    lastLoginAt: {
      allowNull: true,
      field: "last_login_at",
      type: DataTypes.DATE,
    },
    name: {
      allowNull: false,
      type: DataTypes.STRING,
    },
    passwordHash: {
      allowNull: false,
      type: DataTypes.STRING,
    },
    updatedAt: {
      allowNull: false,
      field: "updated_at",
      type: DataTypes.DATE,
    },
  }, {
    modelName: "User",
    sequelize,
    tableName: "users",
  });

  return User;
}
