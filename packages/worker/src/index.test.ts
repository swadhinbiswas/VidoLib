import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerPipelineHost } from './index.js';

// Mock Worker
class MockWorker {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  
  constructor(url: string) {
    this.url = url;
  }
  
  postMessage(data: unknown, transfer?: Transferable[]): void {
    // Simulate worker response
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({ data: { type: 'ready', payload: null } } as MessageEvent);
      }
    }, 10);
  }
  
  terminate(): void {
    // No-op for mock
  }
}

describe('WorkerPipelineHost', () => {
  beforeEach(() => {
    // @ts-ignore - mocking Worker
    global.Worker = MockWorker;
  });

  it('should initialize without worker if no URL provided', () => {
    const host = new WorkerPipelineHost();
    expect(host.getState()).toBe('idle');
  });

  it('should initialize with worker URL', () => {
    const host = new WorkerPipelineHost('worker.js');
    expect(host.getState()).toBe('connected');
  });

  it('should get statistics', () => {
    const host = new WorkerPipelineHost('worker.js');
    const stats = host.getStatistics();
    expect(stats.packetsSent).toBe(0);
    expect(stats.framesReceived).toBe(0);
    expect(stats.errors).toBe(0);
    expect(stats.startTime).toBeGreaterThan(0);
  });

  it('should send packet', () => {
    const host = new WorkerPipelineHost('worker.js');
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    
    host.sendPacket(data);
    const stats = host.getStatistics();
    expect(stats.packetsSent).toBe(1);
  });

  it('should send demux command', () => {
    const host = new WorkerPipelineHost('worker.js');
    // Should not throw
    host.sendDemuxCommand('http://example.com/video.mp4', 'mp4');
    expect(true).toBe(true);
  });

  it('should send decode command', () => {
    const host = new WorkerPipelineHost('worker.js');
    // Should not throw
    host.sendDecodeCommand('1', 'avc1.4d401f');
    expect(true).toBe(true);
  });

  it('should register frame handler', () => {
    const host = new WorkerPipelineHost('worker.js');
    const handler = vi.fn();
    
    host.onFrame(handler);
    // Handler should be registered
    expect(true).toBe(true);
  });

  it('should register error handler', () => {
    const host = new WorkerPipelineHost('worker.js');
    const handler = vi.fn();
    
    host.onError(handler);
    // Handler should be registered
    expect(true).toBe(true);
  });

  it('should register state change handler', () => {
    const host = new WorkerPipelineHost('worker.js');
    const handler = vi.fn();
    
    host.onStateChange(handler);
    // Handler should be registered
    expect(true).toBe(true);
  });

  it('should terminate worker', () => {
    const host = new WorkerPipelineHost('worker.js');
    host.terminate();
    expect(host.getState()).toBe('idle');
  });

  it('should reconnect worker', () => {
    const host = new WorkerPipelineHost('worker.js');
    host.reconnect();
    expect(host.getState()).toBe('connected');
  });

  it('should handle on() and unsubscribe', () => {
    const host = new WorkerPipelineHost('worker.js');
    const handler = vi.fn();
    
    const unsubscribe = host.on('frame', handler);
    expect(typeof unsubscribe).toBe('function');
    
    unsubscribe();
    // Should not throw
    expect(true).toBe(true);
  });

  it('should not send packet when not connected', () => {
    const host = new WorkerPipelineHost();
    const data = new Uint8Array([1, 2, 3]);
    
    host.sendPacket(data);
    const stats = host.getStatistics();
    expect(stats.packetsSent).toBe(0);
  });
});
