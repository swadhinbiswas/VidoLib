export interface WorkerMessage<T = unknown> {
  type: 'demux' | 'decode' | 'packet' | 'frame' | 'error' | 'ready' | 'stats';
  payload: T;
  id?: string;
}

export interface WorkerStatistics {
  packetsSent: number;
  framesReceived: number;
  errors: number;
  startTime: number;
}

export type WorkerState = 'idle' | 'connected' | 'error';

export class WorkerPipelineHost {
  private worker?: Worker;
  private state: WorkerState = 'idle';
  private stats: WorkerStatistics = {
    packetsSent: 0,
    framesReceived: 0,
    errors: 0,
    startTime: Date.now()
  };
  private handlers: Map<string, Set<(payload: unknown) => void>> = new Map();
  private errorHandler?: (error: { type: string; message: string; stack?: string }) => void;
  private stateHandler?: (state: WorkerState) => void;
  private workerScriptUrl?: string;

  constructor(workerScriptUrl?: string) {
    this.workerScriptUrl = workerScriptUrl;
    if (typeof Worker !== 'undefined' && workerScriptUrl) {
      this.connect();
    }
  }

  private connect(): void {
    if (!this.workerScriptUrl) return;
    
    try {
      this.worker = new Worker(this.workerScriptUrl, { type: 'module' });
      
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type, payload, id } = event.data;
        
        if (type === 'frame') {
          this.stats.framesReceived++;
        } else if (type === 'error') {
          this.stats.errors++;
          if (this.errorHandler) {
            this.errorHandler(payload as { type: string; message: string; stack?: string });
          }
        } else if (type === 'ready') {
          this.state = 'connected';
          if (this.stateHandler) {
            this.stateHandler(this.state);
          }
        } else if (type === 'stats') {
          // Handle stats updates
        }
        
        // Call registered handlers
        const typeHandlers = this.handlers.get(type);
        if (typeHandlers) {
          for (const handler of typeHandlers) {
            handler(payload);
          }
        }
      };
      
      this.worker.onerror = (event) => {
        this.state = 'error';
        this.stats.errors++;
        
        if (this.errorHandler) {
          this.errorHandler({
            type: 'worker-error',
            message: event.message || 'Unknown worker error',
            stack: undefined
          });
        }
        
        if (this.stateHandler) {
          this.stateHandler(this.state);
        }
      };
      
      this.state = 'connected';
    } catch (error) {
      this.state = 'error';
      if (this.stateHandler) {
        this.stateHandler(this.state);
      }
    }
  }

  public sendPacket(packetData: Uint8Array, transfer: boolean = true): void {
    if (!this.worker || this.state !== 'connected') return;
    
    const message: WorkerMessage<{ data: Uint8Array }> = {
      type: 'packet',
      payload: { data: packetData }
    };
    
    if (transfer && packetData.buffer instanceof ArrayBuffer) {
      this.worker.postMessage(message, [packetData.buffer]);
    } else {
      this.worker.postMessage(message);
    }
    
    this.stats.packetsSent++;
  }

  public sendDemuxCommand(sourceUrl: string, format?: string): void {
    if (!this.worker || this.state !== 'connected') return;
    
    const message: WorkerMessage<{ sourceUrl: string; format?: string }> = {
      type: 'demux',
      payload: { sourceUrl, format }
    };
    
    this.worker.postMessage(message);
  }

  public sendDecodeCommand(trackId: string, codec: string): void {
    if (!this.worker || this.state !== 'connected') return;
    
    const message: WorkerMessage<{ trackId: string; codec: string }> = {
      type: 'decode',
      payload: { trackId, codec }
    };
    
    this.worker.postMessage(message);
  }

  public onFrame(handler: (frame: unknown) => void): void {
    this.on('frame', handler);
  }

  public on(type: string, handler: (payload: unknown) => void): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  public onError(handler: (error: { type: string; message: string; stack?: string }) => void): void {
    this.errorHandler = handler;
  }

  public onStateChange(handler: (state: WorkerState) => void): void {
    this.stateHandler = handler;
  }

  public getState(): WorkerState {
    return this.state;
  }

  public getStatistics(): WorkerStatistics {
    return { ...this.stats };
  }

  public reconnect(): void {
    this.terminate();
    this.state = 'idle';
    this.connect();
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
      this.state = 'idle';
    }
  }
}

// Worker-side consumer code
export function createWorkerHandler(): (event: MessageEvent<WorkerMessage>) => void {
  return (event: MessageEvent<WorkerMessage>) => {
    const { type, payload } = event.data;
    
    switch (type) {
      case 'demux':
        handleDemux(payload as { sourceUrl: string; format?: string });
        break;
      case 'decode':
        handleDecode(payload as { trackId: string; codec: string });
        break;
      case 'packet':
        handlePacket(payload as { data: Uint8Array });
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  };
}

function handleDemux(payload: { sourceUrl: string; format?: string }): void {
  // TODO: Implement demux handling
  // This would use ContainerRegistry to demux the source
  console.log('Demux command received:', payload);
}

function handleDecode(payload: { trackId: string; codec: string }): void {
  // TODO: Implement decode handling
  // This would use CodecNegotiator and WebCodecsVideoDecoder
  console.log('Decode command received:', payload);
}

function handlePacket(payload: { data: Uint8Array }): void {
  // TODO: Implement packet handling
  // This would process the packet data
  console.log('Packet received:', payload.data.length, 'bytes');
}

// Setup worker self message handler
if (typeof self !== 'undefined' && typeof (self as any).onmessage !== 'undefined') {
  (self as any).onmessage = createWorkerHandler();
}
