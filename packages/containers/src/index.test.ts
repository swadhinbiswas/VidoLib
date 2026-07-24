import { describe, it, expect } from 'vitest';
import { 
  MP4Demuxer, 
  MOVDemuxer, 
  FLVDemuxer, 
  TSDemuxer, 
  MKVDemuxer, 
  WebMDemuxer, 
  OGGDemuxer, 
  AVIDemuxer, 
  PSDemuxer, 
  ASFDemuxer,
  ContainerRegistry 
} from './index.js';

describe('Container Demuxers', () => {
  describe('MP4Demuxer', () => {
    const demuxer = new MP4Demuxer();
    
    it('should probe MP4 files correctly', () => {
      // ftyp box
      const ftyp = new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70]);
      expect(demuxer.probe(ftyp)).toBe(true);
      
      // moov box
      const moov = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x6D, 0x6F, 0x6F, 0x76]);
      expect(demuxer.probe(moov)).toBe(true);
      
      // moof box
      const moof = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x6D, 0x6F, 0x6F, 0x66]);
      expect(demuxer.probe(moof)).toBe(true);
    });
    
    it('should reject non-MP4 files', () => {
      const notMp4 = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x61, 0x76, 0x69, 0x20]);
      expect(demuxer.probe(notMp4)).toBe(false);
    });
    
    it('should handle empty buffer', () => {
      const empty = new Uint8Array(0);
      expect(demuxer.probe(empty)).toBe(false);
    });
    
    it('should demux small MP4 with default tracks', () => {
      const smallMp4 = new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70]);
      const result = demuxer.demux(smallMp4);
      expect(result.tracks.length).toBeGreaterThan(0);
    });
  });

  describe('MOVDemuxer', () => {
    const demuxer = new MOVDemuxer();
    
    it('should probe MOV files correctly', () => {
      // qt  brand
      const qt = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x71, 0x74, 0x20, 0x20]);
      expect(demuxer.probe(qt)).toBe(true);
    });
  });

  describe('FLVDemuxer', () => {
    const demuxer = new FLVDemuxer();
    
    it('should probe FLV files correctly', () => {
      const flv = new Uint8Array([0x46, 0x4C, 0x56]);
      expect(demuxer.probe(flv)).toBe(true);
    });
    
    it('should reject non-FLV files', () => {
      const notFlv = new Uint8Array([0x46, 0x4C, 0x41]);
      expect(demuxer.probe(notFlv)).toBe(false);
    });
    
    it('should demux FLV with header', () => {
      const flvHeader = new Uint8Array([
        0x46, 0x4C, 0x56, // FLV
        0x01, // version
        0x05, // flags (audio + video)
        0x00, 0x00, 0x00, 0x09, // header size
        0x00, 0x00, 0x00, 0x00 // prev tag size
      ]);
      const result = demuxer.demux(flvHeader);
      expect(result.tracks.length).toBeGreaterThan(0);
    });
  });

  describe('TSDemuxer', () => {
    const demuxer = new TSDemuxer();
    
    it('should probe TS files correctly', () => {
      const ts = new Uint8Array(188);
      ts[0] = 0x47; // sync byte
      expect(demuxer.probe(ts)).toBe(true);
    });
    
    it('should reject non-TS files', () => {
      const notTs = new Uint8Array(188);
      notTs[0] = 0x00;
      expect(demuxer.probe(notTs)).toBe(false);
    });
    
    it('should handle TS with sync byte at offset', () => {
      const ts = new Uint8Array(188);
      ts[3] = 0x47; // sync byte at offset 3
      expect(demuxer.probe(ts)).toBe(true);
    });
  });

  describe('MKVDemuxer', () => {
    const demuxer = new MKVDemuxer();
    
    it('should probe MKV files correctly', () => {
      const mkv = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3]);
      expect(demuxer.probe(mkv)).toBe(true);
    });
    
    it('should reject non-MKV files', () => {
      const notMkv = new Uint8Array([0x1A, 0x45, 0xDF, 0xA4]);
      expect(demuxer.probe(notMkv)).toBe(false);
    });
  });

  describe('WebMDemuxer', () => {
    const demuxer = new WebMDemuxer();
    
    it('should probe WebM files correctly (same as MKV)', () => {
      const webm = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3]);
      expect(demuxer.probe(webm)).toBe(true);
    });
  });

  describe('OGGDemuxer', () => {
    const demuxer = new OGGDemuxer();
    
    it('should probe OGG files correctly', () => {
      const ogg = new Uint8Array([0x4F, 0x67, 0x67, 0x53]);
      expect(demuxer.probe(ogg)).toBe(true);
    });
    
    it('should reject non-OGG files', () => {
      const notOgg = new Uint8Array([0x4F, 0x67, 0x67, 0x54]);
      expect(demuxer.probe(notOgg)).toBe(false);
    });
  });

  describe('AVIDemuxer', () => {
    const demuxer = new AVIDemuxer();
    
    it('should probe AVI files correctly', () => {
      const avi = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20]);
      expect(demuxer.probe(avi)).toBe(true);
    });
    
    it('should reject non-AVI RIFF files', () => {
      const notAvi = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      expect(demuxer.probe(notAvi)).toBe(false);
    });
  });

  describe('PSDemuxer', () => {
    const demuxer = new PSDemuxer();
    
    it('should probe PS files correctly', () => {
      const ps = new Uint8Array([0x00, 0x00, 0x01, 0xBA]);
      expect(demuxer.probe(ps)).toBe(true);
    });
    
    it('should reject non-PS files', () => {
      const notPs = new Uint8Array([0x00, 0x00, 0x01, 0xBB]);
      expect(demuxer.probe(notPs)).toBe(false);
    });
  });

  describe('ASFDemuxer', () => {
    const demuxer = new ASFDemuxer();
    
    it('should probe ASF files correctly', () => {
      const asf = new Uint8Array([0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C]);
      expect(demuxer.probe(asf)).toBe(true);
    });
    
    it('should reject non-ASF files', () => {
      const notAsf = new Uint8Array([0x00, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C]);
      expect(demuxer.probe(notAsf)).toBe(false);
    });
  });

  describe('ContainerRegistry', () => {
    const registry = new ContainerRegistry();
    
    it('should auto-detect MP4', () => {
      const mp4 = new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70]);
      const result = registry.autoDemux(mp4);
      expect(result.tracks.length).toBeGreaterThan(0);
    });
    
    it('should auto-detect FLV', () => {
      const flv = new Uint8Array([0x46, 0x4C, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09]);
      const result = registry.autoDemux(flv);
      expect(result.tracks.length).toBeGreaterThan(0);
    });
    
    it('should throw for unsupported format', () => {
      const unsupported = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(() => registry.autoDemux(unsupported)).toThrow('Unsupported media container format');
    });
  });

  describe('Security Limits', () => {
    it('should handle FLV with valid header', () => {
      const demuxer = new FLVDemuxer();
      // Create a minimal FLV header
      const data = new Uint8Array([
        0x46, 0x4C, 0x56, // FLV
        0x01, // version
        0x05, // flags (audio + video)
        0x00, 0x00, 0x00, 0x09, // header size
        0x00, 0x00, 0x00, 0x00 // prev tag size
      ]);
      const result = demuxer.demux(data);
      expect(result.tracks.length).toBeGreaterThan(0);
    });
  });
});
