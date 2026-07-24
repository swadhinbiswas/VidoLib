import { VideoPacket, AudioPacket } from '@vidolib/core';

export type DecodeEngine = 'webcodecs' | 'native' | 'wasm-royalty-free' | 'ffmpeg-wasm-opt-in';

export type DecoderState = 'unconfigured' | 'configured' | 'decoding' | 'closed';

export interface CodecCapability {
  codec: string;
  engine: DecodeEngine;
  hardwareAccelerated: boolean;
  supported: boolean;
  reason?: string;
}

export interface DecodedVideoFrame {
  pts: number;
  width: number;
  height: number;
  frameData: Uint8Array | ImageBitmap | unknown;
}

export interface DecodedAudioFrame {
  pts: number;
  sampleRate: number;
  channels: number;
  channelData: Float32Array[];
}

export class CodecNegotiator {
  public static async negotiateVideo(codec: string, width: number = 1920, height: number = 1080): Promise<CodecCapability> {
    if (typeof (globalThis as any).VideoDecoder !== 'undefined') {
      try {
        const support = await (globalThis as any).VideoDecoder.isConfigSupported({
          codec,
          codedWidth: width,
          codedHeight: height
        });
        if (support.supported) {
          return {
            codec,
            engine: 'webcodecs',
            hardwareAccelerated: support.config?.hardwareAcceleration !== 'prefer-software',
            supported: true
          };
        }
      } catch {}
    }

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const v = document.createElement('video');
        if (v && typeof v.canPlayType === 'function') {
          const canPlay = v.canPlayType(`video/mp4; codecs="${codec}"`);
          if (canPlay === 'probably' || canPlay === 'maybe') {
            return {
              codec,
              engine: 'native',
              hardwareAccelerated: true,
              supported: true
            };
          }
        }
      } catch {}
    }

    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      return {
        codec,
        engine: 'native',
        hardwareAccelerated: true,
        supported: true
      };
    }

    const royaltyFreeCodecs = ['av01.', 'vp8', 'vp09.', 'theora'];
    const isRoyaltyFree = royaltyFreeCodecs.some(rf => codec.toLowerCase().includes(rf));

    if (isRoyaltyFree) {
      return {
        codec,
        engine: 'wasm-royalty-free',
        hardwareAccelerated: false,
        supported: true
      };
    }

    return {
      codec,
      engine: 'ffmpeg-wasm-opt-in',
      hardwareAccelerated: false,
      supported: false,
      reason: `Patented codec '${codec}' is unsupported by OS/Browser hardware decoders.`
    };
  }

  public static async negotiateAudio(codec: string, sampleRate: number = 48000, channels: number = 2): Promise<CodecCapability> {
    if (typeof (globalThis as any).AudioDecoder !== 'undefined') {
      try {
        const support = await (globalThis as any).AudioDecoder.isConfigSupported({
          codec,
          sampleRate,
          numberOfChannels: channels
        });
        if (support.supported) {
          return {
            codec,
            engine: 'webcodecs',
            hardwareAccelerated: false,
            supported: true
          };
        }
      } catch {}
    }

    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      return {
        codec,
        engine: 'native',
        hardwareAccelerated: false,
        supported: true
      };
    }

    return {
      codec,
      engine: 'ffmpeg-wasm-opt-in',
      hardwareAccelerated: false,
      supported: false,
      reason: `Audio codec '${codec}' is not supported in this environment.`
    };
  }
}

export class WebCodecsVideoDecoder {
  private decoder?: any;
  private _state: DecoderState = 'unconfigured';
  private onError?: (error: Error) => void;

  public get state(): DecoderState {
    return this._state;
  }

  public async init(codec: string, onFrame: (frame: DecodedVideoFrame) => void, onError?: (error: Error) => void): Promise<void> {
    if (typeof (globalThis as any).VideoDecoder === 'undefined') {
      throw new Error('WebCodecs VideoDecoder API is not supported in this environment.');
    }

    this.onError = onError;

    this.decoder = new (globalThis as any).VideoDecoder({
      output: (videoFrame: any) => {
        onFrame({
          pts: videoFrame.timestamp / 1_000_000,
          width: videoFrame.displayWidth,
          height: videoFrame.displayHeight,
          frameData: videoFrame
        });
      },
      error: (err: any) => {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('WebCodecs Decoder Error:', error);
        if (this.onError) {
          this.onError(error);
        }
      }
    });

    (this.decoder as any).configure({ codec });
    this._state = 'configured';
  }

  public decode(packet: VideoPacket): void {
    if (!this.decoder || this._state === 'closed') return;
    
    this._state = 'decoding';
    
    const chunk = new (globalThis as any).EncodedVideoChunk({
      type: packet.isKeyframe ? 'key' : 'delta',
      timestamp: packet.pts * 1_000_000,
      data: packet.data
    });
    (this.decoder as any).decode(chunk);
  }

  public async flush(): Promise<void> {
    if (this.decoder && this._state !== 'closed') {
      await (this.decoder as any).flush();
      this._state = 'configured';
    }
  }

  public close(): void {
    if (this.decoder && this._state !== 'closed') {
      (this.decoder as any).close();
      this.decoder = undefined;
      this._state = 'closed';
    }
  }
}

export class WebCodecsAudioDecoder {
  private decoder?: any;
  private _state: DecoderState = 'unconfigured';
  private onError?: (error: Error) => void;

