const providerFactory = require('./providers/providerFactory');

// Legacy helper functions for backwards compatibility
function validateApiKey(settings) {
    // This is now handled by the provider
    if (settings.provider === 'ollama-turbo' && (!settings.OLLAMA_API_KEY || settings.OLLAMA_API_KEY === "<replace me>")) {
        throw new Error("API key not configured. Please add your Ollama API key in settings.");
    }
}

async function handleChatStream(event, messages, model, settings, modelContextSizes, discoveredTools) {
    try {
        // Get the appropriate provider based on settings
        const providerId = settings.provider || 'ollama-turbo';
        const provider = await providerFactory.getProvider(providerId, settings);
        
        console.log(`Using provider: ${provider.getDisplayName()}`);
        
        // Delegate to the provider's chat stream handler
        await provider.handleChatStream(event, messages, model, modelContextSizes, discoveredTools);
        
    } catch (error) {
        console.error('Chat handler error:', error);
        event.sender.send('chat-stream-error', { 
            error: error.message || `Chat error: ${error}` 
        });
    }
}

// New function to list available models for the current provider
async function listModels(settings) {
    try {
        const providerId = settings.provider || 'ollama-turbo';
        return await providerFactory.listModelsForProvider(providerId, settings);
    } catch (error) {
        console.error('Failed to list models:', error);
        return [];
    }
}

// New function to validate provider connection
async function validateProvider(settings) {
    try {
        const providerId = settings.provider || 'ollama-turbo';
        return await providerFactory.validateProvider(providerId, settings);
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to validate provider'
        };
    }
}

module.exports = { 
    handleChatStream,
    listModels,
    validateProvider
};