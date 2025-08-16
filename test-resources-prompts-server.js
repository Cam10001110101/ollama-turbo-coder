#!/usr/bin/env node
/**
 * Simple MCP server that provides Resources and Prompts for testing
 * Based on the MCP SDK examples you found
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const server = new McpServer({
  name: "test-resources-prompts-server",
  version: "1.0.0",
  capabilities: {
    tools: true,
    resources: true,
    prompts: true
  }
});

// Test Resources
const testResources = [
  {
    uri: "test://sample-data.json",
    name: "Sample Data",
    description: "A sample JSON data resource",
    mimeType: "application/json"
  },
  {
    uri: "test://readme.md",
    name: "Test README",
    description: "A sample markdown document",
    mimeType: "text/markdown"
  },
  {
    uri: "test://config.yaml",
    name: "Configuration",
    description: "Sample configuration file",
    mimeType: "application/yaml"
  }
];

// Test Prompts  
const testPrompts = [
  {
    name: "explain-code",
    description: "Explain what a piece of code does",
    arguments: [
      {
        name: "code",
        description: "The code to explain",
        required: true
      },
      {
        name: "language", 
        description: "Programming language",
        required: false
      }
    ]
  },
  {
    name: "generate-tests",
    description: "Generate unit tests for a function",
    arguments: [
      {
        name: "function_code",
        description: "The function to test",
        required: true
      },
      {
        name: "test_framework",
        description: "Testing framework to use",
        required: false
      }
    ]
  },
  {
    name: "optimize-query",
    description: "Optimize a database query",
    arguments: [
      {
        name: "query",
        description: "SQL query to optimize",
        required: true
      },
      {
        name: "database_type",
        description: "Type of database (MySQL, PostgreSQL, etc.)",
        required: false
      }
    ]
  }
];

// Register Resources handlers
server.setRequestHandler('resources/list', async () => {
  return {
    resources: testResources
  };
});

server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;
  
  // Generate sample content based on URI
  let content;
  let mimeType;
  
  switch (uri) {
    case "test://sample-data.json":
      content = JSON.stringify({
        users: [
          { id: 1, name: "Alice", role: "admin" },
          { id: 2, name: "Bob", role: "user" },
          { id: 3, name: "Charlie", role: "moderator" }
        ],
        settings: {
          theme: "dark",
          notifications: true,
          auto_save: true
        },
        metadata: {
          version: "1.2.3",
          last_updated: new Date().toISOString(),
          total_records: 3
        }
      }, null, 2);
      mimeType = "application/json";
      break;
      
    case "test://readme.md":
      content = `# Test Resources & Prompts Server

This is a sample MCP server that demonstrates Resources and Prompts functionality.

## Features

- **Resources**: Access structured data and documents
- **Prompts**: Pre-configured AI interaction templates
- **Tools**: Standard MCP tool functionality

## Resources Available

1. **Sample Data** - JSON data with users and settings
2. **Configuration** - YAML configuration example
3. **Documentation** - This README file

## Prompts Available

1. **explain-code** - Analyze and explain code snippets
2. **generate-tests** - Create unit tests for functions
3. **optimize-query** - Improve database query performance

## Usage

Connect this server to your MCP client to test the new Resources and Prompts features!
`;
      mimeType = "text/markdown";
      break;
      
    case "test://config.yaml":
      content = `# Sample Configuration
app:
  name: "Test MCP Server"
  version: "1.0.0"
  debug: true

database:
  host: "localhost"
  port: 5432
  name: "test_db"
  ssl: false

features:
  resources: true
  prompts: true
  tools: true
  caching: false

logging:
  level: "info"
  file: "/var/log/mcp-server.log"
  rotation: "daily"
`;
      mimeType = "application/yaml";
      break;
      
    default:
      throw new Error(`Resource not found: ${uri}`);
  }
  
  return {
    contents: [
      {
        uri,
        mimeType,
        text: content
      }
    ]
  };
});

// Register Prompts handlers
server.setRequestHandler('prompts/list', async () => {
  return {
    prompts: testPrompts
  };
});

server.setRequestHandler('prompts/get', async (request) => {
  const { name, arguments: args } = request.params;
  
  const prompt = testPrompts.find(p => p.name === name);
  if (!prompt) {
    throw new Error(`Prompt not found: ${name}`);
  }
  
  let messages;
  
  switch (name) {
    case "explain-code":
      const code = args?.code || "// No code provided";
      const language = args?.language || "unknown";
      messages = [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please explain what this ${language} code does:

\`\`\`${language}
${code}
\`\`\`

Provide a clear, detailed explanation including:
1. What the code does overall
2. How each part works
3. Any potential issues or improvements
4. Example usage if applicable`
          }
        }
      ];
      break;
      
    case "generate-tests":
      const functionCode = args?.function_code || "// No function provided";
      const framework = args?.test_framework || "Jest";
      messages = [
        {
          role: "user", 
          content: {
            type: "text",
            text: `Generate comprehensive unit tests for this function using ${framework}:

\`\`\`javascript
${functionCode}
\`\`\`

Include tests for:
1. Normal/happy path scenarios
2. Edge cases and boundary conditions
3. Error handling and invalid inputs
4. Mock any dependencies if needed`
          }
        }
      ];
      break;
      
    case "optimize-query":
      const query = args?.query || "SELECT * FROM table";
      const dbType = args?.database_type || "PostgreSQL";
      messages = [
        {
          role: "user",
          content: {
            type: "text", 
            text: `Optimize this ${dbType} query for better performance:

\`\`\`sql
${query}
\`\`\`

Please provide:
1. The optimized query
2. Explanation of changes made
3. Performance impact
4. Any recommended indexes
5. Alternative approaches if applicable`
          }
        }
      ];
      break;
      
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
  
  return {
    description: prompt.description,
    messages
  };
});

// Add a simple tool for completeness
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: "hello",
        description: "Say hello with a custom message",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name to greet"
            }
          }
        }
      }
    ]
  };
});

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "hello") {
    const greeting = `Hello, ${args?.name || "World"}! This is from the test MCP server.`;
    return {
      content: [
        {
          type: "text",
          text: greeting
        }
      ]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Test Resources & Prompts MCP Server running on stdio");
}

if (require.main === module) {
  main().catch(error => {
    console.error("Server error:", error);
    process.exit(1);
  });
}

module.exports = { server };