const { limitContentLength } = require('./utils');

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

  // Basic validation
  if (!uri || typeof uri !== 'string') {
    console.error('Invalid resource URI:', uri);
    return { error: "Invalid resource URI provided." };
  }

  if (!serverId || typeof serverId !== 'string') {
    console.error('Invalid server ID:', serverId);
    return { error: "Invalid server ID provided." };
  }

  try {
    // Find the specific client instance that provides this resource
    const client = mcpClients[serverId];
    if (!client) {
      console.error(`MCP Client instance not found for server ID: ${serverId}`);
      return {
        error: `The server providing the resource (ID: ${serverId}) is not currently connected.`
      };
    }

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
          
          // Handle different content types
          if (content.text !== undefined) {
            contentString = content.text;
          } else if (content.blob !== undefined) {
            // Handle binary content as base64
            contentString = `[Binary content: ${content.blob.length} bytes]`;
          } else {
            contentString = JSON.stringify(content);
          }

          return {
            type: content.type || 'text',
            text: limitContentLength(contentString, settings.toolOutputLimit || 50000),
            mimeType: content.mimeType
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
      return {
        error: limitContentLength(`Error reading resource "${uri}": ${readError.message}`, settings.toolOutputLimit || 50000)
      };
    }

  } catch (handlerError) {
    console.error(`Unexpected error in handleReadResource for "${uri}":`, handlerError);
    return {
      error: limitContentLength(`Internal error while reading resource "${uri}": ${handlerError.message}`)
    };
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
        new Promise((_, reject) => setTimeout(() => reject(new Error('listResources timed out')), 5000))
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
const CACHE_TTL = 60000; // 1 minute TTL

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
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
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
  clearResourceCache
};