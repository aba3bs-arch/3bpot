process.env.NETLIFY = 'true';

const { connectLambda } = require('@netlify/blobs');
const serverless = require('serverless-http');
const app = require('../../backend/app');

const expressHandler = serverless(app, {
    binary: false,
});

/**
 * serverless-http runs in Lambda compatibility mode, so Blobs needs
 * connectLambda(event) or getStore() has no credentials and writes fail
 * (sucursales/cajeros → "No se pudo guardar").
 */
exports.handler = async (event, context) => {
    try {
        connectLambda(event);
    } catch (e) {
        console.error('[blobs] connectLambda failed:', e && e.message ? e.message : e);
    }
    return expressHandler(event, context);
};
