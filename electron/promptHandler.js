const { limitContentLength } = require('./utils');

/**
 * Handles the 'get-mcp-prompt' IPC event.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object.
 * @param {string} promptName - The name of the prompt to get.
 * @param {object} promptArguments - Arguments to pass to the prompt.
 * @param {string} serverId - The server ID that provides the prompt.
 * @param {object} mcpClients - Object mapping server IDs to active MCP client instances.
 * @param {object} settings - The current application settings.
 * @returns {Promise<object>} - A promise resolving to the prompt content or error.
 */
async function handleGetPrompt(event, promptName, promptArguments, serverId, mcpClients, settings) {
  console.log(`Handling get-mcp-prompt for: ${promptName} from server: ${serverId}`);

  // Basic validation
  if (!promptName || typeof promptName !== 'string') {
    console.error('Invalid prompt name:', promptName);
    return { error: "Invalid prompt name provided." };
  }

  if (!serverId || typeof serverId !== 'string') {
    console.error('Invalid server ID:', serverId);
    return { error: "Invalid server ID provided." };
  }

  try {
    // Find the specific client instance that provides this prompt
    const client = mcpClients[serverId];
    if (!client) {
      console.error(`MCP Client instance not found for server ID: ${serverId}`);
      return {
        error: `The server providing the prompt (ID: ${serverId}) is not currently connected.`
      };
    }

    // Get the prompt via the MCP client
    console.log(`Getting prompt "${promptName}" from server ${serverId} with args:`, promptArguments);
    try {
      const result = await client.getPrompt({
        name: promptName,
        arguments: promptArguments || {}
      });

      console.log(`Prompt "${promptName}" retrieved successfully.`);

      // Process the prompt messages
      let messages = [];
      if (result?.messages && Array.isArray(result.messages)) {
        messages = result.messages.map(message => {
          // Handle different content types in messages
          let content;
          if (typeof message.content === 'string') {
            content = message.content;
          } else if (Array.isArray(message.content)) {
            // Handle multi-part content
            content = message.content.map(part => {
              if (part.type === 'text') {
                return part.text || '';
              } else if (part.type === 'image') {
                return `[Image: ${part.source?.data ? 'embedded' : part.source?.url || 'unknown'}]`;
              } else if (part.type === 'resource') {
                return `[Resource: ${part.resource?.uri || 'unknown'}]`;
              } else {
                return JSON.stringify(part);
              }
            }).join('\n');
          } else {
            content = JSON.stringify(message.content);
          }

          return {
            role: message.role || 'user',
            content: limitContentLength(content, settings.toolOutputLimit || 50000)
          };
        });
      }

      return {
        name: promptName,
        messages: messages,
        serverId: serverId,
        description: result.description
      };
    } catch (getError) {
      console.error(`Error getting prompt "${promptName}": ${getError.message}`);
      if (getError.stack) {
        console.error(getError.stack);
      }
      return {
        error: limitContentLength(`Error getting prompt "${promptName}": ${getError.message}`, settings.toolOutputLimit || 50000)
      };
    }

  } catch (handlerError) {
    console.error(`Unexpected error in handleGetPrompt for "${promptName}":`, handlerError);
    return {
      error: limitContentLength(`Internal error while getting prompt "${promptName}": ${handlerError.message}`)
    };
  }
}

/**
 * Gets prompt suggestions based on the current context.
 *
 * @param {object} context - The current conversation context.
 * @param {Array} discoveredPrompts - List of available prompts.
 * @returns {Array} - List of suggested prompts.
 */
function getPromptSuggestions(context, discoveredPrompts) {
  console.log('Getting prompt suggestions based on context...');
  
  // Simple keyword-based suggestion algorithm
  // This can be enhanced with more sophisticated matching
  const suggestions = [];
  const lastMessage = context.messages?.[context.messages.length - 1]?.content?.toLowerCase() || '';
  
  for (const prompt of discoveredPrompts) {
    let score = 0;
    
    // Check if prompt name or description matches keywords in last message
    const promptText = `${prompt.name} ${prompt.description}`.toLowerCase();
    const keywords = lastMessage.split(/\s+/).filter(word => word.length > 3);
    
    for (const keyword of keywords) {
      if (promptText.includes(keyword)) {
        score += 1;
      }
    }
    
    if (score > 0) {
      suggestions.push({ ...prompt, score });
    }
  }
  
  // Sort by score and return top 5
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score, ...prompt }) => prompt);
}

/**
 * Validates prompt arguments against the prompt's argument schema.
 *
 * @param {object} promptSchema - The prompt's argument schema.
 * @param {object} providedArguments - The arguments provided by the user.
 * @returns {object} - Validation result with any errors.
 */
function validatePromptArguments(promptSchema, providedArguments) {
  const errors = [];
  const validated = {};
  
  if (!promptSchema || !Array.isArray(promptSchema)) {
    return { valid: true, arguments: providedArguments || {} };
  }
  
  for (const arg of promptSchema) {
    const { name, required, description } = arg;
    const value = providedArguments?.[name];
    
    if (required && (value === undefined || value === null || value === '')) {
      errors.push(`Required argument "${name}" is missing. ${description || ''}`);
    } else if (value !== undefined) {
      validated[name] = value;
    }
  }
  
  // Include any extra arguments not in schema
  if (providedArguments) {
    for (const [key, value] of Object.entries(providedArguments)) {
      if (!(key in validated)) {
        validated[key] = value;
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    arguments: validated
  };
}

/**
 * Cache for prompt templates
 */
const promptCache = new Map();
const PROMPT_CACHE_TTL = 300000; // 5 minutes TTL

/**
 * Gets a prompt from cache or fetches it if not cached.
 *
 * @param {string} promptName - The prompt name.
 * @param {object} promptArguments - Prompt arguments.
 * @param {string} serverId - The server ID.
 * @param {object} mcpClients - MCP clients object.
 * @param {object} settings - Application settings.
 * @returns {Promise<object>} - The prompt content.
 */
async function getCachedPrompt(promptName, promptArguments, serverId, mcpClients, settings) {
  // Cache key includes arguments hash for dynamic prompts
  const argHash = JSON.stringify(promptArguments || {});
  const cacheKey = `${serverId}:${promptName}:${argHash}`;
  const cached = promptCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL) {
    console.log(`Returning cached prompt: ${promptName}`);
    return cached.data;
  }

  const result = await handleGetPrompt(null, promptName, promptArguments, serverId, mcpClients, settings);
  
  if (!result.error) {
    promptCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
  }

  return result;
}

/**
 * Clears the prompt cache.
 */
function clearPromptCache() {
  promptCache.clear();
  console.log('Prompt cache cleared');
}

module.exports = {
  handleGetPrompt,
  getPromptSuggestions,
  validatePromptArguments,
  getCachedPrompt,
  clearPromptCache
};