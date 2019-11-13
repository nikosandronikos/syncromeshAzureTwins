const pino      = require('pino');
//const fs        = require('fs');

const log        = pino({level: process.env.LOG_LEVEL || 'info'});

module.exports = {log};
