import { SubtitlePacket } from '@vidolib/core';

export interface SubtitleStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

export class SRTParser {
  public static parse(srtText: string): SubtitlePacket[] {
    const packets: SubtitlePacket[] = [];
    const blocks = srtText.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 3) continue;
      const timeLine = lines[1];
      const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      if (match) {
        const startTime = this.parseTimestamp(match[1]);
        const endTime = this.parseTimestamp(match[2]);
        const text = lines.slice(2).join('\n');
        packets.push({ startTime, endTime, text });
      }
    }
    return packets;
  }

  public static parseTimestamp(ts: string): number {
    const parts = ts.replace(',', '.').split(':');
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  }
}

export interface VTTCue {
  id?: string;
  startTime: number;
  endTime: number;
  text: string;
  settings?: string;
}

export class VTTParser {
  public static parse(vttText: string): SubtitlePacket[] {
    const packets: SubtitlePacket[] = [];
    const lines = vttText.split('\n');
    
    // Skip WEBVTT header
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        startIndex = i + 1;
        break;
      }
    }
    
    // Parse cues
    let currentCue: Partial<VTTCue> = {};
    let cueLines: string[] = [];
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip NOTE blocks
      if (line.startsWith('NOTE')) {
        while (i < lines.length && lines[i].trim() !== '') {
          i++;
        }
        continue;
      }
      
      // Skip STYLE blocks
      if (line.startsWith('STYLE')) {
        while (i < lines.length && lines[i].trim() !== '') {
          i++;
        }
        continue;
      }
      
      if (line === '') {
        // End of cue
        if (currentCue.startTime !== undefined && currentCue.endTime !== undefined && cueLines.length > 0) {
          packets.push({
            startTime: currentCue.startTime,
            endTime: currentCue.endTime,
            text: cueLines.join('\n'),
            styledMarkup: currentCue.settings
          });
        }
        currentCue = {};
        cueLines = [];
      } else if (line.includes('-->')) {
        // Timestamp line
        const match = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})(?:\s+(.+))?/);
        if (match) {
          currentCue.startTime = SRTParser.parseTimestamp(match[1]);
          currentCue.endTime = SRTParser.parseTimestamp(match[2]);
          currentCue.settings = match[3] || '';
        }
      } else if (!currentCue.startTime) {
        // Cue identifier
        currentCue.id = line;
      } else {
        // Cue text
        cueLines.push(line);
      }
    }
    
    // Don't forget the last cue
    if (currentCue.startTime !== undefined && currentCue.endTime !== undefined && cueLines.length > 0) {
      packets.push({
        startTime: currentCue.startTime,
        endTime: currentCue.endTime,
        text: cueLines.join('\n'),
        styledMarkup: currentCue.settings
      });
    }
    
    return packets;
  }
}

export interface ASSStyle {
  name: string;
  fontName: string;
  fontSize: number;
  primaryColor: string;
  secondaryColor: string;
  outlineColor: string;
  backColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  scaleX: number;
  scaleY: number;
  angle: number;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  encoding: number;
}

export interface ASSInfo {
  playResX: number;
  playResY: number;
  styles: Map<string, ASSStyle>;
}

export class ASSParser {
  private static defaultStyle: ASSStyle = {
    name: 'Default',
    fontName: 'Arial',
    fontSize: 20,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H000000FF',
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    bold: false,
    italic: false,
    underline: false,
    scaleX: 100,
    scaleY: 100,
    angle: 0,
    borderStyle: 1,
    outline: 1,
    shadow: 0,
    alignment: 2,
    marginL: 10,
    marginR: 10,
    marginV: 10,
    encoding: 1
  };

  public static parse(assText: string): SubtitlePacket[] {
    const packets: SubtitlePacket[] = [];
    const lines = assText.split('\n');
    
    let currentSection = '';
    let styles: Map<string, ASSStyle> = new Map();
    let playResX = 1920;
    let playResY = 1080;
    
    // First pass: parse script info and styles
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }
      
