// plugins/db.js
const fp = require("fastify-plugin");
const fastifyMysql = require("fastify-mysql");
const config = require("../configs/index");

async function dbConnector(fastify, options) {
  fastify.register(fastifyMysql, {
    promise: true,
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  });
}

module.exports = fp(dbConnector);
