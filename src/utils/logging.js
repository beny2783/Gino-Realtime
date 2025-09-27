/**
 * Call logging utilities for debugging and analytics
 * Handles structured logging and log persistence
 */

import fs from 'fs';
import path from 'path';

/**
 * Creates a call logging system for a single call session
 * @param {string} callId - Unique identifier for the call
 * @returns {Object} Logging utilities for the call
 */
export function createCallLogger(callId) {
  const callLogs = [];
  const callStartTime = new Date().toISOString();
  
  /**
   * Logs an event for the current call
   * @param {string} type - Event type
   * @param {Object} data - Event data
   * @param {string} message - Human-readable message
   */
  function logCallEvent(type, data, message = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      data: data || {},
      message
    };
    callLogs.push(logEntry);
    console.log(`[${type}] ${message}`, data || '');
  }
  
  /**
   * Saves call logs to disk
   * @param {string} streamSid - Twilio stream ID
   * @param {number} totalTurns - Number of conversation turns
   */
  async function saveCallLogs(streamSid, totalTurns) {
    try {
      const callEndTime = new Date().toISOString();
      const logData = {
        callId,
        callStartTime,
        callEndTime,
        streamSid,
        totalTurns,
        totalLogs: callLogs.length,
        logs: callLogs
      };
      
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      const filename = `${callId}.json`;
      const filepath = path.join(logsDir, filename);
      
      await fs.promises.writeFile(filepath, JSON.stringify(logData, null, 2));
      console.log(`📝 Call logs saved to: ${filepath}`);
    } catch (error) {
      console.error('❌ Failed to save call logs:', error);
    }
  }
  
  return {
    logCallEvent,
    saveCallLogs,
    getLogs: () => callLogs
  };
}
