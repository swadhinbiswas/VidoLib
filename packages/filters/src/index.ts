export interface VideoFilterSettings {
  brightness?: number; // 0.0 to 2.0 (default 1.0)
  contrast?: number;   // 0.0 to 2.0 (default 1.0)
  saturate?: number;   // 0.0 to 2.0 (default 1.0)
  blurPx?: number;     // 0 to 20
  chromaKeyGreen?: boolean; // Green screen removal
  chromaKeyTolerance?: number; // 0.0 to 1.0 (default 0.3)
  chromaKeySoftness?: number; // 0.0 to 1.0 (default 0.1)
}

export type FilterPreset = 'grayscale' | 'sepia' | 'invert' | 'vintage' | 'cool' | 'warm';

export class VideoFilterProcessor {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for VideoFilterProcessor');
    this.ctx = ctx;
  }

  public applyFilters(imageSource: CanvasImageSource, settings: VideoFilterSettings): void {
    const filters: string[] = [];

    if (settings.brightness !== undefined) filters.push(`brightness(${settings.brightness})`);
    if (settings.contrast !== undefined) filters.push(`contrast(${settings.contrast})`);
    if (settings.saturate !== undefined) filters.push(`saturate(${settings.saturate})`);
    if (settings.blurPx !== undefined && settings.blurPx > 0) filters.push(`blur(${settings.blurPx}px)`);

    this.ctx.filter = filters.length > 0 ? filters.join(' ') : 'none';
    this.ctx.drawImage(imageSource, 0, 0, this.canvas.width, this.canvas.height);

    if (settings.chromaKeyGreen) {
      const tolerance = settings.chromaKeyTolerance ?? 0.3;
      const softness = settings.chromaKeySoftness ?? 0.1;
      this.removeGreenScreen(tolerance, softness);
    }
  }

  public applyPreset(preset: FilterPreset): void {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;

    switch (preset) {
      case 'grayscale':
        this.applyGrayscale(data);
        break;
      case 'sepia':
        this.applySepia(data);
        break;
      case 'invert':
        this.applyInvert(data);
        break;
      case 'vintage':
        this.applyVintage(data);
        break;
      case 'cool':
        this.applyCool(data);
        break;
      case 'warm':
        this.applyWarm(data);
        break;
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  private applyGrayscale(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }
  }

  private applySepia(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    }
  }

  private applyInvert(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  private applyVintage(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      data[i] = Math.min(255, r * 0.6 + g * 0.3 + b * 0.1 + 20);
      data[i + 1] = Math.min(255, r * 0.1 + g * 0.7 + b * 0.2);
      data[i + 2] = Math.min(255, r * 0.1 + g * 0.2 + b * 0.7 - 10);
    }
  }

  private applyCool(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, data[i] - 10);
      data[i + 2] = Math.min(255, data[i + 2] + 20);
    }
  }

  private applyWarm(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] + 15);
      data[i + 2] = Math.max(0, data[i + 2] - 10);
    }
  }

  public addWatermark(
    watermarkText: string, 
    position: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left' | 'center' = 'bottom-right',
    options?: { fontSize?: number; fontFamily?: string; color?: string; opacity?: number }
  ): void {
    this.ctx.save();
    
    const fontSize = options?.fontSize ?? 18;
    const fontFamily = options?.fontFamily ?? 'sans-serif';
    const color = options?.color ?? 'rgba(255, 255, 255, 0.75)';
    const opacity = options?.opacity ?? 0.75;
    
    this.ctx.font = `bold ${fontSize}px ${fontFamily}`;
    this.ctx.fillStyle = color.replace(/[\d.]+\)$/, `${opacity})`);
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    this.ctx.shadowBlur = 4;

    const metrics = this.ctx.measureText(watermarkText);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    let x: number;
    let y: number;

    switch (position) {
      case 'top-left':
        x = 20;
        y = 30;
        break;
      case 'top-right':
        x = this.canvas.width - textWidth - 20;
        y = 30;
        break;
      case 'bottom-left':
        x = 20;
        y = this.canvas.height - 20;
        break;
      case 'center':
        x = (this.canvas.width - textWidth) / 2;
        y = (this.canvas.height + textHeight) / 2;
        break;
      case 'bottom-right':
      default:
        x = this.canvas.width - textWidth - 20;
        y = this.canvas.height - 20;
        break;
    }

    this.ctx.fillText(watermarkText, x, y);
    this.ctx.restore();
  }

  public invertColors(): void {
    this.applyPreset('invert');
  }

  public grayscale(): void {
    this.applyPreset('grayscale');
  }

  public sepia(): void {
    this.applyPreset('sepia');
  }

  private removeGreenScreen(tolerance: number = 0.3, softness: number = 0.1): void {
    const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imgData.data;

    // Reference green color (pure green)
    const refR = 0;
    const refG = 255;
    const refB = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Calculate color distance from green
      const dr = (r - refR) / 255;
      const dg = (g - refG) / 255;
      const db = (b - refB) / 255;
      
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);

      if (distance < tolerance) {
        // Hard key: fully transparent
        data[i + 3] = 0;
      } else if (distance < tolerance + softness) {
        // Soft key: partial transparency for smooth edges
        const alpha = Math.floor(255 * ((distance - tolerance) / softness));
        data[i + 3] = Math.min(data[i + 3], alpha);
      }
    }

    this.ctx.putImageData(imgData, 0, 0);
  }
}
