/**
 * Handler for MCP Elicitations
 * Manages bidirectional communication with MCP servers for elicitations
 */

const { dialog } = require('electron');

// Store pending elicitations
const pendingElicitations = new Map();

/**
 * Initialize elicitation handlers for an MCP client
 */
function setupElicitationHandlers(client, serverId, mainWindow) {
  if (!client || !client.on) {
    console.error(`[ElicitationHandler] Invalid client for server ${serverId}`);
    return;
  }

  // Handle elicitation requests from the server
  client.on('elicitation', async (elicitation) => {
    console.log(`[ElicitationHandler] Received elicitation from ${serverId}:`, elicitation);
    
    try {
      const response = await handleElicitation(elicitation, serverId, mainWindow);
      
      // Send response back to the server
      if (client.respondToElicitation) {
        await client.respondToElicitation(elicitation.id, response);
      } else {
        console.error(`[ElicitationHandler] Client doesn't support respondToElicitation`);
      }
    } catch (error) {
      console.error(`[ElicitationHandler] Error handling elicitation:`, error);
      // Send error response if possible
      if (client.respondToElicitation) {
        await client.respondToElicitation(elicitation.id, {
          error: error.message
        });
      }
    }
  });
}

/**
 * Handle an elicitation request from the server
 */
async function handleElicitation(elicitation, serverId, mainWindow) {
  const { id, type, title, description, options } = elicitation;
  
  // Store the elicitation
  pendingElicitations.set(id, {
    ...elicitation,
    serverId,
    timestamp: Date.now()
  });
  
  // Send to renderer for UI handling
  if (mainWindow && !mainWindow.isDestroyed()) {
    return new Promise((resolve, reject) => {
      // Send elicitation to renderer
      mainWindow.webContents.send('mcp-elicitation-request', {
        id,
        serverId,
        type,
        title,
        description,
        options
      });
      
      // Set up one-time listener for response
      const responseChannel = `mcp-elicitation-response-${id}`;
      const timeoutId = setTimeout(() => {
        pendingElicitations.delete(id);
        reject(new Error('Elicitation response timeout'));
      }, 60000); // 60 second timeout
      
      mainWindow.webContents.once(responseChannel, (event, response) => {
        clearTimeout(timeoutId);
        pendingElicitations.delete(id);
        resolve(response);
      });
    });
  } else {
    // Fallback to system dialog if no main window
    return handleElicitationWithDialog(elicitation);
  }
}

/**
 * Handle elicitation using system dialog (fallback)
 */
async function handleElicitationWithDialog(elicitation) {
  const { type, title, description, options } = elicitation;
  
  switch (type) {
    case 'confirmation':
      const confirmResult = await dialog.showMessageBox({
        type: 'question',
        title: title || 'Confirmation Required',
        message: description || 'Please confirm this action',
        buttons: ['Yes', 'No'],
        defaultId: 0,
        cancelId: 1
      });
      return { confirmed: confirmResult.response === 0 };
      
    case 'input':
      // Note: Electron doesn't have a built-in input dialog
      // This would need a custom implementation or use the renderer
      console.warn('[ElicitationHandler] Input elicitation requires renderer');
      return { value: null, cancelled: true };
      
    case 'select':
      if (options && options.choices) {
        const selectResult = await dialog.showMessageBox({
          type: 'question',
          title: title || 'Select an Option',
          message: description || 'Please select an option',
          buttons: options.choices.map(c => c.label || c.value),
          defaultId: 0
        });
        const selected = options.choices[selectResult.response];
        return { value: selected.value };
      }
      return { value: null, cancelled: true };
      
    default:
      console.warn(`[ElicitationHandler] Unknown elicitation type: ${type}`);
      return { error: `Unknown elicitation type: ${type}` };
  }
}

/**
 * Get pending elicitations
 */
function getPendingElicitations() {
  return Array.from(pendingElicitations.values());
}

/**
 * Cancel a pending elicitation
 */
function cancelElicitation(elicitationId) {
  if (pendingElicitations.has(elicitationId)) {
    pendingElicitations.delete(elicitationId);
    return true;
  }
  return false;
}

/**
 * Clear old pending elicitations (cleanup)
 */
function clearOldElicitations(maxAge = 300000) { // 5 minutes default
  const now = Date.now();
  for (const [id, elicitation] of pendingElicitations.entries()) {
    if (now - elicitation.timestamp > maxAge) {
      pendingElicitations.delete(id);
    }
  }
}

// Periodic cleanup
setInterval(() => {
  clearOldElicitations();
}, 60000); // Clean up every minute

module.exports = {
  setupElicitationHandlers,
  handleElicitation,
  getPendingElicitations,
  cancelElicitation,
  clearOldElicitations
};