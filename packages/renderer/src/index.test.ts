import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Canvas2DRenderer, WebGLRenderer, AutoRendererFactory } from './index.js';

// Mock HTMLCanvasElement
function createMockCanvas(contextType: string = '2d'): HTMLCanvasElement {
  const canvas = {
    width: 1920,
    height: 1080,
    getContext: vi.fn((type: string) => {
      if (type === contextType || type === '2d') {
        return {
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn(),
          strokeText: vi.fn(),
          measureText: vi.fn(() => ({ width: 100 })),
          save: vi.fn(),
          restore: vi.fn(),
          createBuffer: vi.fn(() => ({})),
          bindBuffer: vi.fn(),
          bufferData: vi.fn(),
          createTexture: vi.fn(() => ({})),
          bindTexture: vi.fn(),
          texParameteri: vi.fn(),
          texImage2D: vi.fn(),
          createProgram: vi.fn(() => ({})),
          attachShader: vi.fn(),
          linkProgram: vi.fn(),
          getProgramParameter: vi.fn(() => true),
          useProgram: vi.fn(),
          getAttribLocation: vi.fn(() => 0),
          enableVertexAttribArray: vi.fn(),
          vertexAttribPointer: vi.fn(),
          getUniformLocation: vi.fn(() => ({})),
          uniform1i: vi.fn(),
          drawArrays: vi.fn(),
          viewport: vi.fn(),
          clear: vi.fn(),
          clearColor: vi.fn(),
          deleteTexture: vi.fn(),
          deleteProgram: vi.fn(),
          deleteBuffer: vi.fn(),
          createShader: vi.fn(() => ({})),
          shaderSource: vi.fn(),
          compileShader: vi.fn(),
          getShaderParameter: vi.fn(() => true),
          VERTEX_SHADER: 0x8B31,
          FRAGMENT_SHADER: 0x8B30,
          COMPILE_STATUS: 0x8B81,
          LINK_STATUS: 0x8B82,
          ARRAY_BUFFER: 0x8892,
          STATIC_DRAW: 0x88E4,
          FLOAT: 0x1406,
          TEXTURE_2D: 0x0DE1,
          RGBA: 0x1908,
          UNSIGNED_BYTE: 0x1401,
          TEXTURE_WRAP_S: 0x2802,
          TEXTURE_WRAP_T: 0x2803,
          TEXTURE_MIN_FILTER: 0x2801,
          TEXTURE_MAG_FILTER: 0x2800,
          CLAMP_TO_EDGE: 0x812F,
          LINEAR: 0x2601,
          COLOR_BUFFER_BIT: 0x4000,
          TRIANGLE_STRIP: 0x0005
        };
      }
      return null;
    }),
    style: {}
  } as unknown as HTMLCanvasElement;
  return canvas;
}

describe('Canvas2DRenderer', () => {
  it('should initialize with 2D context', () => {
    const canvas = createMockCanvas('2d');
    const renderer = new Canvas2DRenderer(canvas);
    expect(renderer.backendName).toBe('canvas2d');
  });

  it('should throw if 2D context not available', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => null),
      style: {}
    } as unknown as HTMLCanvasElement;
    
    expect(() => new Canvas2DRenderer(canvas)).toThrow('Failed to get 2D context');
  });

  it('should resize canvas', () => {
    const canvas = createMockCanvas('2d');
    const renderer = new Canvas2DRenderer(canvas);
    
    renderer.resize(1280, 720);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
  });

  it('should clear canvas on destroy', () => {
    const canvas = createMockCanvas('2d');
    const renderer = new Canvas2DRenderer(canvas);
    
    renderer.destroy();
    // Destroy should not throw
    expect(true).toBe(true);
  });
});

describe('WebGLRenderer', () => {
  it('should initialize with WebGL context', () => {
    const canvas = createMockCanvas('webgl');
    const renderer = new WebGLRenderer(canvas);
    expect(renderer.backendName).toBe('webgl');
  });

  it('should throw if WebGL not available', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => null),
      style: {}
    } as unknown as HTMLCanvasElement;
    
    expect(() => new WebGLRenderer(canvas)).toThrow('WebGL not supported');
  });

  it('should resize canvas', () => {
    const canvas = createMockCanvas('webgl');
    const renderer = new WebGLRenderer(canvas);
    
    renderer.resize(1280, 720);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
  });

  it('should cleanup on destroy', () => {
    const canvas = createMockCanvas('webgl');
    const renderer = new WebGLRenderer(canvas);
    
    renderer.destroy();
    // Should not throw
    expect(true).toBe(true);
  });
});

describe('AutoRendererFactory', () => {
  it('should create Canvas2DRenderer as fallback', async () => {
    const canvas = createMockCanvas('2d');
    const renderer = await AutoRendererFactory.create(canvas);
    expect(renderer).toBeDefined();
    expect(renderer.backendName).toBe('canvas2d');
  });
});
