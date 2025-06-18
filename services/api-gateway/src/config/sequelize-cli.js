require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USERNAME || 'app_user',
    password: process.env.DB_PASSWORD || 'app_password',
    database: process.env.DB_DATABASE || 'real_estate',
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: {
      bigNumberStrings: true
    },
    define: {
      timestamps: true,
      underscored: true
    },
    seederStorage: 'sequelize',
    migrationStorage: 'sequelize',
    migrationStorageTableName: 'sequelize_meta',
    seederStorageTableName: 'sequelize_data'
  },
  test: {
    username: process.env.DB_USERNAME || 'app_user',
    password: process.env.DB_PASSWORD || 'app_password',
    database: process.env.DB_DATABASE_TEST || 'real_estate_test',
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: {
      bigNumberStrings: true
    },
    define: {
      timestamps: true,
      underscored: true
    },
    logging: false,
    seederStorage: 'sequelize',
    migrationStorage: 'sequelize'
  },
  production: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    dialectOptions: {
      bigNumberStrings: true,
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    define: {
      timestamps: true,
      underscored: true
    },
    logging: false,
    seederStorage: 'sequelize',
    migrationStorage: 'sequelize'
  }
};