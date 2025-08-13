# Ollama Turbo Desktop

A desktop chat application powered by Ollama's accelerated open-source models with full MCP (Model Context Protocol) support. Built with Electron, React, and the latest MCP SDK for seamless tool integration.

Available for Windows, macOS, and Linux!

> **Note for macOS Users**: After installing on macOS, you may need to run this command to open the app:
> ```sh
> xattr -c /Applications/Ollama\ Turbo\ Desktop.app
> ```

## Features

- **Accelerated AI Models**: Chat with fast GPT-OSS models (20B and 120B parameters) via Ollama Turbo
- **MCP Tool Integration**: Full support for Model Context Protocol servers and tools
- **Cross-platform**: Native desktop apps for Windows, macOS, and Linux
- **Advanced UI**: Modern React interface with streaming responses and tool call visualization
- **Flexible Configuration**: Support for remote and local MCP servers
- **Developer Friendly**: Built with latest MCP SDK v1.17.2 for maximum compatibility

## Quick Start

### Prerequisites

- Node.js (v18+)  
- pnpm package manager
- Ollama account with API access

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd ollama-turbo-coder
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Get your Ollama API key**:
   - [Sign up](https://ollama.com/signup) for an Ollama account
   - Create an API key at https://ollama.com/settings/keys
   - Copy the API key for the next step

4. **Configure environment**:
   ```bash
   # Create .env file
   echo "OLLAMA_API_KEY=your_api_key_here" > .env
   echo "OLLAMA_DEFAULT_MODEL=gpt-oss:120b" >> .env
   ```

5. **Start the development server**:
   ```bash
   pnpm dev
   ```

The app will launch automatically. Add your API key in Settings if you haven't set it in the .env file.

## Available Models

Ollama Turbo currently supports:
- `gpt-oss:20b` - 20 billion parameter model
- `gpt-oss:120b` - 120 billion parameter model

Both models support:
- 131K token context window
- MCP tool integration
- Fast inference through Turbo acceleration

## Using Ollama Turbo

The app connects to Ollama's Turbo service at `https://ollama.com`. Simply:

1. Launch the app
2. Add your Ollama API key in Settings
3. Select your preferred model (gpt-oss:20b or gpt-oss:120b)
4. Start chatting!

## MCP Server Support

Ollama Turbo Desktop includes full MCP (Model Context Protocol) support with the latest SDK v1.17.2, enabling seamless integration with tools and external data sources.

### Supported MCP Server Types

#### 1. Remote MCP Servers
```json
{
  "transport": "stdio",
  "command": "npx", 
  "args": ["-y", "mcp-remote", "https://mcp.buildaipod.com/mcp"]
}
```

#### 2. Official MCP Servers
```json
// Filesystem access
{
  "transport": "stdio",
  "command": "npx",
  "args": ["@modelcontextprotocol/server-filesystem", "/path/to/directory"]
}

// Git operations  
{
  "transport": "stdio",
  "command": "npx",
  "args": ["@modelcontextprotocol/server-git"]
}

// Web search via Brave
{
  "transport": "stdio", 
  "command": "npx",
  "args": ["@modelcontextprotocol/server-brave-search"]
}
```

#### 3. Custom MCP Servers
```json
// Python server
{
  "transport": "stdio",
  "command": "python3",
  "args": ["/path/to/your/mcp_server.py"] 
}

// Node.js server
{
  "transport": "stdio",
  "command": "node",
  "args": ["/path/to/your/mcp-server.js"]
}
```

### Adding MCP Servers

1. Go to **Settings → MCP Servers**
2. Click **Add Server**
3. Configure your server details
4. Tools will be automatically discovered and available to AI models

### MCP Features

- ✅ **Auto-discovery**: Tools are automatically detected and made available
- ✅ **Health monitoring**: Automatic reconnection and health checks
- ✅ **Multiple transports**: stdio, SSE, and StreamableHTTP support
- ✅ **OAuth authentication**: Full OAuth 2.1 support for authenticated servers
- ✅ **Streaming responses**: Real-time tool execution with streaming results

## Building for Production

To build the app for your platform:

```bash
# For macOS
pnpm dist:mac

# For Windows
pnpm dist:win

# For Linux
pnpm dist:linux
```

## Troubleshooting

### API Key Issues
- Make sure you have created an API key at https://ollama.com/settings/keys
- Verify the API key is correctly entered in Settings

### Connection Issues
- Check your internet connection
- Verify that https://ollama.com is accessible
- Try using the default API endpoint without custom URLs

### Model Selection
- Only gpt-oss:20b and gpt-oss:120b are available in Turbo
- These models don't support image inputs

## Technical Architecture

Built with modern technologies for optimal performance and maintainability:

### Core Technologies
- **Electron**: Cross-platform desktop framework
- **React 19**: Modern UI with hooks and concurrent features  
- **Vite**: Fast build tool and dev server
- **Ollama SDK**: Official JavaScript SDK for Ollama API integration
- **MCP SDK v1.17.2**: Latest Model Context Protocol implementation

### Key Components
- **ollamaHandler.js**: Manages API communication and streaming responses
- **mcpManager.js**: Handles MCP server connections and tool discovery
- **toolHandler.js**: Processes tool execution with robust argument parsing
- **authManager.js**: OAuth 2.1 authentication for MCP servers

### Recent Updates
- ✅ **MCP SDK Updated**: Upgraded from v1.7.0 to v1.17.2 for latest features
- ✅ **Tool Compatibility**: Fixed argument parsing for both object and string formats
- ✅ **Conversation History**: Proper tool call format handling in chat history
- ✅ **Enhanced Security**: OAuth 2.1 compliance with Resource Indicators support

### Development Features
- Hot reload in development
- Comprehensive error handling and logging
- Automatic MCP server health monitoring
- Cross-platform command resolution

## License

MIT

## Acknowledgements

This project is based on [Groq Desktop Beta](https://github.com/groq/groq-desktop-beta) and has been adapted to work with Ollama and other local LLM providers.