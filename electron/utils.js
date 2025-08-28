const path = require('path');

/**
 * Limits the length of a string, adding an ellipsis if truncated.
 *
 * @param {string | null | undefined} content - The string content to limit.
 * @param {number} [maxLength=8000] - The maximum allowed length.
 * @returns {string} - The original string or the truncated string with ellipsis.
 */
function limitContentLength(content, maxLength = 8000) {
  // Return empty string if content is null, undefined, or already empty
  if (!content) {
    return '';
  }

  // Ensure content is a string before checking length
  const stringContent = String(content);

  if (stringContent.length <= maxLength) {
    return stringContent;
  }

  // Truncate and add indicator
  // Ensure maxLength is at least 3 to accommodate ellipsis
  const effectiveMaxLength = Math.max(maxLength, 3);
  return stringContent.substring(0, effectiveMaxLength - 3) + '...';
}

/**
 * Configuration constants for MCP operations
 */
const MCP_CONFIG = {
  TIMEOUTS: {
    ELICITATION_RESPONSE: 60000,
    RESOURCE_CACHE_TTL: 60000,
    PROMPT_CACHE_TTL: 300000,
    CACHE_CLEANUP_INTERVAL: 300000
  },
  LIMITS: {
    MAX_LOG_LINES: 500,
    DEFAULT_OUTPUT_LIMIT: 50000
  }
};

/**
 * Standard error messages for consistent error reporting
 */
const ERROR_MESSAGES = {
  INVALID_SERVER_ID: 'Invalid server ID provided',
  INVALID_URI: 'Invalid resource URI provided',
  INVALID_PROMPT_NAME: 'Invalid prompt name provided',
  SERVER_NOT_CONNECTED: (serverId) => `Server ${serverId} is not currently connected`,
  CONNECTION_FAILED: (serverId, reason) => `Failed to connect to server ${serverId}: ${reason}`,
  OPERATION_TIMEOUT: (operation) => `${operation} operation timed out`,
  CLIENT_DISCONNECTED: (serverId) => `Client for server ${serverId} disconnected during operation`
};

/**
 * Simple MIME type mappings based on file extensions
 */
const MIME_TYPES = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.xml': 'text/xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo'
};

/**
 * Validates basic string parameters
 * @param {string} value - The value to validate
 * @param {string} paramName - The parameter name for error messages
 * @returns {object} Validation result with isValid boolean and error message if invalid
 */
function validateStringParam(value, paramName) {
  if (!value || typeof value !== 'string') {
    return {
      isValid: false,
      error: `Invalid ${paramName} provided`
    };
  }
  return { isValid: true };
}

/**
 * Validates server connection
 * @param {string} serverId - The server ID
 * @param {object} mcpClients - The MCP clients object
 * @returns {object} Validation result with isValid boolean, client instance, or error message
 */
function validateServerConnection(serverId, mcpClients) {
  const serverValidation = validateStringParam(serverId, 'server ID');
  if (!serverValidation.isValid) {
    return serverValidation;
  }

  const client = mcpClients[serverId];
  if (!client) {
    return {
      isValid: false,
      error: ERROR_MESSAGES.SERVER_NOT_CONNECTED(serverId)
    };
  }

  return { isValid: true, client };
}

/**
 * Creates a standardized error response
 * @param {string} error - The error message
 * @param {object} settings - Application settings for content limiting
 * @returns {object} Standard error response object
 */
function createErrorResponse(error, settings = {}) {
  const limit = settings.toolOutputLimit || MCP_CONFIG.LIMITS.DEFAULT_OUTPUT_LIMIT;
  return {
    error: limitContentLength(error, limit)
  };
}

/**
 * Detects MIME type for binary content with better fallback handling
 * @param {string} uri - The resource URI
 * @param {Buffer|string} content - The content to analyze
 * @param {string} [hint] - Optional MIME type hint
 * @returns {string} The detected or fallback MIME type
 */
function detectMimeType(uri, content, hint) {
  // Use provided hint if valid
  if (hint && typeof hint === 'string' && hint.includes('/')) {
    return hint;
  }

  // Try to detect from URI extension
  const ext = path.extname(uri).toLowerCase();
  if (ext && MIME_TYPES[ext]) {
    return MIME_TYPES[ext];
  }

  // Analyze content if it's a buffer or binary string
  if (Buffer.isBuffer(content)) {
    // Check for common binary file signatures
    const signatures = {
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/gif': [0x47, 0x49, 0x46],
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
      'application/zip': [0x50, 0x4B, 0x03, 0x04]
    };

    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (content.length >= signature.length) {
        const matches = signature.every((byte, index) => content[index] === byte);
        if (matches) {
          return mimeType;
        }
      }
    }
    
    return 'application/octet-stream';
  }

  // Default fallback
  return 'text/plain';
}

/**
 * Handles client disconnection gracefully
 * @param {Error} error - The original error
 * @param {string} serverId - The server ID
 * @param {string} operation - The operation that was being performed
 * @returns {object} Error response for client disconnection
 */
function handleClientDisconnection(error, serverId, operation) {
  console.warn(`Client disconnected during ${operation} for server ${serverId}:`, error.message);
  return {
    error: ERROR_MESSAGES.CLIENT_DISCONNECTED(serverId),
    disconnected: true,
    serverId
  };
}

/**
 * Checks if an error indicates client disconnection
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error indicates client disconnection
 */
function isClientDisconnectionError(error) {
  const disconnectionIndicators = [
    'ECONNRESET',
    'EPIPE',
    'connection closed',
    'client disconnected',
    'transport closed'
  ];
  
  const errorMessage = (error.message || '').toLowerCase();
  return disconnectionIndicators.some(indicator => 
    errorMessage.includes(indicator.toLowerCase())
  );
}

module.exports = {
  limitContentLength,
  MCP_CONFIG,
  ERROR_MESSAGES,
  validateStringParam,
  validateServerConnection,
  createErrorResponse,
  detectMimeType,
  handleClientDisconnection,
  isClientDisconnectionError
};