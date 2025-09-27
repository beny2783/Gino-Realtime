/**
 * Call logging service for tracking and persisting call events
 */

import fs from 'fs';
import path from 'path';

export class CallLogger {
  constructor() {
    this.callLogs = [];
    this.callStartTime = new Date().toISOString();
    this.callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log a call event
   * @param {string} type - Event type
   * @param {Object} data - Event data
   * @param {string} message - Human-readable message
   */
  logEvent(type, data = {}, message = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      data,
      message
    };
    
    this.callLogs.push(logEntry);
    console.log(`[${type}] ${message}`, data || '');
  }

  /**
   * Save call logs to file
   * @param {string} streamSid - Twilio stream SID
   * @param {number} totalTurns - Total number of turns in the call
   */
  async saveCallLogs(streamSid, totalTurns) {
    try {
      const callEndTime = new Date().toISOString();
      const logData = {
        callId: this.callId,
        callStartTime: this.callStartTime,
        callEndTime,
        streamSid,
        totalTurns,
        totalLogs: this.callLogs.length,
        logs: this.callLogs
      };
      
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      const filename = `${this.callId}.json`;
      const filepath = path.join(logsDir, filename);
      
      await fs.promises.writeFile(filepath, JSON.stringify(logData, null, 2));
      console.log(`📝 Call logs saved to: ${filepath}`);
    } catch (error) {
      console.error('❌ Failed to save call logs:', error);
    }
  }

  /**
   * Get call ID
   * @returns {string} Call ID
   */
  getCallId() {
    return this.callId;
  }
}
