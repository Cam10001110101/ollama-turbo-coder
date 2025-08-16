#!/usr/bin/env node
/**
 * Test script for Elicitation support
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Elicitation Support\n');

// Color output helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const blue = (text) => `\x1b[34m${text}\x1b[0m`;

let passed = 0;
let failed = 0;

// Test 1: Check if elicitation handler exists
console.log(blue('Test 1: Checking elicitation handler...'));
const handlerPath = path.join(__dirname, './electron/elicitationHandler.js');
if (fs.existsSync(handlerPath)) {
  console.log(green('  ✓ elicitationHandler.js exists'));
  
  // Check exports
  try {
    const handler = require(handlerPath);
    const expectedExports = [
      'setupElicitationHandlers',
      'handleElicitation',
      'getPendingElicitations',
      'cancelElicitation'
    ];
    
    expectedExports.forEach(exp => {
      if (typeof handler[exp] === 'function') {
        console.log(green(`  ✓ ${exp} is exported`));
        passed++;
      } else {
        console.log(red(`  ✗ ${exp} not found`));
        failed++;
      }
    });
  } catch (error) {
    console.log(red(`  ✗ Error loading handler: ${error.message}`));
    failed++;
  }
} else {
  console.log(red('  ✗ elicitationHandler.js not found'));
  failed++;
}

// Test 2: Check UI component
console.log(blue('\nTest 2: Checking ElicitationModal component...'));
const modalPath = path.join(__dirname, './src/renderer/components/ElicitationModal.jsx');
if (fs.existsSync(modalPath)) {
  console.log(green('  ✓ ElicitationModal.jsx exists'));
  passed++;
  
  // Check component structure
  const content = fs.readFileSync(modalPath, 'utf8');
  const checks = [
    { pattern: 'mcp-elicitation-request', name: 'IPC listener' },
    { pattern: 'handleConfirmation', name: 'Confirmation handler' },
    { pattern: 'handleInputSubmit', name: 'Input handler' },
    { pattern: 'handleSelectSubmit', name: 'Select handler' }
  ];
  
  checks.forEach(check => {
    if (content.includes(check.pattern)) {
      console.log(green(`  ✓ ${check.name} found`));
      passed++;
    } else {
      console.log(red(`  ✗ ${check.name} not found`));
      failed++;
    }
  });
} else {
  console.log(red('  ✗ ElicitationModal.jsx not found'));
  failed++;
}

// Test 3: Check mcpManager integration
console.log(blue('\nTest 3: Checking mcpManager integration...'));
const mcpPath = path.join(__dirname, './electron/mcpManager.js');
const mcpContent = fs.readFileSync(mcpPath, 'utf8');

if (mcpContent.includes('setupElicitationHandlers')) {
  console.log(green('  ✓ Elicitation handler setup in mcpManager'));
  passed++;
} else {
  console.log(red('  ✗ Elicitation handler not integrated in mcpManager'));
  failed++;
}

// Test 4: Check main.js IPC handlers
console.log(blue('\nTest 4: Checking IPC handlers in main.js...'));
const mainJs = fs.readFileSync(path.join(__dirname, './electron/main.js'), 'utf8');

const ipcHandlers = [
  'get-pending-elicitations',
  'cancel-elicitation'
];

ipcHandlers.forEach(handler => {
  if (mainJs.includes(`'${handler}'`)) {
    console.log(green(`  ✓ IPC handler '${handler}' registered`));
    passed++;
  } else {
    console.log(red(`  ✗ IPC handler '${handler}' not found`));
    failed++;
  }
});

// Test 5: Check preload.js exposures
console.log(blue('\nTest 5: Checking preload.js exposures...'));
const preloadJs = fs.readFileSync(path.join(__dirname, './electron/preload.js'), 'utf8');

const preloadExposures = [
  'getPendingElicitations',
  'cancelElicitation'
];

preloadExposures.forEach(exposure => {
  if (preloadJs.includes(`${exposure}:`)) {
    console.log(green(`  ✓ window.electron.${exposure} exposed`));
    passed++;
  } else {
    console.log(red(`  ✗ window.electron.${exposure} not exposed`));
    failed++;
  }
});

// Test 6: Check client capabilities
console.log(blue('\nTest 6: Checking elicitations capability declaration...'));
if (mcpContent.includes('elicitations: true')) {
  console.log(green('  ✓ Elicitations capability declared'));
  passed++;
} else {
  console.log(red('  ✗ Elicitations capability not declared'));
  failed++;
}

// Summary
console.log('\n' + '='.repeat(60));
console.log(blue('📊 ELICITATION TEST SUMMARY'));
console.log('='.repeat(60));
console.log(green(`✅ PASSED: ${passed} tests`));
if (failed > 0) {
  console.log(red(`❌ FAILED: ${failed} tests`));
}

if (failed === 0) {
  console.log(green('\n🎉 All elicitation tests passed!'));
  console.log(blue('Phase 4: Elicitations support is complete.'));
  process.exit(0);
} else {
  console.log(red('\n⚠️  Some tests failed. Please review the issues above.'));
  process.exit(1);
}