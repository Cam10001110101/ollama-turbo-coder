const { 
  limitContentLength, 
  MCP_CONFIG, 
  ERROR_MESSAGES, 
  validateStringParam, 
  validateServerConnection,
  createErrorResponse,
  detectMimeType,
  handleClientDisconnection,
  isClientDisconnectionError 
} = require('./utils');

/**
 * Handles the 'read-mcp-resource' IPC event.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object.
 * @param {string} uri - The resource URI to read.
 * @param {string} serverId - The server ID that provides the resource.
 * @param {object} mcpClients - Object mapping server IDs to active MCP client instances.
 * @param {object} settings - The current application settings.
 * @returns {Promise<object>} - A promise resolving to the resource content or error.
 */
async function handleReadResource(event, uri, serverId, mcpClients, settings) {
  console.log(`Handling read-mcp-resource for URI: ${uri} from server: ${serverId}`);

  // Validate URI
  const uriValidation = validateStringParam(uri, 'resource URI');
  if (!uriValidation.isValid) {
    console.error('Invalid resource URI:', uri);
    return createErrorResponse(ERROR_MESSAGES.INVALID_URI, settings);
  }

  // Validate server connection
  const serverValidation = validateServerConnection(serverId, mcpClients);
  if (!serverValidation.isValid) {
    console.error(`Server validation failed for ${serverId}:`, serverValidation.error);
    return createErrorResponse(serverValidation.error, settings);
  }
  
  const client = serverValidation.client;

  try {
    // Read the resource via the MCP client
    console.log(`Reading resource "${uri}" from server ${serverId}...`);
    try {
      const result = await client.readResource({
        uri: uri
      });

      console.log(`Resource "${uri}" read successfully. Content length: ${JSON.stringify(result?.contents)?.length}`);

      // Process the resource contents
      let resourceContents = [];
      if (result?.contents && Array.isArray(result.contents)) {
        resourceContents = result.contents.map(content => {
          let contentString;
          let detectedMimeType;
          
          // Handle different content types
          if (content.text !== undefined) {
            contentString = content.text;
            detectedMimeType = detectMimeType(uri, contentString, content.mimeType);
          } else if (content.blob !== undefined) {
            // Handle binary content with better MIME type detection
            const blobBuffer = Buffer.isBuffer(content.blob) ? content.blob : Buffer.from(content.blob, 'base64');
            detectedMimeType = detectMimeType(uri, blobBuffer, content.mimeType);
            contentString = `[Binary content: ${content.blob.length} bytes, type: ${detectedMimeType}]`;
          } else {
            contentString = JSON.stringify(content);
            detectedMimeType = 'application/json';
          }

          return {
            type: content.type || 'text',
            text: limitContentLength(contentString, settings.toolOutputLimit || MCP_CONFIG.LIMITS.DEFAULT_OUTPUT_LIMIT),
            mimeType: detectedMimeType || content.mimeType || 'text/plain'
          };
        });
      }

      return {
        uri: uri,
        contents: resourceContents,
        serverId: serverId
      };
    } catch (readError) {
      console.error(`Error reading resource "${uri}": ${readError.message}`);
      if (readError.stack) {
        console.error(readError.stack);
      }
      
      // Check for client disconnection
      if (isClientDisconnectionError(readError)) {
        return handleClientDisconnection(readError, serverId, 'read resource');
      }
      
      return createErrorResponse(
        `Error reading resource "${uri}": ${readError.message}`, 
        settings
      );
    }

  } catch (handlerError) {
    console.error(`Unexpected error in handleReadResource for "${uri}":`, handlerError);
    return createErrorResponse(
      `Internal error while reading resource "${uri}": ${handlerError.message}`,
      settings
    );
  }
}

/**
 * Refreshes the list of resources from all connected MCP servers.
 *
 * @param {object} mcpClients - Object mapping server IDs to active MCP client instances.
 * @returns {Promise<object>} - A promise resolving to the refreshed resources list.
 */
async function handleRefreshResources(mcpClients) {
  console.log('Refreshing resources from all connected servers...');
  
  const allResources = [];
  const errors = [];

  for (const [serverId, client] of Object.entries(mcpClients)) {
    try {
      console.log(`Refreshing resources from server ${serverId}...`);
      const resourcesResult = await Promise.race([
        client.listResources(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(ERROR_MESSAGES.OPERATION_TIMEOUT('listResources'))), 5000))
      ]);

      if (resourcesResult?.resources && Array.isArray(resourcesResult.resources)) {
        const serverResources = resourcesResult.resources.map(resource => ({
          uri: resource.uri || '',
          name: resource.name || 'unnamed_resource',
          description: resource.description || 'No description',
          mimeType: resource.mimeType,
          serverId: serverId
        }));
        allResources.push(...serverResources);
        console.log(`Found ${serverResources.length} resources from ${serverId}`);
      }
    } catch (error) {
      console.error(`Failed to refresh resources from ${serverId}:`, error.message);
      errors.push({ serverId, error: error.message });
    }
  }

  return {
    resources: allResources,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Cache for resource contents to avoid repeated fetches
 */
const resourceCache = new Map();

/**
 * Periodic cleanup for expired resource cache entries
 */
function setupResourceCacheCleanup() {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, cached] of resourceCache.entries()) {
      if (now - cached.timestamp > MCP_CONFIG.TIMEOUTS.RESOURCE_CACHE_TTL) {
        resourceCache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`Resource cache cleanup: removed ${removedCount} expired entries`);
    }
  }, MCP_CONFIG.TIMEOUTS.CACHE_CLEANUP_INTERVAL);
  
  // Return cleanup function to stop the interval if needed
  return () => clearInterval(cleanupInterval);
}

// Initialize cache cleanup on module load
const stopCacheCleanup = setupResourceCacheCleanup();

/**
 * Gets a resource from cache or fetches it if not cached.
 *
 * @param {string} uri - The resource URI.
 * @param {string} serverId - The server ID.
 * @param {object} mcpClients - MCP clients object.
 * @param {object} settings - Application settings.
 * @returns {Promise<object>} - The resource content.
 */
async function getCachedResource(uri, serverId, mcpClients, settings) {
  const cacheKey = `${serverId}:${uri}`;
  const cached = resourceCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < MCP_CONFIG.TIMEOUTS.RESOURCE_CACHE_TTL) {
    console.log(`Returning cached resource: ${uri}`);
    return cached.data;
  }

  const result = await handleReadResource(null, uri, serverId, mcpClients, settings);
  
  if (!result.error) {
    resourceCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
  }

  return result;
}

/**
 * Clears the resource cache.
 */
function clearResourceCache() {
  resourceCache.clear();
  console.log('Resource cache cleared');
}

module.exports = {
  handleReadResource,
  handleRefreshResources,
  getCachedResource,
  clearResourceCache,
  stopCacheCleanup
};