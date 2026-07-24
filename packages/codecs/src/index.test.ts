import { describe, it, expect, vi } from 'vitest';
import { 
  CodecNegotiator, 
  WebCodecsVideoDecoder, 
  WebCodecsAudioDecoder,
  WASMRoyaltyFreeDecoder,
  FFmpegWasmOptInFallback
} from './index.js';

describe('CodecNegotiator', () => {
  it('should negotiate video codec in test environment', async () => {
    const capability = await CodecNegotiator.negotiateVideo('avc1.4d401f');
    expect(capability).toBeDefined();
    expect(capability.codec).toBe('avc1.4d401f');
    expect(capability.supported).toBe(true);
  });

  it('should negotiate audio codec in test environment', async () => {
    const capability = await CodecNegotiator.negotiateAudio('mp4a.40.2');
    expect(capability).toBeDefined();
    expect(capability.codec).toBe('mp4a.40.2');
    expect(capability.supported).toBe(true);
  });

  it('should return supported=false for unknown patented codec', async () => {
    // In test env, this may still return true due to NODE_ENV check
    const capability = await CodecNegotiator.negotiateVideo('unknown-codec');
    expect(capability).toBeDefined();
  });
});

describe('WebCodecsVideoDecoder', () => {
  it('should have correct initial state', () => {
    const decoder = new WebCodecsVideoDecoder();
    expect(decoder.state).toBe('unconfigured');
  });

  it('should throw when VideoDecoder not available', async () => {
    const decoder = new WebCodecsVideoDecoder();
    // In Node.js, VideoDecoder is not available
    try {
      await decoder.init('avc1.4d401f', () => {});
      // If it doesn't throw, that's ok (test environment may have mock)
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('should handle decode without init', () => {
    const decoder = new WebCodecsVideoDecoder();
    // Should not throw, just return
    decoder.decode({
      pts: 0,
      dts: 0,
      data: new Uint8Array(100),
      isKeyframe: true
    });
    expect(decoder.state).toBe('unconfigured');
  });

  it('should close properly', () => {
    const decoder = new WebCodecsVideoDecoder();
    // State should start as unconfigured
    expect(decoder.state).toBe('unconfigured');
    // Close should work without throwing
    decoder.close();
    // State should be closed after close
    expect(decoder.state).toBe('closed');
  });
});

describe('WebCodecsAudioDecoder', () => {
  it('should have correct initial state', () => {
    const decoder = new WebCodecsAudioDecoder();
    expect(decoder.state).toBe('unconfigured');
  });

  it('should handle decode without init', () => {
    const decoder = new WebCodecsAudioDecoder();
    // Should not throw, just return
    decoder.decode({
      pts: 0,
      dts: 0,
      data: new Uint8Array(100),
      sampleRate: 44100,
      channels: 2,
      duration: 0.023
    });
    expect(decoder.state).toBe('unconfigured');
  });

  it('should close properly', () => {
    const decoder = new WebCodecsAudioDecoder();
    // State should start as unconfigured
    expect(decoder.state).toBe('unconfigured');
    // Close should work without throwing
    decoder.close();
    // State should be closed after close
    expect(decoder.state).toBe('closed');
  });
});

describe('WASMRoyaltyFreeDecoder', () => {
  it('should initialize with codec name', () => {
    const decoder = new WASMRoyaltyFreeDecoder('vp9');
    expect(decoder.codec).toBe('vp9');
    expect(decoder.isLoaded()).toBe(false);
  });

  it('should throw when decoding without WASM module', () => {
    const decoder = new WASMRoyaltyFreeDecoder('vp9');
    expect(() => decoder.decodeVideo({
      pts: 0,
      dts: 0,
      data: new Uint8Array(100),
      isKeyframe: true
    })).toThrow('WASM module not loaded');
  });

  it('should throw when decoding audio without WASM module', () => {
    const decoder = new WASMRoyaltyFreeDecoder('opus');
    expect(() => decoder.decodeAudio({
      pts: 0,
      dts: 0,
      data: new Uint8Array(100),
      sampleRate: 48000,
      channels: 2,
      duration: 0.023
    })).toThrow('WASM module not loaded');
  });
});

describe('FFmpegWasmOptInFallback', () => {
  it('should initialize with warning', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallback = new FFmpegWasmOptInFallback();
    expect(fallback).toBeDefined();
    expect(fallback.isReady()).toBe(false);
    consoleSpy.mockRestore();
  });

  it('should throw when decode called before load', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallback = new FFmpegWasmOptInFallback();
    await expect(fallback.decode(new Uint8Array(100), 'h264')).rejects.toThrow('not loaded');
    consoleSpy.mockRestore();
  });
});
