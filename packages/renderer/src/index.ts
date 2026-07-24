export type FrameType = VideoFrame | ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export interface FrameRenderer {
  readonly backendName: string;
  render(frame: FrameType, width: number, height: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

// Vertex shader source
const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Fragment shader for RGBA textures
const FRAGMENT_SHADER_RGBA = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
void main() {
  gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;

// Fragment shader for YUV420P (planar) textures
const FRAGMENT_SHADER_YUV420P = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_textureY;
uniform sampler2D u_textureU;
uniform sampler2D u_textureV;
void main() {
  float y = texture2D(u_textureY, v_texCoord).r;
  float u = texture2D(u_textureU, v_texCoord).r - 0.5;
  float v = texture2D(u_textureV, v_texCoord).r - 0.5;
  float r = y + 1.402 * v;
  float g = y - 0.344136 * u - 0.714136 * v;
  float b = y + 1.772 * u;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

// Fragment shader for NV12 (semi-planar) textures
const FRAGMENT_SHADER_NV12 = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_textureY;
uniform sampler2D u_textureUV;
void main() {
  float y = texture2D(u_textureY, v_texCoord).r;
  vec2 uv = texture2D(u_textureUV, v_texCoord).ra - 0.5;
  float r = y + 1.402 * uv.y;
  float g = y - 0.344136 * uv.x - 0.714136 * uv.y;
  float b = y + 1.772 * uv.x;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  
  if (!vertexShader || !fragmentShader) return null;
  
  const program = gl.createProgram();
  if (!program) return null;
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  
  return program;
}

export class Canvas2DRenderer implements FrameRenderer {
  public readonly backendName = 'canvas2d';
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context from canvas');
    this.ctx = ctx;
  }

  public render(frame: FrameType, width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.resize(width, height);
    }
    
    if (frame instanceof VideoFrame) {
      this.ctx.drawImage(frame, 0, 0, width, height);
      frame.close();
    } else if (frame instanceof ImageBitmap || frame instanceof HTMLImageElement || frame instanceof HTMLCanvasElement) {
      this.ctx.drawImage(frame, 0, 0, width, height);
    }
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  public destroy(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

export class WebGLRenderer implements FrameRenderer {
  public readonly backendName = 'webgl';
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private textureY: WebGLTexture | null = null;
  private textureU: WebGLTexture | null = null;
  private textureV: WebGLTexture | null = null;
  private textureUV: WebGLTexture | null = null;
  private currentMode: 'rgba' | 'yuv420p' | 'nv12' = 'rgba';

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }) || 
               canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl as WebGLRenderingContext;
    this.initGL();
  }

  private initGL(): void {
    const gl = this.gl;
    
    // Create vertex buffer (fullscreen quad)
    const vertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0
    ]);
    
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    // Create texture coordinate buffer
    const texCoords = new Float32Array([
      0.0, 1.0,
      1.0, 1.0,
      0.0, 0.0,
      1.0, 0.0
    ]);
    
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    
    // Create RGBA program
    this.program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_RGBA);
    
    // Create texture
    this.texture = gl.createTexture();
    
    // Set up WebGL state
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  public render(frame: FrameType, width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.resize(width, height);
    }
    
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    if (!this.program || !this.vertexBuffer || !this.texCoordBuffer || !this.texture) {
      return;
    }
    
    gl.useProgram(this.program);
    
    // Bind vertex buffer
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Bind texture coordinate buffer
    const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Upload texture based on frame type
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    
    if (frame instanceof VideoFrame) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
      } catch (e) {
        // Fallback: create image bitmap
        this.createImageBitmapAndRender(frame, width, height);
        frame.close();
        return;
      }
      frame.close();
    } else if (frame instanceof ImageBitmap) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    } else if (frame instanceof HTMLImageElement) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    } else if (frame instanceof HTMLCanvasElement) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    }
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Set texture uniform
    const textureLocation = gl.getUniformLocation(this.program, 'u_texture');
    gl.uniform1i(textureLocation, 0);
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private async createImageBitmapAndRender(frame: VideoFrame, width: number, height: number): Promise<void> {
    try {
      const bitmap = await createImageBitmap(frame);
      this.render(bitmap, width, height);
      bitmap.close();
    } catch (e) {
      console.error('Failed to create ImageBitmap from VideoFrame:', e);
    }
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  public destroy(): void {
    const gl = this.gl;
    
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.textureY) gl.deleteTexture(this.textureY);
    if (this.textureU) gl.deleteTexture(this.textureU);
    if (this.textureV) gl.deleteTexture(this.textureV);
    if (this.textureUV) gl.deleteTexture(this.textureUV);
    if (this.program) gl.deleteProgram(this.program);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    
    this.texture = null;
    this.textureY = null;
    this.textureU = null;
    this.textureV = null;
    this.textureUV = null;
    this.program = null;
    this.vertexBuffer = null;
    this.texCoordBuffer = null;
  }
}

