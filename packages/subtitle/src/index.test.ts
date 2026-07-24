import { describe, it, expect, vi } from 'vitest';
import { SRTParser, VTTParser, ASSParser, SubtitleRenderer } from './index.js';

describe('SRTParser', () => {
  it('should parse valid SRT content', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello World

2
00:00:05,000 --> 00:00:08,000
Second subtitle`;

    const packets = SRTParser.parse(srt);
    expect(packets.length).toBe(2);
    expect(packets[0].text).toBe('Hello World');
    expect(packets[0].startTime).toBe(1);
    expect(packets[0].endTime).toBe(4);
    expect(packets[1].text).toBe('Second subtitle');
  });

  it('should handle empty SRT', () => {
    const packets = SRTParser.parse('');
    expect(packets.length).toBe(0);
  });

  it('should handle malformed SRT', () => {
    const srt = `Invalid SRT content`;
    const packets = SRTParser.parse(srt);
    expect(packets.length).toBe(0);
  });

  it('should parse timestamps correctly', () => {
    const ts = SRTParser.parseTimestamp('01:30:45,500');
    expect(ts).toBe(5445.5);
  });
});

describe('VTTParser', () => {
  it('should parse valid VTT content', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello World

2
00:00:05.000 --> 00:00:08.000
Second subtitle`;

    const packets = VTTParser.parse(vtt);
    expect(packets.length).toBe(2);
    expect(packets[0].text).toBe('Hello World');
  });

  it('should handle VTT with NOTE blocks', () => {
    const vtt = `WEBVTT

NOTE This is a comment

1
00:00:01.000 --> 00:00:04.000
Hello World`;

    const packets = VTTParser.parse(vtt);
    expect(packets.length).toBe(1);
  });

  it('should handle empty VTT', () => {
    const packets = VTTParser.parse('');
    expect(packets.length).toBe(0);
  });
});

describe('ASSParser', () => {
  it('should parse valid ASS content', () => {
    const ass = `[Script Info]
Title: Test
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello World`;

    const packets = ASSParser.parse(ass);
    expect(packets.length).toBe(1);
    expect(packets[0].text).toBe('Hello World');
    expect(packets[0].startTime).toBe(1);
    expect(packets[0].endTime).toBe(4);
  });

  it('should parse Script Info', () => {
    const ass = `[Script Info]
PlayResX: 1920
PlayResY: 1080`;
    
    const info = ASSParser.getASSInfo(ass);
    expect(info.playResX).toBe(1920);
    expect(info.playResY).toBe(1080);
  });

  it('should handle empty ASS', () => {
    const packets = ASSParser.parse('');
    expect(packets.length).toBe(0);
  });

  it('should strip override tags', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\b1}Bold{\\b0} text`;

    const packets = ASSParser.parse(ass);
    expect(packets.length).toBe(1);
    expect(packets[0].text).toBe('Bold text');
  });
});

describe('SubtitleRenderer', () => {
  it('should initialize with canvas', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => ({
        clearRect: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn(() => ({ width: 100 })),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        textBaseline: 'bottom'
      })),
      style: {}
    } as unknown as HTMLCanvasElement;
    
    const renderer = new SubtitleRenderer(canvas);
    expect(renderer).toBeDefined();
  });

  it('should render active subtitles', () => {
    const canvasEl = { width: 1920, height: 1080 };
    const mockCtx = {
      canvas: canvasEl,
      clearRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'center',
      textBaseline: 'bottom'
    };
    
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => mockCtx),
      style: {}
    } as unknown as HTMLCanvasElement;
    
    const renderer = new SubtitleRenderer(canvas);
    
    const packets = [
      { startTime: 1, endTime: 4, text: 'Hello World' },
      { startTime: 5, endTime: 8, text: 'Second subtitle' }
    ];
    
    renderer.renderSubtitles(packets, 2);
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  it('should not render inactive subtitles', () => {
    const canvasEl = { width: 1920, height: 1080 };
    const mockCtx = {
      canvas: canvasEl,
      clearRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'center',
      textBaseline: 'bottom'
    };
    
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => mockCtx),
      style: {}
    } as unknown as HTMLCanvasElement;
    
    const renderer = new SubtitleRenderer(canvas);
    
    const packets = [
      { startTime: 1, endTime: 4, text: 'Hello World' }
    ];
    
    renderer.renderSubtitles(packets, 10); // Time outside subtitle range
    expect(mockCtx.fillText).not.toHaveBeenCalled();
  });

  it('should set custom style', () => {
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn(() => ({
        clearRect: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn(() => ({ width: 100 })),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        textBaseline: 'bottom'
      })),
      style: {}
    } as unknown as HTMLCanvasElement;
    
    const renderer = new SubtitleRenderer(canvas);
    
    renderer.setStyle({
      fontSize: 32,
      fontFamily: 'Arial',
      color: '#FF0000',
      outlineColor: '#000000'
    });
    
    // Should not throw
    expect(true).toBe(true);
  });
});
