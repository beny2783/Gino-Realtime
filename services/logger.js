import fs from 'fs';
import path from 'path';

// =====================
// Call Logging System
// =====================

export class CallLogger {
  constructor() {
    this.logs = [];
    this.callStartTime = new Date().toISOString();
    this.callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  log(type, data, message = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      data: data || {},
      message
    };
    this.logs.push(logEntry);
    console.log(`[${type}] ${message}`, data || '');
  }
  
  async save(streamSid, totalTurns) {
    try {
      const callEndTime = new Date().toISOString();
      const logData = {
        callId: this.callId,
        callStartTime: this.callStartTime,
        callEndTime,
        streamSid,
        totalTurns,
        totalLogs: this.logs.length,
        logs: this.logs
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
}