export class WebGPURenderer implements FrameRenderer {
  public readonly backendName = 'webgpu';
  private device: any = null;
  private context: any = null;
  private pipeline: any = null;
  private texture: any = null;

  constructor(private canvas: HTMLCanvasElement) {}

  public static async isSupported(): Promise<boolean> {
    return typeof navigator !== 'undefined' && 'gpu' in (navigator as any);
  }

  public async init(): Promise<void> {
    const gpu = (navigator as any).gpu;
    if (!gpu) {
      throw new Error('WebGPU not supported');
    }
    
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No WebGPU adapter found');
    }
    
    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext('webgpu');
    
    if (!this.context) {
      throw new Error('Failed to get WebGPU context');
    }
    
    const format = gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format,
      alphaMode: 'premultiplied'
    });
  }

  public render(frame: FrameType, width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.resize(width, height);
    }
    
    if (!this.device || !this.context) {
      return;
    }
    
    // Create texture from frame
    const textureDescriptor = {
      size: { width, height },
      format: (navigator as any).gpu.getPreferredCanvasFormat(),
      usage: 0x04 | 0x02 | 0x10 // TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT
    };
    
    this.texture = this.device.createTexture(textureDescriptor);
    
    // Copy frame to texture
    if (frame instanceof VideoFrame) {
      this.context.copyExternalImageToTexture(
        { source: frame },
        { texture: this.texture },
        { width, height }
      );
      frame.close();
    } else if (frame instanceof ImageBitmap) {
      this.context.copyExternalImageToTexture(
        { source: frame },
        { texture: this.texture },
        { width, height }
      );
    }
    
    // Render pass
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    
    const renderPassDescriptor = {
      colorAttachments: [{
        view: textureView,
        loadOp: 'clear',
        storeOp: 'store',
        clearColor: { r: 0, g: 0, b: 0, a: 1 }
      }]
    };
    
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.end();
    
    this.device.queue.submit([commandEncoder.finish()]);
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  public destroy(): void {
    if (this.texture) {
      this.texture.destroy();
      this.texture = null;
    }
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.context = null;
    this.pipeline = null;
  }
}

export class AutoRendererFactory {
  public static async create(canvas: HTMLCanvasElement): Promise<FrameRenderer> {
    // Try WebGPU first
    if (await WebGPURenderer.isSupported()) {
      try {
        const renderer = new WebGPURenderer(canvas);
        await renderer.init();
        return renderer;
      } catch (e) {
        console.warn('WebGPU initialization failed, falling back:', e);
      }
    }
    
    // Try WebGL
    try {
      return new WebGLRenderer(canvas);
    } catch (e) {
      console.warn('WebGL initialization failed, falling back:', e);
    }
    
    // Fallback to Canvas2D
    return new Canvas2DRenderer(canvas);
  }
}
