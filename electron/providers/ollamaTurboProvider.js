// Polyfill fetch for Node.js environment
if (!global.fetch) {
    global.fetch = require('node-fetch');
}

const { Ollama } = require('ollama');
const BaseProvider = require('./baseProvider');
const { pruneMessageHistory } = require('../messageUtils');

/**
 * Ollama Turbo Provider
 * Handles communication with ollama.com cloud service
 */
class OllamaTurboProvider extends BaseProvider {
    constructor(settings) {
        super(settings);
        this.apiKey = settings.OLLAMA_API_KEY;
        this.baseUrl = settings.customApiBaseUrl || 'https://ollama.com';
    }

    async initialize() {
        if (!this.apiKey || this.apiKey === "<replace me>") {
            throw new Error("API key not configured. Please add your Ollama API key in settings.");
        }

        this.client = new Ollama({
            host: this.baseUrl,
            headers: {
                Authorization: `Bearer ${this.apiKey}`
            }
        });

        this.isInitialized = true;
    }

    async validateConnection() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Try to list models to validate the connection
            const models = await this.client.list();
            
            if (models && models.models && models.models.length > 0) {
                return { success: true };
            } else {
                return { 
                    success: false, 
                    error: 'No models available'
                };
            }
        } catch (error) {
            return { 
                success: false, 
                error: error.message || 'Failed to connect to Ollama Turbo'
            };
        }
    }

    async listModels() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Fetch models dynamically from the API
            const response = await this.client.list();
            
            if (response && response.models && Array.isArray(response.models)) {
                // Map the API response to our expected format
                return response.models.map(model => {
                    // Create a clean display name from the model ID
                    let displayName = model.name;
                    
                    // Format common patterns for better display
                    displayName = displayName
                        .replace(/:latest$/, '')  // Remove :latest suffix
                        .replace(/-/, ' ')         // Replace dashes with spaces
                        .replace(/v(\d+\.\d+)/, 'V$1')  // Format version numbers
                        .replace(/(\d+)b$/i, ' $1B')    // Format parameter counts (e.g., 20b -> 20B)
                        .replace(/:(\d+)b$/i, ' $1B');  // Format parameter counts with colon
                    
                    // Capitalize known acronyms
                    displayName = displayName
                        .replace(/\bgpt\b/gi, 'GPT')
                        .replace(/\boss\b/gi, 'OSS')
                        .replace(/\bllm\b/gi, 'LLM')
                        .replace(/\bai\b/gi, 'AI');
                    
                    // Title case the name
                    displayName = displayName.split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                    
                    // Add model size info if available
                    if (model.size) {
                        const sizeGB = Math.round(model.size / (1024 * 1024 * 1024));
                        if (sizeGB > 0) {
                            displayName += ` (${sizeGB}GB)`;
                        }
                    }
                    
                    // Use model metadata if provided, otherwise use sensible defaults
                    const context = model.context || 131072; // Default 128K
                    const vision = model.vision || false;
                    const builtin_tools = model.tools || false;
                    
                    return {
                        id: model.name,
                        name: displayName,
                        context: context,
                        vision: vision,
                        builtin_tools: builtin_tools
                    };
                });
            }
        } catch (error) {
            console.warn('Failed to fetch models from API:', error.message);
        }

        // Minimal fallback - just return empty array or a single default model
        console.warn('Using empty model list - models will be fetched when available');
        return [];
    }

    async handleChatStream(event, messages, model, modelContextSizes, discoveredTools) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const modelToUse = model || this.settings.model || ""; // No hardcoded default
            const modelInfo = modelContextSizes[modelToUse] || modelContextSizes['default'] || { 
                context: 131072, 
                vision_supported: false 
            };

            // Check vision support
            const hasImages = messages.some(msg =>
                msg.role === 'user' &&
                Array.isArray(msg.content) &&
                msg.content.some(part => part.type === 'image_url')
            );

            if (hasImages && !modelInfo.vision_supported) {
                console.warn(`Attempting to use images with non-vision model: ${modelToUse}`);
                event.sender.send('chat-stream-error', { 
                    error: `The selected model (${modelToUse}) does not support image inputs. Please select a vision-capable model.` 
                });
                return;
            }

            // Prepare tools
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
            
            // Check if model supports special features based on its name/metadata
            // Models can indicate support via their name patterns
            const modelSupportsDeepseekThinking = modelToUse.includes('deepseek') && modelToUse.includes('v3');
            const modelSupportsGptOssReasoning = modelToUse.includes('gpt-oss');
            const modelSupportsTools = !modelSupportsDeepseekThinking; // For now, disable tools when thinking is enabled
            
            // Add think parameter for DeepSeek models
            if (modelSupportsDeepseekThinking) {
                // Use explicit setting if provided, otherwise default to true for supported models
                apiParams.think = this.settings.thinkMode !== undefined ? this.settings.thinkMode : true;
            }
            
            // Add reasoning_effort parameter for gpt-oss models
            if (modelSupportsGptOssReasoning) {
                const reasoningEffort = this.settings.reasoningEffort || 'medium';
                // gpt-oss expects reasoning_effort in extra_body or as system prompt
                if (reasoningEffort !== 'off') {
                    apiParams.extra_body = { reasoning_effort: reasoningEffort };
                }
            }

            // Add tools if available and supported by the model
            if (tools.length > 0 && modelSupportsTools) {
                apiParams.tools = tools;
            }

            console.log(`Starting Ollama Turbo chat with model: ${modelToUse}`);
            console.log('API params:', JSON.stringify({
                ...apiParams,
                messages: `[${apiParams.messages.length} messages]`,
                tools: apiParams.tools ? `[${apiParams.tools.length} tools]` : undefined
            }, null, 2));

            // Track accumulated data
            const accumulatedData = {
                content: "",
                toolCalls: [],
                isFirstChunk: true,
                streamId: `ollama_turbo_${Date.now()}`
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
            console.error('Ollama Turbo streaming error:', error);
            
            // Try to get more details about the error
            let errorMessage = error.message || 'Unknown error';
            if (error.status_code === 502) {
                errorMessage = 'Service temporarily unavailable (502). The model might be loading or under heavy load. Please try again in a moment.';
                console.log('502 Error - Model:', modelToUse);
                console.log('502 Error - Think enabled:', apiParams.think || false);
                console.log('502 Error - Tools count:', apiParams.tools?.length || 0);
            }
            
            event.sender.send('chat-stream-error', {
                error: errorMessage,
                details: error,
                model: modelToUse
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
        return 'Ollama Turbo';
    }

    getId() {
        return 'ollama-turbo';
    }

    supportsFeature(feature) {
        const supportedFeatures = ['streaming', 'tools'];
        return supportedFeatures.includes(feature);
    }

    getConfigSchema() {
        return {
            OLLAMA_API_KEY: {
                type: 'string',
                label: 'API Key',
                placeholder: 'Enter your Ollama API key',
                required: true,
                secure: true
            },
            customApiBaseUrl: {
                type: 'string',
                label: 'Custom API Base URL (optional)',
                placeholder: 'https://ollama.com',
                required: false
            }
        };
    }
}

module.exports = OllamaTurboProvider;