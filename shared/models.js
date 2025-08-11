const BASE_MODEL_CONTEXT_SIZES = {
  default: {
    context: 131072,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "gpt-oss:20b": {
    context: 131072,
    vision_supported: false,
    builtin_tools_supported: false,
    displayName: "GPT-OSS 20B"
  },
  "gpt-oss:120b": {
    context: 131072,
    vision_supported: false,
    builtin_tools_supported: false,
    displayName: "GPT-OSS 120B"
  }
};

// Function to check if a model supports built-in tools
function supportsBuiltInTools(modelName, modelContextSizes) {
  // Check explicit configuration instead of name-based heuristic
  const modelInfo = modelContextSizes[modelName] || modelContextSizes['default'];
  return modelInfo?.builtin_tools_supported || false;
}

// Function to merge base models with custom models from settings
function getModelContextSizes(customModels = {}) {
  const mergedModels = { ...BASE_MODEL_CONTEXT_SIZES };
  
  // Add custom models to the merged object
  Object.entries(customModels).forEach(([modelId, config]) => {
    // Use explicit configuration only - no name-based heuristic
    mergedModels[modelId] = {
      context: config.context || 8192,
      vision_supported: config.vision_supported || false,
      builtin_tools_supported: config.builtin_tools_supported || false,
      displayName: config.displayName || modelId,
      isCustom: true
    };
  });
  
  return mergedModels;
}

// Export both the base models and the function to get merged models
module.exports = { 
  MODEL_CONTEXT_SIZES: BASE_MODEL_CONTEXT_SIZES,
  getModelContextSizes,
  supportsBuiltInTools
};
