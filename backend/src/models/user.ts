import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare name: string;
  declare passwordHash: string;
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
    name: {
      allowNull: false,
      type: DataTypes.STRING,
    },
    passwordHash: {
      allowNull: false,
      type: DataTypes.STRING,
    },
  }, {
    modelName: "User",
    sequelize,
    tableName: "users",
  });

  return User;
}