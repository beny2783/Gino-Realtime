#!/usr/bin/env node

/**
 * Master Test Runner for Gino's Pizza Conference Integration
 * Runs all test suites and ensures proper cleanup
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MasterTestRunner {
  constructor() {
    this.testSuites = [
      {
        name: 'Conference Integration',
        file: 'test_conference_simple.js',
        description: 'Tests conference creation, participant management, and cleanup'
      },
      {
        name: 'WebSocket & OpenAI Integration',
        file: 'test_websocket_openai_integration.js',
        description: 'Tests audio streaming and OpenAI Realtime API integration'
      },
      {
        name: 'TwiML Validation',
        file: 'test_twiml_validation.js',
        description: 'Tests TwiML generation and validation'
      }
    ];
    
    this.results = [];
    this.startTime = Date.now();
  }

  async runTestSuite(suite) {
    console.log(`\n🚀 Running ${suite.name} Test Suite`);
    console.log(`📝 ${suite.description}`);
    console.log('='.repeat(60));
    
    return new Promise((resolve) => {
      const testPath = path.join(__dirname, suite.file);
      const child = spawn('node', [testPath], {
        stdio: 'inherit',
        cwd: path.dirname(__dirname)
      });

      child.on('close', (code) => {
        const result = {
          name: suite.name,
          file: suite.file,
          status: code === 0 ? 'PASS' : 'FAIL',
          exitCode: code
        };
        
        this.results.push(result);
        resolve(result);
      });

      child.on('error', (error) => {
        const result = {
          name: suite.name,
          file: suite.file,
          status: 'ERROR',
          error: error.message,
          exitCode: -1
        };
        
        this.results.push(result);
        resolve(result);
      });
    });
  }

  async runAllTests() {
    console.log('🧪 Gino\'s Pizza Conference Integration - Master Test Suite');
    console.log('========================================================');
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`📦 Test Suites: ${this.testSuites.length}`);
    
    // Run each test suite
    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
      
      // Add delay between test suites for cleanup
      console.log('\n⏳ Waiting 2 seconds for cleanup...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    this.printResults();
  }

  printResults() {
    const endTime = Date.now();
    const duration = ((endTime - this.startTime) / 1000).toFixed(2);
    
    console.log('\n📊 Master Test Results Summary');
    console.log('==============================');
    console.log(`⏱️  Total Duration: ${duration} seconds`);
    console.log(`📦 Test Suites: ${this.results.length}`);
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    
    console.log('\n📋 Individual Test Suite Results:');
    console.log('---------------------------------');
    
    this.results.forEach((result, index) => {
      const status = result.status === 'PASS' ? '✅' : 
                    result.status === 'FAIL' ? '❌' : '💥';
      console.log(`${status} ${result.name} (${result.file})`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.exitCode !== undefined && result.exitCode !== 0) {
        console.log(`   Exit Code: ${result.exitCode}`);
      }
    });
    
    console.log('\n📈 Overall Statistics:');
    console.log('----------------------');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`💥 Errors: ${errors}`);
    console.log(`📊 Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%`);
    
    if (failed === 0 && errors === 0) {
      console.log('\n🎉 ALL TESTS PASSED! 🎉');
      console.log('✨ Conference integration is working correctly');
      console.log('✨ WebSocket and OpenAI integration is functional');
      console.log('✨ TwiML generation is valid');
      console.log('✨ All cleanup procedures are working');
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME TESTS FAILED ⚠️');
      console.log('🔍 Please review the failed tests above');
      console.log('🛠️  Check the individual test output for details');
      process.exit(1);
    }
  }
}

// Cleanup handler for graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test execution interrupted');
  console.log('🧹 Cleaning up...');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test execution terminated');
  console.log('🧹 Cleaning up...');
  process.exit(1);
});

// Run the master test suite
const masterRunner = new MasterTestRunner();
masterRunner.runAllTests().catch((error) => {
  console.error('💥 Master test runner failed:', error);
  process.exit(1);
});
