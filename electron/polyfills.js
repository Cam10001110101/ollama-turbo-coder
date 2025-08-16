// Polyfills for Electron main process
// This file ensures all required modules are available in the packaged app

// Ensure fetch is available globally
if (!global.fetch) {
    try {
        global.fetch = require('node-fetch');
        global.Headers = global.fetch.Headers;
        global.Request = global.fetch.Request;
        global.Response = global.fetch.Response;
    } catch (e) {
        console.warn('node-fetch not available, using native fetch if available');
    }
}

// Ensure whatwg-fetch is available as fallback
try {
    require('whatwg-fetch');
} catch (e) {
    // Ignore if not available
}

// Ensure ajv is available
try {
    require('ajv');
} catch (e) {
    console.warn('ajv not available');
}

module.exports = {};