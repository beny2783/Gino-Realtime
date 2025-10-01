import fs from 'fs';
import { spawn } from 'child_process';
import { cBytesOut } from '../metrics.js';

/**
 * FFmpegMixer handles audio mixing for the Gino's Pizza voice assistant.
 *
 * This class manages an FFmpeg process that mixes AI-generated speech audio with ambient
 * restaurant background noise to create a more immersive caller experience. The mixed audio
 * is then streamed back to Twilio for playback to the caller.
 *
 * Key features:
 * - Spawns FFmpeg process with audio mixing pipeline
 * - Accepts AI audio buffers and feeds them to FFmpeg for mixing
 * - Mixes AI speech with looped ambient restaurant noise (volume set via constructor parameter)
 * - Outputs PCMU-encoded audio to Twilio WebSocket connection
 * - Feeds silence to FFmpeg when AI is not speaking to maintain audio stream
 * - Tracks audio output metrics for monitoring
 *
 * FFmpeg command pipeline:
 * Input 1 (pipe:0): AI speech audio (PCMU, 8kHz)
 * Input 2 (ambience file): Looped restaurant ambience
 * Filter: amix with configurable weights (speech: 1.0, ambience: configurable)
 * Output: PCMU audio to Twilio
 */
export class FFmpegMixer {
  /**
   * Creates a new FFmpegMixer instance.
   * @param {string} ambienceFile - Path to the ambient restaurant noise WAV file
   * @param {string} streamSid - Twilio stream SID for audio routing
   * @param {WebSocket} connection - Twilio WebSocket connection for audio output
   * @param {number} ambienceVolume - Volume level for ambient noise (0.0-1.0), defaults to 0.1
   */
  constructor(ambienceFile, streamSid, connection, ambienceVolume = 0.1) {
    this.ambienceFile = ambienceFile;
    this.streamSid = streamSid;
    this.connection = connection;
    this.ambienceVolume = ambienceVolume;
    this.process = null;
    this.isAISpeaking = false;
    this.silenceInterval = null;
  }

  /**
   * Starts the FFmpeg mixing process.
   * @returns {boolean} True if FFmpeg started successfully, false if ambience file not found
   */
  start() {
    if (!fs.existsSync(this.ambienceFile)) {
      console.warn('Ambience file not found, proceeding without ambient noise');
      return false;
    }

    this.process = spawn('ffmpeg', [
      '-f', 'mulaw',
      '-ar', '8000',
      '-i', 'pipe:0',
      '-stream_loop', '-1',
      '-i', this.ambienceFile,
      '-filter_complex', `[0:a]atempo=1.2[a_fast];[a_fast][1:a]amix=inputs=2:duration=first:weights=1 ${this.ambienceVolume}`,
      '-f', 'mulaw',
      'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'ignore'] });

    this.process.stdout.on('data', (chunk) => {
      const b64 = chunk.toString('base64');
      const audioDelta = {
        event: 'media',
        streamSid: this.streamSid,
        media: { payload: b64 },
      };
      this.connection.send(JSON.stringify(audioDelta));
      cBytesOut.inc(Math.floor(b64.length * 0.75));
    });

    this.process.on('close', (code) => {
      console.log('FFmpeg process exited with code', code);
    });

    // Feed silence to FFmpeg when not speaking
    this.silenceInterval = setInterval(() => {
      if (!this.isAISpeaking && this.process) {
        const silence = Buffer.alloc(160, 0x7F); // PCMU silence
        this.process.stdin.write(silence);
      }
    }, 20);

    return true;
  }

  /**
   * Feeds AI-generated audio buffer to FFmpeg for mixing.
   * @param {Buffer} buffer - PCMU-encoded audio buffer from OpenAI
   */
  feedAudio(buffer) {
    if (this.process) {
      this.process.stdin.write(buffer);
    }
  }

  /**
   * Updates the AI speaking state to control silence feeding.
   * @param {boolean} speaking - True when AI is actively speaking
   */
  setAISpeaking(speaking) {
    this.isAISpeaking = speaking;
  }

  /**
   * Stops the FFmpeg process and cleans up resources.
   */
  stop() {
    if (this.silenceInterval) {
      clearInterval(this.silenceInterval);
      this.silenceInterval = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}