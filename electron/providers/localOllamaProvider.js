const { Ollama } = require('ollama');
const BaseProvider = require('./baseProvider');
const { pruneMessageHistory } = require('../messageUtils');

/**
 * Local Ollama Provider
 * Handles communication with locally running Ollama server
 */
class LocalOllamaProvider extends BaseProvider {
    constructor(settings) {
        super(settings);
        this.baseUrl = settings.localOllamaUrl || 'http://localhost:11434';
        this.cachedModels = null;
        this.lastModelCheck = null;
        this.MODEL_CACHE_DURATION = 60000; // Cache models for 1 minute
    }

    async initialize() {
        this.client = new Ollama({
            host: this.baseUrl
        });

        this.isInitialized = true;
    }

    async validateConnection() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Try to list models to validate the connection
            const response = await this.client.list();
            
            if (!response || !response.models) {
                return { 
                    success: false, 
                    error: 'Local Ollama server is not responding. Please ensure Ollama is running locally.'
                };
            }

            return { success: true };
        } catch (error) {
            // Check if it's a connection error
            if (error.code === 'ECONNREFUSED') {
                return { 
                    success: false, 
                    error: 'Cannot connect to local Ollama server. Please ensure Ollama is running (ollama serve).'
                };
            }
            
            return { 
                success: false, 
                error: error.message || 'Failed to connect to local Ollama server'
            };
        }
    }

    async listModels() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Check if we have cached models that are still fresh
            const now = Date.now();
            if (this.cachedModels && this.lastModelCheck && 
                (now - this.lastModelCheck) < this.MODEL_CACHE_DURATION) {
                return this.cachedModels;
            }

            // Fetch models from local Ollama
            const response = await this.client.list();
            
            if (!response || !response.models) {
                console.warn('No models found on local Ollama server');
                return [];
            }

            // Transform Ollama model format to our format
            const models = response.models.map(model => ({
                id: model.name,
                name: model.name,
                context: model.details?.parameter_size || 8192,
                vision: model.details?.families?.includes('clip') || false,
                builtin_tools: model.details?.families?.includes('tools') || false,
                size: model.size,
                modified: model.modified_at
            }));

            // Cache the results
            this.cachedModels = models;
            this.lastModelCheck = now;

            return models;
        } catch (error) {
            console.error('Failed to list local Ollama models:', error);
            return [];
        }
    }

    async pullModel(modelName, onProgress) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const stream = await this.client.pull({
                model: modelName,
                stream: true
            });

            for await (const part of stream) {
                if (onProgress) {
                    onProgress(part);
                }
            }

            // Clear model cache to force refresh
            this.cachedModels = null;
            
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error.message || 'Failed to pull model'
            };
        }
    }

    async deleteModel(modelName) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            await this.client.delete({ model: modelName });
            
            // Clear model cache to force refresh
            this.cachedModels = null;
            
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error.message || 'Failed to delete model'
            };
        }
    }

    async handleChatStream(event, messages, model, modelContextSizes, discoveredTools) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // For local Ollama, we need to ensure the model exists locally
            const availableModels = await this.listModels();
            const modelToUse = model || this.settings.model || availableModels[0]?.id;
            
            if (!modelToUse) {
                event.sender.send('chat-stream-error', { 
                    error: 'No models available. Please pull a model first using: ollama pull <model-name>' 
                });
                return;
            }

            // Check if the requested model is available
            const modelExists = availableModels.some(m => m.id === modelToUse);
            if (!modelExists) {
                event.sender.send('chat-stream-error', { 
                    error: `Model ${modelToUse} not found locally. Please pull it first using: ollama pull ${modelToUse}` 
                });
                return;
            }

            const modelInfo = modelContextSizes[modelToUse] || 
                             availableModels.find(m => m.id === modelToUse) || 
                             { context: 8192, vision_supported: false };

            // Check vision support
            const hasImages = messages.some(msg =>
                msg.role === 'user' &&
                Array.isArray(msg.content) &&
                msg.content.some(part => part.type === 'image_url')
            );

            if (hasImages && !modelInfo.vision_supported && !modelInfo.vision) {
                console.warn(`Attempting to use images with non-vision model: ${modelToUse}`);
                event.sender.send('chat-stream-error', { 
                    error: `The selected model (${modelToUse}) does not support image inputs. Please select a vision-capable model.` 
                });
                return;
            }

            // Prepare tools (local Ollama supports tools on some models)
            const tools = (discoveredTools || []).map(tool => ({
                type: "function",
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema || {}
                }
            }));

            // Clean and prepare messages
            const cleanedMessages = this.cleanMessages(messages);
            const prunedMessages = pruneMessageHistory(cleanedMessages, modelToUse, modelContextSizes);

            // Build system prompt
            let systemPrompt = "You are a helpful assistant capable of using tools. Use tools only when necessary and relevant to the user's request. Format responses using Markdown.";
            if (this.settings.customSystemPrompt && this.settings.customSystemPrompt.trim()) {
                systemPrompt += `\n\n${this.settings.customSystemPrompt.trim()}`;
            }

            // Add system message at the beginning
            const messagesWithSystem = [
                { role: "system", content: systemPrompt },
                ...prunedMessages
            ];

            // Build API parameters
            const apiParams = {
                model: modelToUse,
                messages: messagesWithSystem,
                stream: true,
                options: {
                    temperature: this.settings.temperature ?? 0.7,
                    top_p: this.settings.top_p ?? 0.95,
                }
            };

            // Add tools if available and model supports them
            if (tools.length > 0 && (modelInfo.builtin_tools || modelInfo.builtin_tools_supported)) {
                apiParams.tools = tools;
            }

            console.log(`Starting local Ollama chat with model: ${modelToUse}`);

            // Track accumulated data
            const accumulatedData = {
                content: "",
                toolCalls: [],
                isFirstChunk: true,
                streamId: `local_ollama_${Date.now()}`
            };

            // Send start event
            event.sender.send('chat-stream-start', {
                id: accumulatedData.streamId,
                role: "assistant"
            });

            // Start streaming chat
            const response = await this.client.chat(apiParams);

            // Handle streaming response
            for await (const part of response) {
                // Process message content
                if (part.message?.content) {
                    accumulatedData.content += part.message.content;
                    event.sender.send('chat-stream-content', { 
                        content: part.message.content 
                    });
                }

                // Process tool calls if present
                if (part.message?.tool_calls?.length > 0) {
                    for (const toolCall of part.message.tool_calls) {
                        // Check if we already have this tool call
                        let existingCall = accumulatedData.toolCalls.find(tc => tc.id === toolCall.id);
                        
                        if (!existingCall) {
                            // Ensure arguments are properly formatted as JSON string
                            let argumentsString = "";
                            if (toolCall.function?.arguments) {
                                if (typeof toolCall.function.arguments === 'string') {
                                    argumentsString = toolCall.function.arguments;
                                } else {
                                    // Convert object to JSON string
                                    argumentsString = JSON.stringify(toolCall.function.arguments);
                                }
                            }
                            
                            accumulatedData.toolCalls.push({
                                id: toolCall.id || `tool_${Date.now()}_${accumulatedData.toolCalls.length}`,
                                type: 'function',
                                function: {
                                    name: toolCall.function?.name || "",
                                    arguments: argumentsString
                                }
                            });
                        }
                    }
                    event.sender.send('chat-stream-tool-calls', { 
                        tool_calls: accumulatedData.toolCalls 
                    });
                }

                // Check if done
                if (part.done) {
                    event.sender.send('chat-stream-complete', {
                        content: accumulatedData.content,
                        role: "assistant",
                        tool_calls: accumulatedData.toolCalls.length > 0 ? accumulatedData.toolCalls : undefined,
                        finish_reason: 'stop'
                    });
                    return;
                }
            }

        } catch (error) {
            console.error('Local Ollama streaming error:', error);
            
            // Provide more helpful error messages
            let errorMessage = error.message;
            if (error.code === 'ECONNREFUSED') {
                errorMessage = 'Cannot connect to local Ollama. Please ensure Ollama is running (ollama serve).';
            } else if (error.message?.includes('model not found')) {
                errorMessage = `Model not found. Please pull it first using: ollama pull ${model}`;
            }
            
            event.sender.send('chat-stream-error', {
                error: `Failed to get chat completion: ${errorMessage}`,
                details: error
            });
        }
    }

    cleanMessages(messages) {
        // Clean and prepare messages for the API
        return messages.map(msg => {
            const cleanMsg = { ...msg };
            delete cleanMsg.reasoning;
            delete cleanMsg.isStreaming;

            // Convert image URLs to base64 for Ollama
            if (cleanMsg.role === 'user') {
                if (Array.isArray(cleanMsg.content)) {
                    // Extract text and images
                    const textParts = cleanMsg.content.filter(p => p.type === 'text');
                    const imageParts = cleanMsg.content.filter(p => p.type === 'image_url');
                    
                    if (imageParts.length > 0) {
                        // Ollama expects images as base64 in the images field
                        cleanMsg.images = imageParts.map(p => {
                            // Extract base64 from data URL if present
                            const url = p.image_url?.url || p.url;
                            if (url && url.startsWith('data:')) {
                                return url.split(',')[1]; // Get base64 part
                            }
                            return url;
                        });
                    }
                    
                    // Set content to just the text
                    cleanMsg.content = textParts.map(p => p.text).join(' ');
                }
            }

            // Ensure content is string format for all messages
            if (typeof cleanMsg.content !== 'string') {
                if (Array.isArray(cleanMsg.content)) {
                    cleanMsg.content = cleanMsg.content.filter(p => p.type === 'text').map(p => p.text).join('');
                } else {
                    cleanMsg.content = String(cleanMsg.content);
                }
            }

            // Convert tool_calls arguments back to objects for Ollama
            if (cleanMsg.tool_calls && Array.isArray(cleanMsg.tool_calls)) {
                cleanMsg.tool_calls = cleanMsg.tool_calls.map(toolCall => ({
                    ...toolCall,
                    function: {
                        ...toolCall.function,
                        arguments: typeof toolCall.function.arguments === 'string' 
                            ? JSON.parse(toolCall.function.arguments) 
                            : toolCall.function.arguments
                    }
                }));
            }

            return cleanMsg;
        });
    }

    getDisplayName() {
        return 'Local Ollama';
    }

    getId() {
        return 'local-ollama';
    }

    supportsFeature(feature) {
        const supportedFeatures = ['streaming', 'tools', 'model-management'];
        return supportedFeatures.includes(feature);
    }

    getConfigSchema() {
        return {
            localOllamaUrl: {
                type: 'string',
                label: 'Local Ollama URL',
                placeholder: 'http://localhost:11434',
                required: false,
                default: 'http://localhost:11434'
            }
        };
    }
}

module.exports = LocalOllamaProvider;