"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSeedOnce = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../../database"));
const tableName_1 = require("../../utils/tableName");
const TABLE_NAME = (0, tableName_1.withTablePrefix)("seed_history");
const ensureSeedTable = async () => {
    await database_1.default.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        seed_key VARCHAR(120) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
};
const runSeedOnce = async (seedKey, run) => {
    await ensureSeedTable();
    const exists = await database_1.default.query(`SELECT id FROM ${TABLE_NAME} WHERE seed_key = :seedKey LIMIT 1`, {
        replacements: { seedKey },
        type: sequelize_1.QueryTypes.SELECT,
    });
    if (exists.length > 0) {
        return;
    }
    await run();
    await database_1.default.query(`INSERT INTO ${TABLE_NAME} (seed_key) VALUES (:seedKey)`, {
        replacements: { seedKey },
        type: sequelize_1.QueryTypes.INSERT,
    });
};
exports.runSeedOnce = runSeedOnce;
