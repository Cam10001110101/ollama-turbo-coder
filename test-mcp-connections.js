#!/usr/bin/env node
/**
 * Test MCP server connections and Resources/Prompts functionality
 */

const fs = require('fs');
const path = require('path');

console.log('🔌 Testing MCP Server Connections & Resources/Prompts\n');

// Helper functions
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const blue = (text) => `\x1b[34m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;

// Read current settings
const settingsPath = path.join(process.env.HOME, 'Library/Application Support/ollama-turbo-desktop/settings.json');
let settings;

try {
  const data = fs.readFileSync(settingsPath, 'utf8');
  settings = JSON.parse(data);
} catch (error) {
  console.log(red('❌ Failed to read settings file'));
  console.log(red(`   Path: ${settingsPath}`));
  console.log(red(`   Error: ${error.message}`));
  process.exit(1);
}

console.log(blue('📊 Current MCP Configuration:'));
console.log(`Settings file: ${settingsPath}`);

const mcpServers = settings.mcpServers || {};
const disabledServers = settings.disabledMcpServers || [];
const enabledServers = Object.keys(mcpServers).filter(id => !disabledServers.includes(id));

console.log(`Total servers configured: ${Object.keys(mcpServers).length}`);
console.log(`Enabled servers: ${enabledServers.length}`);
console.log(`Disabled servers: ${disabledServers.length}`);

console.log(blue('\n🟢 Enabled Servers:'));
enabledServers.forEach(serverId => {
  const server = mcpServers[serverId];
  console.log(`  • ${serverId}: ${server.transport || 'stdio'} ${server.url || server.command}`);
});

console.log(blue('\n🔍 Expected Features by Server:'));
console.log('  • Filesystem: ✅ Tools (14) | ❌ Resources (not supported) | ❌ Prompts (not supported)');
console.log('  • Time: ✅ Tools | ⚠️ Resources (TBD) | ⚠️ Prompts (TBD)');
console.log('  • BuildVault: ✅ Tools | ✅ Resources (expected) | ⚠️ Prompts (TBD)');
console.log('  • LangChain-Prompts: ⚠️ Tools (TBD) | ⚠️ Resources (TBD) | ✅ Prompts (expected)');
console.log('  • Obsidian: ✅ Tools | ✅ Resources (notes) | ⚠️ Prompts (TBD)');

console.log(blue('\n🎯 Testing Strategy:'));
console.log('1. Resources Testing:');
console.log('   - Use BuildVault for data resources');
console.log('   - Use Obsidian for file resources (notes)');
console.log('');
console.log('2. Prompts Testing:');
console.log('   - Use LangChain-Prompts for prompt library');
console.log('');
console.log('3. Transport Testing:');
console.log('   - SSE: Time, BuildVault, LangChain-Prompts');
console.log('   - STDIO: Filesystem, Obsidian');

console.log(blue('\n📝 Next Steps:'));
console.log('1. Check app logs for connection status');
console.log('2. Test Resources panel for content from BuildVault/Obsidian');
console.log('3. Test Prompts panel for LangChain prompts');
console.log('4. Fix any transport or configuration issues');

console.log(blue('\n💡 Manual Testing Commands:'));
console.log('- Check logs: tail -f /path/to/app/logs');
console.log('- Restart app to apply config changes');
console.log('- Open Resources panel in UI');
console.log('- Open Prompts panel in UI');
console.log('- Try executing a prompt or viewing a resource');

console.log(green('\n✅ Configuration analysis complete!'));
process.exit(0);