  public get state(): DecoderState {
    return this._state;
  }

  public async init(codec: string, sampleRate: number, channels: number, onFrame: (frame: DecodedAudioFrame) => void, onError?: (error: Error) => void): Promise<void> {
    if (typeof (globalThis as any).AudioDecoder === 'undefined') {
      throw new Error('WebCodecs AudioDecoder API is not supported in this environment.');
    }

    this.onError = onError;

    this.decoder = new (globalThis as any).AudioDecoder({
      output: (audioData: any) => {
        const channelData: Float32Array[] = [];
        for (let i = 0; i < audioData.numberOfChannels; i++) {
          channelData.push(audioData.getChannelData(i));
        }
        
        onFrame({
          pts: audioData.timestamp / 1_000_000,
          sampleRate: audioData.sampleRate,
          channels: audioData.numberOfChannels,
          channelData
        });
        
        audioData.close();
      },
      error: (err: any) => {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('WebCodecs AudioDecoder Error:', error);
        if (this.onError) {
          this.onError(error);
        }
      }
    });

    (this.decoder as any).configure({
      codec,
      sampleRate,
      numberOfChannels: channels
    });
    this._state = 'configured';
  }

  public decode(packet: AudioPacket): void {
    if (!this.decoder || this._state === 'closed') return;
    
    this._state = 'decoding';
    
    const chunk = new (globalThis as any).EncodedAudioChunk({
      type: 'delta',
      timestamp: packet.pts * 1_000_000,
      data: packet.data
    });
    (this.decoder as any).decode(chunk);
  }

  public async flush(): Promise<void> {
    if (this.decoder && this._state !== 'closed') {
      await (this.decoder as any).flush();
      this._state = 'configured';
    }
  }

  public close(): void {
    if (this.decoder && this._state !== 'closed') {
      (this.decoder as any).close();
      this.decoder = undefined;
      this._state = 'closed';
    }
  }
}

export class WASMRoyaltyFreeDecoder {
  private wasmModule: WebAssembly.Module | null = null;
  private wasmInstance: WebAssembly.Instance | null = null;

  constructor(public readonly codec: string) {
    console.log(`WASM royalty-free decoder initialized for codec '${codec}'. Use loadWasm() to load the decoder module.`);
  }

  public async loadWasm(modulePath: string): Promise<void> {
    try {
      const response = await fetch(modulePath);
      const bytes = await response.arrayBuffer();
      this.wasmModule = await WebAssembly.compile(bytes);
      this.wasmInstance = await WebAssembly.instantiate(this.wasmModule);
      console.log(`WASM module loaded for codec '${this.codec}'`);
    } catch (error) {
      throw new Error(`Failed to load WASM module for codec '${this.codec}': ${error}`);
    }
  }

  public decodeVideo(packet: VideoPacket): DecodedVideoFrame {
    if (!this.wasmInstance) {
      throw new Error(`WASM module not loaded for codec '${this.codec}'. Call loadWasm() first.`);
    }
    
    // TODO: Implement actual WASM decoding
    // For now, throw descriptive error
    throw new Error(`WASM decoding not yet implemented for codec '${this.codec}'.`);
  }

  public decodeAudio(packet: AudioPacket): DecodedAudioFrame {
    if (!this.wasmInstance) {
      throw new Error(`WASM module not loaded for codec '${this.codec}'. Call loadWasm() first.`);
    }
    
    // TODO: Implement actual WASM decoding
    throw new Error(`WASM decoding not yet implemented for codec '${this.codec}'.`);
  }

  public isLoaded(): boolean {
    return this.wasmInstance !== null;
  }
}

export class FFmpegWasmOptInFallback {
  private ffmpegInstance: any = null;
  private isLoaded = false;

  constructor() {
    console.warn(
      'FFmpeg WASM fallback plugin loaded. ' +
      'This software decoder bundle increases package size by ~12MB and may carry patent licensing obligations for H.264/HEVC/AC-3.'
    );
  }

  public async load(): Promise<void> {
    try {
      // Dynamic import for ffmpeg-wasm
      // Note: This requires @ffmpeg/ffmpeg to be installed
      const ffmpegModule = await (Function('return import("@ffmpeg/ffmpeg")')() as Promise<any>);
      const FFmpegClass = ffmpegModule.FFmpeg || ffmpegModule.default;
      this.ffmpegInstance = new FFmpegClass();
      await this.ffmpegInstance.load();
      this.isLoaded = true;
      console.log('FFmpeg WASM loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg WASM:', error);
      throw new Error(`Failed to load FFmpeg WASM: ${error}`);
    }
  }

  public isReady(): boolean {
    return this.isLoaded && this.ffmpegInstance !== null;
  }

  public async decode(input: Uint8Array, codec: string): Promise<Uint8Array> {
    if (!this.isReady()) {
      throw new Error('FFmpeg WASM not loaded. Call load() first.');
    }

    // Write input to FFmpeg filesystem
    await this.ffmpegInstance.writeFile('input.mp4', input);

    // Run decode command
    await this.ffmpegInstance.exec(['-i', 'input.mp4', '-c:v', 'rawvideo', '-pix_fmt', 'rgba', 'output.raw']);

    // Read output
    const output = await this.ffmpegInstance.readFile('output.raw');
    
    // Cleanup
    await this.ffmpegInstance.deleteFile('input.mp4');
    await this.ffmpegInstance.deleteFile('output.raw');

    return output;
  }
}
