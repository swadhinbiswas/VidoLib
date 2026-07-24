import { describe, it, expect, vi } from 'vitest';
import { VideoFilterProcessor } from './index.js';

// Mock CanvasRenderingContext2D
function createMockContext(): CanvasRenderingContext2D {
  return {
    canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
    filter: 'none',
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(1920 * 1080 * 4),
      width: 1920,
      height: 1080
    })),
    putImageData: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    measureText: vi.fn(() => ({ width: 100 })),
    fillText: vi.fn(),
    strokeText: vi.fn()
  } as unknown as CanvasRenderingContext2D;
}

// Mock HTMLCanvasElement
function createMockCanvas(): HTMLCanvasElement {
  const mockCtx = createMockContext();
  return {
    width: 1920,
    height: 1080,
    getContext: vi.fn(() => mockCtx),
    style: {}
  } as unknown as HTMLCanvasElement;
}

describe('VideoFilterProcessor', () => {
  it('should initialize with canvas', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    expect(processor).toBeDefined();
  });

  it('should throw if 2D context not available', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => null),
      style: {}
    } as unknown as HTMLCanvasElement;
    
    expect(() => new VideoFilterProcessor(canvas)).toThrow('Failed to get 2D context');
  });

  it('should apply filters', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    const mockImage = {} as CanvasImageSource;
    processor.applyFilters(mockImage, {
      brightness: 1.2,
      contrast: 1.1,
      saturate: 1.0,
      blurPx: 2
    });
    
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.filter).toContain('brightness');
    expect(ctx.filter).toContain('contrast');
    expect(ctx.filter).toContain('blur');
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('should apply chroma key filter', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    const mockImage = {} as CanvasImageSource;
    processor.applyFilters(mockImage, {
      chromaKeyGreen: true,
      chromaKeyTolerance: 0.3,
      chromaKeySoftness: 0.1
    });
    
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.getImageData).toHaveBeenCalled();
    expect(ctx.putImageData).toHaveBeenCalled();
  });

  it('should apply preset filters', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.applyPreset('grayscale');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.getImageData).toHaveBeenCalled();
    expect(ctx.putImageData).toHaveBeenCalled();
  });

  it('should apply sepia preset', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.applyPreset('sepia');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.getImageData).toHaveBeenCalled();
  });

  it('should apply invert preset', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.applyPreset('invert');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.getImageData).toHaveBeenCalled();
  });

  it('should add watermark', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.addWatermark('Test Watermark', 'bottom-right');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('should add watermark at different positions', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.addWatermark('Test', 'top-left');
    processor.addWatermark('Test', 'center');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
  });

  it('should call invertColors', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.invertColors();
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.getImageData).toHaveBeenCalled();
  });

  it('should call grayscale', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.grayscale();
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.getImageData).toHaveBeenCalled();
  });

  it('should call sepia', () => {
    const canvas = createMockCanvas();
    const processor = new VideoFilterProcessor(canvas);
    
    processor.sepia();
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    expect(ctx.getImageData).toHaveBeenCalled();
  });
});
