const OllamaTurboProvider = require('./ollamaTurboProvider');
const LocalOllamaProvider = require('./localOllamaProvider');

/**
 * Provider Factory
 * Creates and manages LLM provider instances based on configuration
 */
class ProviderFactory {
    constructor() {
        this.providers = new Map();
        this.currentProvider = null;
        
        // Register available providers
        this.availableProviders = {
            'ollama-turbo': {
                class: OllamaTurboProvider,
                name: 'Ollama Turbo',
                description: 'Cloud-hosted Ollama service at ollama.com'
            },
            'local-ollama': {
                class: LocalOllamaProvider,
                name: 'Local Ollama',
                description: 'Locally running Ollama server'
            }
        };
    }

    /**
     * Get list of available providers
     * @returns {Array<{id: string, name: string, description: string}>}
     */
    getAvailableProviders() {
        return Object.entries(this.availableProviders).map(([id, info]) => ({
            id,
            name: info.name,
            description: info.description
        }));
    }

    /**
     * Create or get a provider instance
     * @param {string} providerId - Provider identifier
     * @param {Object} settings - Provider settings
     * @returns {BaseProvider} Provider instance
     */
    async getProvider(providerId, settings) {
        // Default to ollama-turbo if not specified
        const id = providerId || 'ollama-turbo';
        
        // Check if provider is available
        if (!this.availableProviders[id]) {
            throw new Error(`Unknown provider: ${id}`);
        }

        // Check if we already have an instance
        const cacheKey = `${id}_${JSON.stringify(settings)}`;
        if (this.providers.has(cacheKey)) {
            return this.providers.get(cacheKey);
        }

        // Create new provider instance
        const ProviderClass = this.availableProviders[id].class;
        const provider = new ProviderClass(settings);
        
        try {
            await provider.initialize();
            this.providers.set(cacheKey, provider);
            this.currentProvider = provider;
            return provider;
        } catch (error) {
            console.error(`Failed to initialize provider ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get the current active provider
     * @returns {BaseProvider|null}
     */
    getCurrentProvider() {
        return this.currentProvider;
    }

    /**
     * Set the current active provider
     * @param {string} providerId - Provider identifier
     * @param {Object} settings - Provider settings
     * @returns {Promise<BaseProvider>}
     */
    async setCurrentProvider(providerId, settings) {
        const provider = await this.getProvider(providerId, settings);
        this.currentProvider = provider;
        return provider;
    }

    /**
     * Validate provider connection
     * @param {string} providerId - Provider identifier
     * @param {Object} settings - Provider settings
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async validateProvider(providerId, settings) {
        try {
            const provider = await this.getProvider(providerId, settings);
            return await provider.validateConnection();
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Failed to validate provider'
            };
        }
    }

    /**
     * List models for a specific provider
     * @param {string} providerId - Provider identifier
     * @param {Object} settings - Provider settings
     * @returns {Promise<Array>}
     */
    async listModelsForProvider(providerId, settings) {
        try {
            const provider = await this.getProvider(providerId, settings);
            return await provider.listModels();
        } catch (error) {
            console.error(`Failed to list models for provider ${providerId}:`, error);
            return [];
        }
    }

    /**
     * Clean up all provider instances
     */
    async cleanup() {
        for (const provider of this.providers.values()) {
            try {
                await provider.cleanup();
            } catch (error) {
                console.error('Error cleaning up provider:', error);
            }
        }
        this.providers.clear();
        this.currentProvider = null;
    }

    /**
     * Get provider configuration schema
     * @param {string} providerId - Provider identifier
     * @returns {Object} Configuration schema
     */
    getProviderConfigSchema(providerId) {
        if (!this.availableProviders[providerId]) {
            return {};
        }

        const ProviderClass = this.availableProviders[providerId].class;
        const tempInstance = new ProviderClass({});
        return tempInstance.getConfigSchema();
    }

    /**
     * Check if a provider supports a specific feature
     * @param {string} providerId - Provider identifier
     * @param {string} feature - Feature name
     * @returns {boolean}
     */
    providerSupportsFeature(providerId, feature) {
        if (!this.availableProviders[providerId]) {
            return false;
        }

        const ProviderClass = this.availableProviders[providerId].class;
        const tempInstance = new ProviderClass({});
        return tempInstance.supportsFeature(feature);
    }
}

// Export singleton instance
module.exports = new ProviderFactory();