      if (currentSection === 'Script Info') {
        if (trimmed.startsWith('PlayResX:')) {
          playResX = parseInt(trimmed.split(':')[1].trim()) || 1920;
        } else if (trimmed.startsWith('PlayResY:')) {
          playResY = parseInt(trimmed.split(':')[1].trim()) || 1080;
        }
      } else if (currentSection === 'V4+ Styles') {
        if (trimmed.startsWith('Style:')) {
          const style = this.parseStyleLine(trimmed);
          if (style) {
            styles.set(style.name, style);
          }
        }
      }
    }
    
    // Second pass: parse dialogue
    currentSection = '';
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }
      
      if (currentSection === 'Events' && trimmed.startsWith('Dialogue:')) {
        const packet = this.parseDialogueLine(trimmed, styles);
        if (packet) {
          packets.push(packet);
        }
      }
    }
    
    return packets;
  }
  
  private static parseStyleLine(line: string): ASSStyle | null {
    const parts = line.substring(6).split(',');
    if (parts.length < 23) return null;
    
    return {
      name: parts[0].trim(),
      fontName: parts[1].trim(),
      fontSize: parseFloat(parts[2]) || 20,
      primaryColor: parts[3].trim(),
      secondaryColor: parts[4].trim(),
      outlineColor: parts[5].trim(),
      backColor: parts[6].trim(),
      bold: parts[7].trim() === '-1',
      italic: parts[8].trim() === '-1',
      underline: parts[9].trim() === '-1',
      strikeout: parts[10].trim() === '-1',
      scaleX: parseFloat(parts[11]) || 100,
      scaleY: parseFloat(parts[12]) || 100,
      angle: parseFloat(parts[13]) || 0,
      borderStyle: parseInt(parts[14]) || 1,
      outline: parseFloat(parts[15]) || 1,
      shadow: parseFloat(parts[16]) || 0,
      alignment: parseInt(parts[17]) || 2,
      marginL: parseInt(parts[18]) || 0,
      marginR: parseInt(parts[19]) || 0,
      marginV: parseInt(parts[20]) || 0,
      encoding: parseInt(parts[21]) || 1
    } as ASSStyle;
  }
  
  private static parseDialogueLine(line: string, styles: Map<string, ASSStyle>): SubtitlePacket | null {
    const parts = line.substring(9).split(',');
    if (parts.length < 10) return null;
    
    const startTime = this.parseTimestamp(parts[1].trim());
    const endTime = this.parseTimestamp(parts[2].trim());
    const styleName = parts[3].trim();
    const rawText = parts.slice(9).join(',');
    
    const style = styles.get(styleName) || styles.get('Default') || this.defaultStyle;
    
    // Extract positioning from override tags
    let position: { x: number; y: number } | undefined;
    const posMatch = rawText.match(/\\pos\((\d+),(\d+)\)/);
    if (posMatch) {
      position = { x: parseInt(posMatch[1]), y: parseInt(posMatch[2]) };
    }
    
    // Clean text from override tags
    const cleanText = rawText.replace(/\{[^}]+\}/g, '');
    
    return {
      startTime,
      endTime,
      text: cleanText,
      styledMarkup: rawText
    };
  }
  
  public static parseTimestamp(ts: string): number {
    const parts = ts.split(':');
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  
  public static getASSInfo(assText: string): ASSInfo {
    const lines = assText.split('\n');
    let playResX = 1920;
    let playResY = 1080;
    const styles = new Map<string, ASSStyle>();
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }
      
      if (currentSection === 'Script Info') {
        if (trimmed.startsWith('PlayResX:')) {
          playResX = parseInt(trimmed.split(':')[1].trim()) || 1920;
        } else if (trimmed.startsWith('PlayResY:')) {
          playResY = parseInt(trimmed.split(':')[1].trim()) || 1080;
        }
      } else if (currentSection === 'V4+ Styles' && trimmed.startsWith('Style:')) {
        const style = this.parseStyleLine(trimmed);
        if (style) {
          styles.set(style.name, style);
        }
      }
    }
    
    return { playResX, playResY, styles };
  }
}

export class SubtitleRenderer {
  private ctx: CanvasRenderingContext2D;
  private style: SubtitleStyle;

  constructor(canvas: HTMLCanvasElement, style?: SubtitleStyle) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for SubtitleRenderer');
    this.ctx = ctx;
    this.style = style || {};
  }

  public setStyle(style: SubtitleStyle): void {
    this.style = style;
  }

  public renderSubtitles(packets: SubtitlePacket[], currentTimeSeconds: number, canvasWidth?: number, canvasHeight?: number): void {
    const width = canvasWidth || this.ctx.canvas.width;
    const height = canvasHeight || this.ctx.canvas.height;
    
    this.ctx.clearRect(0, 0, width, height);

    const active = packets.filter(p => currentTimeSeconds >= p.startTime && currentTimeSeconds <= p.endTime);
    if (active.length === 0) return;

    const fontSize = this.style.fontSize || 24;
    const fontFamily = this.style.fontFamily || 'sans-serif';
    const color = this.style.color || '#FFFFFF';
    const outlineColor = this.style.outlineColor || '#000000';
    const outlineWidth = this.style.outlineWidth || 3;
    
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = outlineColor;
    this.ctx.lineWidth = outlineWidth;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';

    let y = height - 40;
    for (const sub of active) {
      const text = sub.text;
      
      // Draw background if specified
      if (this.style.backgroundColor) {
        const metrics = this.ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;
        const bgOpacity = this.style.backgroundOpacity || 0.5;
        
        this.ctx.save();
        this.ctx.fillStyle = this.style.backgroundColor;
        this.ctx.globalAlpha = bgOpacity;
        this.ctx.fillRect(
          (width - textWidth) / 2 - 10,
          y - textHeight - 5,
          textWidth + 20,
          textHeight + 10
        );
        this.ctx.restore();
      }
      
      // Draw text with outline
      this.ctx.strokeText(text, width / 2, y);
      this.ctx.fillText(text, width / 2, y);
      y -= fontSize + 6;
    }
  }
}
