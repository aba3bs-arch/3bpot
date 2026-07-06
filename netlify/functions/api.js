const serverless = require('serverless-http');
const app = require('../../backend/app');

exports.handler = serverless(app);
