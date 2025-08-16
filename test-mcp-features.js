#!/usr/bin/env node
/**
 * Simple test script to verify MCP Resources and Prompts features
 * Run with: node test-mcp-features.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing MCP Resources and Prompts Features\n');

// Color output helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const blue = (text) => `\x1b[34m${text}\x1b[0m`;

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Test 1: Check if new handler files exist
console.log(blue('Test 1: Checking handler files...'));
const fs = require('fs');
const handlerFiles = [
  './electron/resourceHandler.js',
  './electron/promptHandler.js'
];

handlerFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(green(`  ✓ ${file} exists`));
    results.passed.push(`Handler file: ${file}`);
  } else {
    console.log(red(`  ✗ ${file} not found`));
    results.failed.push(`Handler file: ${file}`);
  }
});

// Test 2: Check if UI components exist
console.log(blue('\nTest 2: Checking UI components...'));
const uiComponents = [
  './src/renderer/components/ResourcesPanel.jsx',
  './src/renderer/components/PromptsPanel.jsx'
];

uiComponents.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(green(`  ✓ ${file} exists`));
    results.passed.push(`UI component: ${file}`);
  } else {
    console.log(red(`  ✗ ${file} not found`));
    results.failed.push(`UI component: ${file}`);
  }
});

// Test 3: Check handler exports
console.log(blue('\nTest 3: Checking handler exports...'));
try {
  const resourceHandler = require('./electron/resourceHandler');
  const promptHandler = require('./electron/promptHandler');
  
  // Check resourceHandler exports
  const resourceExports = ['handleReadResource', 'handleRefreshResources'];
  resourceExports.forEach(exp => {
    if (typeof resourceHandler[exp] === 'function') {
      console.log(green(`  ✓ resourceHandler.${exp} is exported`));
      results.passed.push(`Export: resourceHandler.${exp}`);
    } else {
      console.log(red(`  ✗ resourceHandler.${exp} not found`));
      results.failed.push(`Export: resourceHandler.${exp}`);
    }
  });
  
  // Check promptHandler exports
  const promptExports = ['handleGetPrompt', 'getPromptSuggestions'];
  promptExports.forEach(exp => {
    if (typeof promptHandler[exp] === 'function') {
      console.log(green(`  ✓ promptHandler.${exp} is exported`));
      results.passed.push(`Export: promptHandler.${exp}`);
    } else {
      console.log(red(`  ✗ promptHandler.${exp} not found`));
      results.failed.push(`Export: promptHandler.${exp}`);
    }
  });
} catch (error) {
  console.log(red(`  ✗ Error loading handlers: ${error.message}`));
  results.failed.push(`Handler loading: ${error.message}`);
}

// Test 4: Check IPC handler registrations in main.js
console.log(blue('\nTest 4: Checking IPC handler registrations...'));
const mainJs = fs.readFileSync(path.join(__dirname, './electron/main.js'), 'utf8');
const ipcHandlers = [
  'read-mcp-resource',
  'refresh-mcp-resources',
  'get-mcp-prompt',
  'get-prompt-suggestions'
];

ipcHandlers.forEach(handler => {
  if (mainJs.includes(`'${handler}'`)) {
    console.log(green(`  ✓ IPC handler '${handler}' is registered`));
    results.passed.push(`IPC handler: ${handler}`);
  } else {
    console.log(red(`  ✗ IPC handler '${handler}' not found in main.js`));
    results.failed.push(`IPC handler: ${handler}`);
  }
});

// Test 5: Check preload.js exposures
console.log(blue('\nTest 5: Checking preload.js exposures...'));
const preloadJs = fs.readFileSync(path.join(__dirname, './electron/preload.js'), 'utf8');
const preloadExposures = [
  'getMcpResources',
  'getMcpPrompts',
  'readMcpResource',
  'getMcpPrompt',
  'refreshMcpResources',
  'getPromptSuggestions'
];

preloadExposures.forEach(exposure => {
  if (preloadJs.includes(`${exposure}:`)) {
    console.log(green(`  ✓ window.electron.${exposure} is exposed`));
    results.passed.push(`Preload exposure: ${exposure}`);
  } else {
    console.log(red(`  ✗ window.electron.${exposure} not exposed`));
    results.failed.push(`Preload exposure: ${exposure}`);
  }
});

// Test 6: Check mcpManager.js updates
console.log(blue('\nTest 6: Checking mcpManager.js capabilities...'));
const mcpManagerJs = fs.readFileSync(path.join(__dirname, './electron/mcpManager.js'), 'utf8');
const capabilities = ['resources', 'prompts', 'elicitations', 'discovery', 'sampling', 'roots'];

capabilities.forEach(cap => {
  if (mcpManagerJs.includes(`${cap}: true`)) {
    console.log(green(`  ✓ Capability '${cap}' is declared`));
    results.passed.push(`MCP capability: ${cap}`);
  } else {
    console.log(yellow(`  ⚠ Capability '${cap}' might not be declared`));
    results.warnings.push(`MCP capability: ${cap}`);
  }
});

// Test 7: Check for discoveredResources and discoveredPrompts tracking
console.log(blue('\nTest 7: Checking resource/prompt discovery tracking...'));
const trackingVars = ['discoveredResources', 'discoveredPrompts'];

trackingVars.forEach(varName => {
  if (mcpManagerJs.includes(varName)) {
    console.log(green(`  ✓ ${varName} tracking found`));
    results.passed.push(`Tracking: ${varName}`);
  } else {
    console.log(red(`  ✗ ${varName} tracking not found`));
    results.failed.push(`Tracking: ${varName}`);
  }
});

// Test 8: Build test (non-blocking)
console.log(blue('\nTest 8: Running build test...'));
console.log(yellow('  ⚠ Starting build (this may take a moment)...'));

const buildProcess = spawn('npm', ['run', 'build'], {
  cwd: __dirname,
  shell: true
});

let buildOutput = '';
let buildError = '';

buildProcess.stdout.on('data', (data) => {
  buildOutput += data.toString();
});

buildProcess.stderr.on('data', (data) => {
  buildError += data.toString();
});

buildProcess.on('close', (code) => {
  if (code === 0) {
    console.log(green('  ✓ Build completed successfully'));
    results.passed.push('Build test');
  } else {
    console.log(red(`  ✗ Build failed with code ${code}`));
    if (buildError) {
      console.log(red(`    Error: ${buildError.substring(0, 200)}...`));
    }
    results.failed.push('Build test');
  }
  
  // Print summary
  printSummary();
});

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log(blue('📊 TEST SUMMARY'));
  console.log('='.repeat(60));
  
  console.log(green(`\n✅ PASSED: ${results.passed.length} tests`));
  if (results.passed.length > 0) {
    results.passed.slice(0, 5).forEach(test => {
      console.log(`  • ${test}`);
    });
    if (results.passed.length > 5) {
      console.log(`  ... and ${results.passed.length - 5} more`);
    }
  }
  
  if (results.warnings.length > 0) {
    console.log(yellow(`\n⚠️  WARNINGS: ${results.warnings.length}`));
    results.warnings.forEach(test => {
      console.log(`  • ${test}`);
    });
  }
  
  if (results.failed.length > 0) {
    console.log(red(`\n❌ FAILED: ${results.failed.length} tests`));
    results.failed.forEach(test => {
      console.log(`  • ${test}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (results.failed.length === 0) {
    console.log(green('🎉 All critical tests passed! Resources and Prompts features are ready.'));
    console.log(blue('\nNext steps:'));
    console.log('  1. Run the app: npm start');
    console.log('  2. Check the UI for Resources and Prompts panels');
    console.log('  3. Connect an MCP server with resources/prompts to test functionality');
    console.log('  4. Proceed to Phase 4: Implement Elicitations support');
  } else {
    console.log(red('⚠️  Some tests failed. Please review and fix the issues above.'));
  }
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}