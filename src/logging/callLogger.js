import fs from 'fs';
import path from 'path';

export class CallLogger {
  constructor() {
    this.callLogs = [];
    this.callStartTime = new Date().toISOString();
    this.callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  logEvent(type, data, message = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      data: data || {},
      message
    };
    this.callLogs.push(logEntry);
    console.log(`[${type}] ${message}`, data || '');
  }

  async saveLogs(streamSid, turnCounter) {
    try {
      const callEndTime = new Date().toISOString();
      const logData = {
        callId: this.callId,
        callStartTime: this.callStartTime,
        callEndTime,
        streamSid,
        totalTurns: turnCounter,
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

  getCallId() {
    return this.callId;
  }
}