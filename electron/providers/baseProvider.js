/**
 * Base Provider Class
 * Abstract base class that defines the interface for all LLM providers
 */
class BaseProvider {
    constructor(settings) {
        this.settings = settings;
        this.client = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the provider with configuration
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Validate the provider connection
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async validateConnection() {
        throw new Error('validateConnection() must be implemented by subclass');
    }

    /**
     * List available models from this provider
     * @returns {Promise<Array<{id: string, name: string, context?: number, vision?: boolean}>>}
     */
    async listModels() {
        throw new Error('listModels() must be implemented by subclass');
    }

    /**
     * Handle chat streaming
     * @param {Object} event - Electron IPC event
     * @param {Array} messages - Chat messages
     * @param {string} model - Model to use
     * @param {Object} modelContextSizes - Model context configurations
     * @param {Array} discoveredTools - Available tools
     * @returns {Promise<void>}
     */
    async handleChatStream(event, messages, model, modelContextSizes, discoveredTools) {
        throw new Error('handleChatStream() must be implemented by subclass');
    }

    /**
     * Get provider display name
     * @returns {string}
     */
    getDisplayName() {
        throw new Error('getDisplayName() must be implemented by subclass');
    }

    /**
     * Get provider identifier
     * @returns {string}
     */
    getId() {
        throw new Error('getId() must be implemented by subclass');
    }

    /**
     * Check if provider supports a specific feature
     * @param {string} feature - Feature name (e.g., 'vision', 'tools', 'streaming')
     * @returns {boolean}
     */
    supportsFeature(feature) {
        return false;
    }

    /**
     * Get provider-specific configuration schema
     * @returns {Object} Configuration schema for settings UI
     */
    getConfigSchema() {
        return {};
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        this.client = null;
        this.isInitialized = false;
    }
}

module.exports = BaseProvider;