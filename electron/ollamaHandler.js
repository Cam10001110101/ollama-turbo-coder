const { Ollama } = require('ollama');
const { pruneMessageHistory } = require('./messageUtils');

function validateApiKey(settings) {
    if (!settings.OLLAMA_API_KEY || settings.OLLAMA_API_KEY === "<replace me>") {
        throw new Error("API key not configured. Please add your Ollama API key in settings.");
    }
}

function determineModel(model, settings, modelContextSizes) {
    const modelToUse = model || settings.model || "gpt-oss:120b";
    const modelInfo = modelContextSizes[modelToUse] || modelContextSizes['default'] || { context: 131072, vision_supported: false };
    return { modelToUse, modelInfo };
}

function checkVisionSupport(messages, modelInfo, modelToUse, event) {
    const hasImages = messages.some(msg =>
        msg.role === 'user' &&
        Array.isArray(msg.content) &&
        msg.content.some(part => part.type === 'image_url')
    );

    if (hasImages && !modelInfo.vision_supported) {
        console.warn(`Attempting to use images with non-vision model: ${modelToUse}`);
        event.sender.send('chat-stream-error', { error: `The selected model (${modelToUse}) does not support image inputs. Please select a vision-capable model.` });
        return false;
    }
    
    return true;
}

function prepareTools(discoveredTools) {
    // Prepare tools for the API call
    const tools = (discoveredTools || []).map(tool => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema || {}
        }
    }));
    console.log(`Prepared ${tools.length} tools for the API call.`);
    return tools;
}

function cleanMessages(messages) {
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

function buildApiParams(prunedMessages, modelToUse, settings, tools) {
    let systemPrompt = "You are a helpful assistant capable of using tools. Use tools only when necessary and relevant to the user's request. Format responses using Markdown.";
    if (settings.customSystemPrompt && settings.customSystemPrompt.trim()) {
        systemPrompt += `\n\n${settings.customSystemPrompt.trim()}`;
    }

    // Add system message at the beginning
    const messagesWithSystem = [
        { role: "system", content: systemPrompt },
        ...prunedMessages
    ];

    const apiParams = {
        model: modelToUse,
        messages: messagesWithSystem,
        stream: true,
        options: {
            temperature: settings.temperature ?? 0.7,
            top_p: settings.top_p ?? 0.95,
        }
    };

    // Add tools if available
    if (tools.length > 0) {
        apiParams.tools = tools;
    }

    return apiParams;
}

async function handleChatStream(event, messages, model, settings, modelContextSizes, discoveredTools) {
    try {
        validateApiKey(settings);
        const { modelToUse, modelInfo } = determineModel(model, settings, modelContextSizes);
        const visionCheckPassed = checkVisionSupport(messages, modelInfo, modelToUse, event);
        
        if (!visionCheckPassed) {
            return;
        }

        // Create Ollama client with API key - matching documentation format
        const ollama = new Ollama({
            host: settings.customApiBaseUrl || 'https://ollama.com',
            headers: {
                Authorization: `Bearer ${settings.OLLAMA_API_KEY}`
            }
        });

        const tools = prepareTools(discoveredTools);
        const cleanedMessages = cleanMessages(messages);
        const prunedMessages = pruneMessageHistory(cleanedMessages, modelToUse, modelContextSizes);
        const chatParams = buildApiParams(prunedMessages, modelToUse, settings, tools);

        console.log(`Starting Ollama chat with model: ${modelToUse}`);

        // Track accumulated data
        const accumulatedData = {
            content: "",
            toolCalls: [],
            isFirstChunk: true,
            streamId: `ollama_${Date.now()}`
        };

        // Send start event
        event.sender.send('chat-stream-start', {
            id: accumulatedData.streamId,
            role: "assistant"
        });

        try {
            // Start streaming chat
            const response = await ollama.chat(chatParams);

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

        } catch (streamError) {
            console.error('Ollama streaming error:', streamError);
            const errorMessage = streamError.message || String(streamError);
            event.sender.send('chat-stream-error', {
                error: `Failed to get chat completion: ${errorMessage}`,
                details: streamError
            });
        }

    } catch (outerError) {
        console.error('Ollama handler error:', outerError);
        event.sender.send('chat-stream-error', { 
            error: outerError.message || `Setup error: ${outerError}` 
        });
    }
}

module.exports = { handleChatStream };