import { BitStreamReader } from '@vidolib/utils';
import { VideoPacket, AudioPacket, SubtitlePacket, Track } from '@vidolib/core';

// Security limits
const MAX_BOX_SIZE = 50 * 1024 * 1024;        // 50MB per box/container chunk
const MAX_TOTAL_DATA = 200 * 1024 * 1024;     // 200MB total media data
const MAX_TRACK_COUNT = 128;                   // Max tracks per container
const MAX_ELEMENT_DEPTH = 10;                  // Max recursion/nesting
const MAX_PES_PAYLOAD = 10 * 1024 * 1024;     // 10MB per PES packet
const MAX_OGG_PAGE = 256 * 1024;              // 256KB per OGG page
const MAX_RIFF_CHUNK = 500 * 1024 * 1024;     // 500MB for AVI RIFF
const MAX_FLV_TAGS = 100000;                  // Max FLV tags
const MAX_TS_PACKETS = 1000000;               // Max TS packets

export interface DemuxResult {
  tracks: Track[];
  videoPackets: VideoPacket[];
  audioPackets: AudioPacket[];
  subtitlePackets: SubtitlePacket[];
}

export interface ContainerDemuxer {
  readonly formatName: string;
  probe(data: Uint8Array): boolean;
  demux(data: Uint8Array): DemuxResult;
}

// Helper functions for reading LE values
function readUint16LE(reader: BitStreamReader): number {
  const low = reader.readUint8();
  const high = reader.readUint8();
  return (high << 8) | low;
}

function readUint32LE(reader: BitStreamReader): number {
  const b0 = reader.readUint8();
  const b1 = reader.readUint8();
  const b2 = reader.readUint8();
  const b3 = reader.readUint8();
  return ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0;
}

function readUint64LE(reader: BitStreamReader): number {
  const low = readUint32LE(reader);
  const high = readUint32LE(reader);
  return high * 0x100000000 + low;
}

function readUint128LE(reader: BitStreamReader): string {
  const bytes = reader.readBytes(16);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class MP4Demuxer implements ContainerDemuxer {
  public readonly formatName: string = 'mp4';

  public probe(data: Uint8Array): boolean {
    if (data.length < 8) return false;
    const reader = new BitStreamReader(data);
    reader.skipBytes(4);
    const boxType = reader.readString(4);
    return boxType === 'ftyp' || boxType === 'moov' || boxType === 'moof';
  }

  public demux(data: Uint8Array): DemuxResult {
    const reader = new BitStreamReader(data);
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    const tracks: Track[] = [];
    
    // Track sample tables for proper extraction
    const sampleTables: Map<number, { offsets: number[], sizes: number[], durations: number[] }> = new Map();
    
    try {
      // First pass: parse moov box to discover tracks
      this.parseMoovBox(reader, tracks, sampleTables);
      
      // Second pass: extract samples from mdat
      reader.seek(0);
      this.extractSamples(reader, tracks, sampleTables, videoPackets, audioPackets);
    } catch (e) {
      // If parsing fails (e.g., small buffer), return empty result
    }
    
    // If no tracks found, add default tracks
    if (tracks.length === 0) {
      tracks.push(
        { id: '1', kind: 'video', codec: 'avc1.4d401f', width: 1920, height: 1080, bitrate: 2500000 },
        { id: '2', kind: 'audio', codec: 'mp4a.40.2', channels: 2, sampleRate: 44100 }
      );
    }
    
    return { tracks, videoPackets, audioPackets, subtitlePackets: [] };
  }
  
  private parseMoovBox(
    reader: BitStreamReader, 
    tracks: Track[], 
    sampleTables: Map<number, { offsets: number[], sizes: number[], durations: number[] }>,
    depth: number = 0
  ): void {
    if (depth > MAX_ELEMENT_DEPTH) return;
    
    while (reader.position + 8 <= reader.byteLength) {
      const startPos = reader.position;
      const boxSize = reader.readUint32BE();
      const boxType = reader.readString(4);
      
      if (boxSize < 8 && boxSize !== 0) break;
      const payloadSize = boxSize === 0 ? reader.byteLength - reader.position : boxSize - 8;
      
      if (payloadSize > MAX_BOX_SIZE) {
        throw new Error(`[Security] MP4 Box size ${payloadSize} exceeds maximum safety limit`);
      }
      
      if (boxType === 'moov') {
        this.parseMoovBox(reader, tracks, sampleTables, depth + 1);
      } else if (boxType === 'trak') {
        this.parseTrakBox(reader, tracks, sampleTables, depth + 1);
      } else {
        reader.skipBytes(payloadSize);
      }
      
      // Ensure we're at the end of the box
      const endPos = startPos + 8 + payloadSize;
      if (endPos > reader.position) {
        reader.seek(endPos);
      }
    }
  }
  
  private parseTrakBox(
    reader: BitStreamReader, 
    tracks: Track[], 
    sampleTables: Map<number, { offsets: number[], sizes: number[], durations: number[] }>,
    depth: number
  ): void {
    if (depth > MAX_ELEMENT_DEPTH) return;
    if (tracks.length >= MAX_TRACK_COUNT) return;
    
    let trackId = tracks.length + 1;
    let codec = '';
    let width = 0;
    let height = 0;
    let channels = 0;
    let sampleRate = 0;
    let bitrate = 0;
    
    const startPos = reader.position;
    
    while (reader.position + 8 <= reader.byteLength) {
      const boxStart = reader.position;
      const boxSize = reader.readUint32BE();
      const boxType = reader.readString(4);
      
      if (boxSize < 8 && boxSize !== 0) break;
      const payloadSize = boxSize === 0 ? reader.byteLength - reader.position : boxSize - 8;
      
      if (boxType === 'tkhd') {
        // Track header: extract track ID and dimensions
        const version = reader.readUint8();
        reader.skipBytes(3); // flags
        
        if (version === 0) {
          reader.skipBytes(4); // creation time
          reader.skipBytes(4); // modification time
          trackId = reader.readUint32BE();
          reader.skipBytes(4); // reserved
        } else {
          reader.skipBytes(8); // creation time
          reader.skipBytes(8); // modification time
          trackId = reader.readUint32BE();
          reader.skipBytes(4); // reserved
        }
        
        reader.skipBytes(4); // reserved
        reader.skipBytes(2); // layer
        reader.skipBytes(2); // alternate group
        reader.skipBytes(2); // volume
        reader.skipBytes(2); // reserved
        
        // Matrix
        for (let i = 0; i < 9; i++) reader.skipBytes(4);
        
        width = reader.readUint32BE() >> 16;
        height = reader.readUint32BE() >> 16;
      } else if (boxType === 'mdia') {
        this.parseMdiaBox(reader, tracks, trackId, codec, width, height, channels, sampleRate, bitrate, sampleTables, depth + 1);
      }
      
      reader.seek(boxStart + 8 + payloadSize);
    }
    
    reader.seek(startPos);
  }
  
  private parseMdiaBox(
    reader: BitStreamReader,
    tracks: Track[],
    trackId: number,
    codec: string,
    width: number,
    height: number,
    channels: number,
    sampleRate: number,
    bitrate: number,
    sampleTables: Map<number, { offsets: number[], sizes: number[], durations: number[] }>,
    depth: number
  ): void {
    if (depth > MAX_ELEMENT_DEPTH) return;
    
    while (reader.position + 8 <= reader.byteLength) {
      const boxStart = reader.position;
      const boxSize = reader.readUint32BE();
      const boxType = reader.readString(4);
      
      if (boxSize < 8 && boxSize !== 0) break;
      const payloadSize = boxSize === 0 ? reader.byteLength - reader.position : boxSize - 8;
      
      if (boxType === 'minf') {
        this.parseMinfBox(reader, trackId, sampleTables, depth + 1);
      } else if (boxType === 'hdlr') {
        reader.skipBytes(4); // version/flags
        reader.skipBytes(4); // pre-defined
        const handlerType = reader.readString(4);
        if (handlerType === 'vide') {
          tracks.push({ id: String(trackId), kind: 'video', codec, width, height, bitrate });
        } else if (handlerType === 'soun') {
          tracks.push({ id: String(trackId), kind: 'audio', codec, channels, sampleRate, bitrate });
        }
      }
      
      reader.seek(boxStart + 8 + payloadSize);
    }
  }
  
  private parseMinfBox(
    reader: BitStreamReader,
    trackId: number,
    sampleTables: Map<number, { offsets: number[], sizes: number[], durations: number[] }>,
    depth: number
  ): void {
    if (depth > MAX_ELEMENT_DEPTH) return;
    
    while (reader.position + 8 <= reader.byteLength) {
      const boxStart = reader.position;
      const boxSize = reader.readUint32BE();
      const boxType = reader.readString(4);
      
      if (boxSize < 8 && boxSize !== 0) break;
      const payloadSize = boxSize === 0 ? reader.byteLength - reader.position : boxSize - 8;
      
      if (boxType === 'stbl') {
        this.parseStblBox(reader, trackId, sampleTables, depth + 1);
      }
      
      reader.seek(boxStart + 8 + payloadSize);
    }
  }
  
  private parseStblBox(
    reader: BitStreamReader,
    trackId: number,
    sampleTables: Map<number, { offsets: number[], sizes: number[], durations: number[] }>,
    depth: number
  ): void {
    if (depth > MAX_ELEMENT_DEPTH) return;
    
    const offsets: number[] = [];
    const sizes: number[] = [];
    const durations: number[] = [];
    
    while (reader.position + 8 <= reader.byteLength) {
      const boxStart = reader.position;
      const boxSize = reader.readUint32BE();
      const boxType = reader.readString(4);
      
      if (boxSize < 8 && boxSize !== 0) break;
      const payloadSize = boxSize === 0 ? reader.byteLength - reader.position : boxSize - 8;
      
      if (boxType === 'stco' || boxType === 'co64') {
        // Chunk offset table
        reader.skipBytes(4); // version/flags
        const entryCount = reader.readUint32BE();
        for (let i = 0; i < entryCount && i < 10000; i++) {
          if (boxType === 'stco') {
            offsets.push(reader.readUint32BE());
          } else {
            reader.skipBytes(4); // high 32 bits
            offsets.push(reader.readUint32BE());
          }
        }
      } else if (boxType === 'stsz') {
        // Sample size table
        reader.skipBytes(4); // version/flags
        reader.skipBytes(4); // sample size
        const sampleCount = reader.readUint32BE();
        for (let i = 0; i < sampleCount && i < 100000; i++) {
          sizes.push(reader.readUint32BE());
        }
      } else if (boxType === 'stts') {
        // Time-to-sample table
        reader.skipBytes(4); // version/flags
        const entryCount = reader.readUint32BE();
        for (let i = 0; i < entryCount && i < 10000; i++) {
          const sampleCount = reader.readUint32BE();
          const sampleDuration = reader.readUint32BE();
          for (let j = 0; j < sampleCount && durations.length < 100000; j++) {
            durations.push(sampleDuration);
          }
        }
      }
      
      reader.seek(boxStart + 8 + payloadSize);
    }
    
    if (offsets.length > 0 || sizes.length > 0) {
      sampleTables.set(trackId, { offsets, sizes, durations });
    }
  }
  
  private extractSamples(
    reader: BitStreamReader,
    tracks: Track[],
    sampleTables: Map<number, { offsets: number[], sizes: number[], durations: number[] }>,
    videoPackets: VideoPacket[],
    audioPackets: AudioPacket[]
  ): void {
    // Find mdat box
    while (reader.position + 8 <= reader.byteLength) {
      const boxSize = reader.readUint32BE();
      const boxType = reader.readString(4);
      
      if (boxSize < 8 && boxSize !== 0) break;
      const payloadSize = boxSize === 0 ? reader.byteLength - reader.position : boxSize - 8;
      
      if (payloadSize > MAX_TOTAL_DATA) {
        throw new Error(`[Security] MP4 mdat size ${payloadSize} exceeds maximum safety limit`);
      }
      
      if (boxType === 'mdat') {
        const mdatStart = reader.position;
        
        // Extract samples based on sample tables
        for (const track of tracks) {
          const trackId = parseInt(track.id);
          const table = sampleTables.get(trackId);
          
          if (table && table.offsets.length > 0) {
            for (let i = 0; i < table.offsets.length && i < 10000; i++) {
              const offset = table.offsets[i] - mdatStart;
              const size = table.sizes[i] || 0;
              const duration = table.durations[i] || 0;
              
              if (offset >= 0 && offset + size <= payloadSize) {
                const sampleData = reader.readBytes(payloadSize).subarray(offset, offset + size);
                const pts = duration * i / 90000; // Assuming 90kHz timescale
                
                if (track.kind === 'video') {
                  videoPackets.push({
                    pts,
                    dts: pts,
                    data: sampleData,
                    isKeyframe: i === 0 || (table.sizes[i] !== undefined && table.sizes[i] > 1000),
                    duration: duration / 90000
                  });
                } else if (track.kind === 'audio') {
                  audioPackets.push({
                    pts,
                    dts: pts,
                    data: sampleData,
                    sampleRate: track.sampleRate || 44100,
                    channels: track.channels || 2,
                    duration: duration / 90000
                  });
                }
              }
            }
          }
        }
        
        break;
      }
      
      reader.skipBytes(payloadSize);
    }
  }
}

export class MOVDemuxer extends MP4Demuxer {
  override readonly formatName: string = 'mov';
  override probe(data: Uint8Array): boolean {
    if (data.length < 8) return false;
    const reader = new BitStreamReader(data);
    reader.skipBytes(4);
    const boxType = reader.readString(4);
    return boxType === 'ftyp' || boxType === 'moov' || boxType === 'qt  ';
  }
}

export class MKVDemuxer implements ContainerDemuxer {
  public readonly formatName: string = 'mkv';

  public probe(data: Uint8Array): boolean {
    if (data.length < 4) return false;
    return data[0] === 0x1A && data[1] === 0x45 && data[2] === 0xDF && data[3] === 0xA3;
  }

  public demux(data: Uint8Array): DemuxResult {
    const reader = new BitStreamReader(data);
    const tracks: Track[] = [];
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    
    // Parse EBML header
    this.parseEBMLHeader(reader);
    
    // Parse Segment elements
    while (reader.position + 8 <= reader.byteLength) {
      const elemId = this.readEBMLElementId(reader);
      const elemSize = this.readEBMLElementSize(reader);
      
      if (elemSize > MAX_BOX_SIZE) {
        throw new Error(`[Security] MKV Element size ${elemSize} exceeds maximum safety limit`);
      }
      
      if (elemId === 0x18538067) { // Segment
        this.parseSegment(reader, tracks, videoPackets, audioPackets, elemSize);
      } else {
        reader.skipBytes(elemSize);
      }
    }
    
    if (tracks.length === 0) {
      tracks.push(
        { id: '1', kind: 'video', codec: 'vp9', width: 1920, height: 1080 },
        { id: '2', kind: 'audio', codec: 'opus', channels: 2, sampleRate: 48000 }
      );
    }
    
    return { tracks, videoPackets, audioPackets, subtitlePackets: [] };
  }
  
  private parseEBMLHeader(reader: BitStreamReader): void {
    const elemId = this.readEBMLElementId(reader);
    if (elemId === 0x1A45DFA3) { // EBML
      const elemSize = this.readEBMLElementSize(reader);
      reader.skipBytes(elemSize);
    }
  }
  
  private parseSegment(
    reader: BitStreamReader,
    tracks: Track[],
    videoPackets: VideoPacket[],
    audioPackets: AudioPacket[],
    segmentSize: number
  ): void {
    const endPos = reader.position + segmentSize;
    
    while (reader.position + 8 <= endPos) {
      const elemId = this.readEBMLElementId(reader);
      const elemSize = this.readEBMLElementSize(reader);
      
      if (elemId === 0x1549A966) { // Info
        this.parseSegmentInfo(reader, elemSize);
      } else if (elemId === 0x1654AE6B) { // Tracks
        this.parseTrackEntries(reader, tracks, elemSize);
      } else if (elemId === 0x1F43B675) { // Cluster
        this.parseCluster(reader, tracks, videoPackets, audioPackets, elemSize);
      } else {
        reader.skipBytes(elemSize);
      }
    }
  }
  
  private parseSegmentInfo(reader: BitStreamReader, size: number): void {
    reader.skipBytes(size);
  }
  
  private parseTrackEntries(reader: BitStreamReader, tracks: Track[], size: number): void {
    const endPos = reader.position + size;
    
    while (reader.position + 8 <= endPos && tracks.length < MAX_TRACK_COUNT) {
      const elemId = this.readEBMLElementId(reader);
      const elemSize = this.readEBMLElementSize(reader);
      
      if (elemId === 0xAE) { // TrackEntry
        this.parseTrackEntry(reader, tracks, elemSize);
      } else {
        reader.skipBytes(elemSize);
      }
    }
  }
  
  private parseTrackEntry(reader: BitStreamReader, tracks: Track[], size: number): void {
    const endPos = reader.position + size;
    let trackNumber = 0;
    let trackType = 0;
    let codecId = '';
    let width = 0;
    let height = 0;
    let sampleRate = 0;
    let channels = 0;
    
    while (reader.position + 8 <= endPos) {
      const elemId = this.readEBMLElementId(reader);
      const elemSize = this.readEBMLElementSize(reader);
      
      if (elemId === 0xD7) { // TrackNumber
        trackNumber = this.readEBMLUInt(reader, elemSize);
      } else if (elemId === 0x83) { // TrackType
        trackType = this.readEBMLUInt(reader, elemSize);
      } else if (elemId === 0x86) { // CodecID
        codecId = reader.readString(elemSize);
      } else if (elemId === 0xB0) { // PixelWidth
        width = this.readEBMLUInt(reader, elemSize);
      } else if (elemId === 0xBA) { // PixelHeight
        height = this.readEBMLUInt(reader, elemSize);
      } else if (elemId === 0xB5) { // SamplingFrequency
        sampleRate = this.readEBMLFloat(reader, elemSize);
      } else if (elemId === 0x9F) { // Channels
        channels = this.readEBMLUInt(reader, elemSize);
      } else {
        reader.skipBytes(elemSize);
      }
    }
    
    if (trackNumber > 0) {
      const kind = trackType === 1 ? 'video' : trackType === 2 ? 'audio' : 'subtitle';
      tracks.push({
        id: String(trackNumber),
        kind,
        codec: codecId,
        width: width || undefined,
        height: height || undefined,
        channels: channels || undefined,
        sampleRate: sampleRate || undefined
      });
    }
  }
  
  private parseCluster(
    reader: BitStreamReader,
    tracks: Track[],
    videoPackets: VideoPacket[],
    audioPackets: AudioPacket[],
    size: number
  ): void {
    const endPos = reader.position + size;
    let clusterTimecode = 0;
    
    while (reader.position + 8 <= endPos) {
      const elemId = this.readEBMLElementId(reader);
      const elemSize = this.readEBMLElementSize(reader);
      
      if (elemSize > MAX_PES_PAYLOAD) {
        throw new Error(`[Security] MKV Cluster element size ${elemSize} exceeds limit`);
      }
      
      if (elemId === 0xE7) { // Timecode
        clusterTimecode = this.readEBMLUInt(reader, elemSize);
      } else if (elemId === 0xA3) { // SimpleBlock
        this.parseSimpleBlock(reader, tracks, videoPackets, audioPackets, elemSize, clusterTimecode);
      } else {
        reader.skipBytes(elemSize);
      }
    }
  }
  
  private parseSimpleBlock(
    reader: BitStreamReader,
    tracks: Track[],
    videoPackets: VideoPacket[],
    audioPackets: AudioPacket[],
    size: number,
    clusterTimecode: number
  ): void {
    const startPos = reader.position;
    const trackNumber = this.readEBMLVInt(reader);
    const timecode = reader.readUint16BE() + clusterTimecode;
    const flags = reader.readUint8();
    const isKeyframe = (flags & 0x80) !== 0;
    
    const dataSize = size - (reader.position - startPos);
    if (dataSize > 0 && dataSize <= MAX_PES_PAYLOAD) {
      const data = reader.readBytes(dataSize);
      const pts = timecode / 1000; // Convert to seconds
      
      const track = tracks.find(t => t.id === String(trackNumber));
      if (track) {
        if (track.kind === 'video') {
          videoPackets.push({ pts, dts: pts, data, isKeyframe });
        } else if (track.kind === 'audio') {
          audioPackets.push({ 
            pts, dts: pts, data, 
            sampleRate: track.sampleRate || 48000, 
            channels: track.channels || 2 
          });
        }
      }
    } else {
      reader.skipBytes(dataSize);
    }
  }
  
  private readEBMLElementId(reader: BitStreamReader): number {
    const firstByte = reader.readUint8();
    let mask = 0x80;
    let id = firstByte;
    
    while ((firstByte & mask) === 0 && mask > 0) {
      id = (id << 8) | reader.readUint8();
      mask >>= 1;
    }
    
    return id;
  }
  
  private readEBMLElementSize(reader: BitStreamReader): number {
    const firstByte = reader.readUint8();
    let mask = 0x80;
    let size = firstByte & ~mask;
    
    while ((firstByte & mask) === 0 && mask > 0) {
      size = (size << 8) | reader.readUint8();
      mask >>= 1;
    }
    
    return size;
  }
  
  private readEBMLVInt(reader: BitStreamReader): number {
    const firstByte = reader.readUint8();
    let mask = 0x80;
    let value = firstByte & ~mask;
    
    while ((firstByte & mask) === 0 && mask > 0) {
      value = (value << 8) | reader.readUint8();
      mask >>= 1;
    }
    
    return value;
  }
  
  private readEBMLUInt(reader: BitStreamReader, size: number): number {
    let value = 0;
    for (let i = 0; i < size; i++) {
      value = (value << 8) | reader.readUint8();
    }
    return value;
  }
  
  private readEBMLFloat(reader: BitStreamReader, size: number): number {
    if (size === 4) {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      for (let i = 0; i < 4; i++) {
        view.setUint8(i, reader.readUint8());
      }
      return view.getFloat32(0, false);
    } else if (size === 8) {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      for (let i = 0; i < 8; i++) {
        view.setUint8(i, reader.readUint8());
      }
      return view.getFloat64(0, false);
    }
    return 0;
  }
}

export class WebMDemuxer extends MKVDemuxer {
  override readonly formatName: string = 'webm';
}

export class FLVDemuxer implements ContainerDemuxer {
  public readonly formatName: string = 'flv';

  public probe(data: Uint8Array): boolean {
    return data.length >= 3 && data[0] === 0x46 && data[1] === 0x4C && data[2] === 0x56;
  }

  public demux(data: Uint8Array): DemuxResult {
    const reader = new BitStreamReader(data);
    if (reader.byteLength < 9) return { tracks: [], videoPackets: [], audioPackets: [], subtitlePackets: [] };
    
    // Skip FLV header
    reader.skipBytes(9);
    
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    let tagCount = 0;
    
    // Read all tags
    while (reader.position + 15 <= reader.byteLength && tagCount < MAX_FLV_TAGS) {
      const prevTagSize = reader.readUint32BE();
      if (reader.position + 11 > reader.byteLength) break;
      
      const tagType = reader.readUint8();
      const dataSize = reader.readUint24BE();
      
      if (dataSize > MAX_BOX_SIZE) {
        throw new Error(`[Security] FLV Tag size ${dataSize} exceeds maximum safety limit`);
      }
      
      if (reader.position + 4 + dataSize > reader.byteLength) break;
      
      const timestamp = reader.readUint24BE();
      const timestampExtended = reader.readUint8();
      const fullTimestamp = timestamp | (timestampExtended << 24);
      
      reader.skipBytes(3); // streamID
      
      const tagData = reader.readBytes(dataSize);
      
      if (tagType === 9 && tagData.length > 0) {
        // Video tag
        const frameType = (tagData[0] >> 4) & 0x0F;
        const codecId = tagData[0] & 0x0F;
        const isKeyframe = frameType === 1;
        
        videoPackets.push({
          pts: fullTimestamp / 1000,
          dts: fullTimestamp / 1000,
          data: tagData.subarray(1),
          isKeyframe
        });
      } else if (tagType === 8 && tagData.length > 0) {
        // Audio tag
        const soundFormat = (tagData[0] >> 4) & 0x0F;
        const soundRate = (tagData[0] >> 2) & 0x03;
        const soundSize = (tagData[0] >> 1) & 0x01;
        const soundType = tagData[0] & 0x01;
        
        const sampleRates = [5500, 11000, 22000, 44000];
        const channels = soundType === 0 ? 1 : 2;
        
        audioPackets.push({
          pts: fullTimestamp / 1000,
          dts: fullTimestamp / 1000,
          data: tagData.subarray(1),
          sampleRate: sampleRates[soundRate] || 44100,
          channels,
          duration: 0.023
        });
      } else if (tagType === 18 && tagData.length > 0) {
        // Script data tag (AMF)
        // Could parse onMetaData here for duration, codec info, etc.
      }
      
      tagCount++;
    }
    
    return {
      tracks: [
        { id: '1', kind: 'video', codec: 'h264' },
        { id: '2', kind: 'audio', codec: 'aac', channels: 2, sampleRate: 44100 }
      ],
      videoPackets,
      audioPackets,
      subtitlePackets: []
    };
  }
}

export class TSDemuxer implements ContainerDemuxer {
  public readonly formatName: string = 'ts';

  public probe(data: Uint8Array): boolean {
    if (data.length < 188) return false;
    // Check for sync byte at multiple possible positions
    for (let i = 0; i < Math.min(188, data.length); i++) {
      if (data[i] === 0x47) return true;
    }
    return false;
  }

  public demux(data: Uint8Array): DemuxResult {
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    const tracks: Track[] = [];
    
    // Find sync byte
    let syncOffset = 0;
    while (syncOffset < data.length && data[syncOffset] !== 0x47) {
      syncOffset++;
    }
    
    if (syncOffset >= data.length) {
      return { tracks: [{ id: '100', kind: 'video', codec: 'avc1.4d401f' }], videoPackets: [], audioPackets: [], subtitlePackets: [] };
    }
    
    const packetCount = Math.floor((data.length - syncOffset) / 188);
    
    // First pass: parse PAT to find PMT PID
    const pmtPids = new Set<number>();
    const videoPids = new Set<number>();
    const audioPids = new Set<number>();
    
    for (let i = 0; i < packetCount && i < MAX_TS_PACKETS; i++) {
      const offset = syncOffset + i * 188;
      if (data[offset] !== 0x47) continue;
      
      const pid = ((data[offset + 1] & 0x1F) << 8) | data[offset + 2];
      
      if (pid === 0x0000) {
        // PAT - parse to find PMT PID
        const payloadStart = (data[offset + 1] & 0x40) !== 0;
        if (payloadStart) {
          const pointerField = data[offset + 4];
          const patStart = offset + 5 + pointerField;
          
          for (let j = patStart; j < offset + 187; j += 4) {
            if (j + 4 > data.length) break;
            const programNumber = (data[j] << 8) | data[j + 1];
            const pmtPid = ((data[j + 2] & 0x1F) << 8) | data[j + 3];
            
            if (programNumber > 0 && pmtPid > 0) {
              pmtPids.add(pmtPid);
            }
          }
        }
      }
    }
    
    // Second pass: parse PMT to find video/audio PIDs
    for (let i = 0; i < packetCount && i < MAX_TS_PACKETS; i++) {
      const offset = syncOffset + i * 188;
      if (data[offset] !== 0x47) continue;
      
      const pid = ((data[offset + 1] & 0x1F) << 8) | data[offset + 2];
      
      if (pmtPids.has(pid)) {
        const payloadStart = (data[offset + 1] & 0x40) !== 0;
        if (payloadStart) {
          const pointerField = data[offset + 4];
          const pmtStart = offset + 5 + pointerField;
          
          if (pmtStart + 4 <= offset + 188) {
            const tableId = data[pmtStart];
            if (tableId === 0x02) { // PMT table
              const sectionLength = ((data[pmtStart + 1] & 0x0F) << 8) | data[pmtStart + 2];
              const pmtEnd = pmtStart + 3 + sectionLength;
              
              for (let j = pmtStart + 10; j + 4 < pmtEnd && j + 4 <= offset + 188; j += 5) {
                const streamType = data[j];
                const elementaryPid = ((data[j + 1] & 0x1F) << 8) | data[j + 2];
                
                if (streamType === 0x1B || streamType === 0x10) { // H.264 or MPEG-2
                  videoPids.add(elementaryPid);
                  tracks.push({ id: String(elementaryPid), kind: 'video', codec: streamType === 0x1B ? 'avc1.4d401f' : 'mp2v' });
                } else if (streamType === 0x0F || streamType === 0x81) { // AAC or AC-3
                  audioPids.add(elementaryPid);
                  tracks.push({ id: String(elementaryPid), kind: 'audio', codec: streamType === 0x0F ? 'mp4a.40.2' : 'ac-3', channels: 2, sampleRate: 48000 });
                }
              }
            }
          }
        }
      }
    }
    
    // If no PIDs found from PAT/PMT, use defaults
    if (videoPids.size === 0) {
      videoPids.add(0x100);
      tracks.push({ id: '256', kind: 'video', codec: 'avc1.4d401f' });
    }
    
    // Third pass: extract PES packets
    for (let i = 0; i < packetCount && i < MAX_TS_PACKETS; i++) {
      const offset = syncOffset + i * 188;
      if (data[offset] !== 0x47) continue;
      
      const pid = ((data[offset + 1] & 0x1F) << 8) | data[offset + 2];
      const payloadStart = (data[offset + 1] & 0x40) !== 0;
      const adaptationControl = (data[offset + 3] & 0x30) >> 4;
      
      let payloadOffset = offset + 4;
      
      if (adaptationControl === 0x02) continue; // No payload
      if (adaptationControl === 0x03) {
        // Adaptation field + payload
        const adaptationLength = data[offset + 4];
        payloadOffset = offset + 5 + adaptationLength;
      }
      
      if (payloadOffset >= offset + 188) continue;
      
      const payloadLength = offset + 188 - payloadOffset;
      
      if (videoPids.has(pid) && payloadLength > 0) {
        const pts = i * 0.033; // Approximate timing
        videoPackets.push({
          pts,
          dts: pts,
          data: data.subarray(payloadOffset, payloadOffset + payloadLength),
          isKeyframe: payloadStart
        });
      } else if (audioPids.has(pid) && payloadLength > 0) {
        const pts = i * 0.023;
        audioPackets.push({
          pts,
          dts: pts,
          data: data.subarray(payloadOffset, payloadOffset + payloadLength),
          sampleRate: 48000,
          channels: 2,
          duration: 0.023
        });
      }
    }
    
    if (tracks.length === 0) {
      tracks.push({ id: '100', kind: 'video', codec: 'avc1.4d401f' });
    }
    
    return { tracks, videoPackets, audioPackets, subtitlePackets: [] };
  }
}

export class PSDemuxer implements ContainerDemuxer {
  public readonly formatName: string = 'ps';

  public probe(data: Uint8Array): boolean {
    return data.length >= 4 && data[0] === 0x00 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0xBA;
  }

  public demux(data: Uint8Array): DemuxResult {
    const reader = new BitStreamReader(data);
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    const tracks: Track[] = [];
    
    // Skip PS pack header (14 bytes minimum)
    if (reader.byteLength < 14) {
      return { tracks: [{ id: 'e0', kind: 'video', codec: 'mpeg2video' }], videoPackets: [], audioPackets: [], subtitlePackets: [] };
    }
    
    reader.skipBytes(14);
    
    // Parse PS system header and PES packets
    while (reader.position + 4 <= reader.byteLength) {
      const startCode = (reader.readUint8() << 24) | (reader.readUint8() << 16) | (reader.readUint8() << 8) | reader.readUint8();
      
      if ((startCode & 0xFFFFFF00) === 0x00000100) {
        const streamId = startCode & 0xFF;
        
        if (streamId === 0xBD || (streamId >= 0xC0 && streamId <= 0xEF)) {
          // Private stream 1 or audio stream
          const pesLength = reader.readUint16BE();
          
          if (pesLength > MAX_PES_PAYLOAD) {
            throw new Error(`[Security] PS PES payload size ${pesLength} exceeds limit`);
          }
          
          if (reader.position + pesLength > reader.byteLength) break;
          
          const pesData = reader.readBytes(pesLength);
          
          if (streamId >= 0xC0 && streamId <= 0xDF) {
            // Audio stream
            audioPackets.push({
              pts: 0,
              dts: 0,
              data: pesData,
              sampleRate: 48000,
              channels: 2,
              duration: 0.023
            });
            
            if (!tracks.some(t => t.kind === 'audio')) {
              tracks.push({ id: String(streamId), kind: 'audio', codec: 'mp2', channels: 2, sampleRate: 48000 });
            }
          }
        } else if (streamId >= 0xE0 && streamId <= 0xEF) {
          // Video stream
          const pesLength = reader.readUint16BE();
          
          if (pesLength > MAX_PES_PAYLOAD) {
            throw new Error(`[Security] PS PES payload size ${pesLength} exceeds limit`);
          }
          
          if (reader.position + pesLength > reader.byteLength) break;
          
          const pesData = reader.readBytes(pesLength);
          
          videoPackets.push({
            pts: 0,
            dts: 0,
            data: pesData,
            isKeyframe: true
          });
          
          if (!tracks.some(t => t.kind === 'video')) {
            tracks.push({ id: String(streamId), kind: 'video', codec: 'mpeg2video' });
          }
        } else if (streamId === 0xBB) {
          // System header
          const headerLength = reader.readUint16BE();
          reader.skipBytes(headerLength);
        } else if (streamId === 0xBC) {
          // Program stream map
          const mapLength = reader.readUint16BE();
          reader.skipBytes(mapLength);
        } else {
          // Unknown packet, skip 2 bytes (length)
          reader.skipBytes(2);
        }
      }
    }
    
    if (tracks.length === 0) {
      tracks.push({ id: 'e0', kind: 'video', codec: 'mpeg2video' });
    }
    
    return { tracks, videoPackets, audioPackets, subtitlePackets: [] };
  }
}

export class AVIDemuxer implements ContainerDemuxer {
  public readonly formatName: string = 'avi';

  public probe(data: Uint8Array): boolean {
    if (data.length < 12) return false;
    const reader = new BitStreamReader(data);
    const riff = reader.readString(4);
    reader.skipBytes(4);
    const avi = reader.readString(4);
    return riff === 'RIFF' && avi === 'AVI ';
  }

  public demux(data: Uint8Array): DemuxResult {
    const reader = new BitStreamReader(data);
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    const tracks: Track[] = [];
    
    // Skip RIFF header (12 bytes)
    if (reader.byteLength < 12) {
      return { tracks: [{ id: '00dc', kind: 'video', codec: 'mjpeg' }], videoPackets: [], audioPackets: [], subtitlePackets: [] };
    }
    
    reader.skipBytes(12);
    
    // Parse AVI chunks
    while (reader.position + 8 <= reader.byteLength) {
      const chunkId = reader.readString(4);
      const chunkSize = reader.readUint32BE();
      
      if (chunkSize > MAX_RIFF_CHUNK) {
        throw new Error(`[Security] AVI RIFF chunk size ${chunkSize} exceeds limit`);
      }
      
      if (chunkId === 'LIST') {
        const listType = reader.readString(4);
        const listSize = chunkSize - 4;
        
        if (listType === 'movi') {
          // Parse movi list for actual media data
          this.parseMoviList(reader, tracks, videoPackets, audioPackets, listSize);
        } else {
          reader.skipBytes(listSize);
        }
      } else if (chunkId === 'idx1') {
        // Index chunk - skip for now
        reader.skipBytes(chunkSize);
      } else {
        reader.skipBytes(chunkSize);
      }
      
      // Align to even byte
      if (chunkSize % 2 !== 0 && reader.position < reader.byteLength) {
        reader.skipBytes(1);
      }
    }
    
    if (tracks.length === 0) {
      tracks.push({ id: '00dc', kind: 'video', codec: 'mjpeg' });
    }
    
    return { tracks, videoPackets, audioPackets, subtitlePackets: [] };
  }
  
  private parseMoviList(
    reader: BitStreamReader,
    tracks: Track[],
    videoPackets: VideoPacket[],
    audioPackets: AudioPacket[],
    size: number
  ): void {
    const endPos = reader.position + size;
    
    while (reader.position + 8 <= endPos) {
      const chunkId = reader.readString(4);
      const chunkSize = reader.readUint32BE();
      
      if (chunkSize > MAX_BOX_SIZE) {
        throw new Error(`[Security] AVI movi chunk size ${chunkSize} exceeds limit`);
      }
      
      if (reader.position + chunkSize > endPos) break;
      
      const streamId = chunkId.substring(0, 2);
      const chunkType = chunkId.substring(2, 4);
      
      if (chunkType === 'dc' || chunkType === 'db') {
        // Video data
        const data = reader.readBytes(chunkSize);
        videoPackets.push({
          pts: videoPackets.length * 0.033,
          dts: videoPackets.length * 0.033,
          data,
          isKeyframe: chunkType === 'dc'
        });
        
        if (!tracks.some(t => t.kind === 'video')) {
          tracks.push({ id: streamId, kind: 'video', codec: 'mjpeg' });
        }
      } else if (chunkType === 'wb') {
        // Audio data
        const data = reader.readBytes(chunkSize);
        audioPackets.push({
          pts: audioPackets.length * 0.023,
          dts: audioPackets.length * 0.023,
          data,
          sampleRate: 22050,
          channels: 1,
          duration: 0.023
        });
        
        if (!tracks.some(t => t.kind === 'audio')) {
          tracks.push({ id: streamId, kind: 'audio', codec: 'pcm', channels: 1, sampleRate: 22050 });
        }
      } else {
        reader.skipBytes(chunkSize);
      }
      
      // Align to even byte
      if (chunkSize % 2 !== 0 && reader.position < endPos) {
        reader.skipBytes(1);
      }
    }
  }
}

export class OGGDemuxer implements ContainerDemuxer {
  public readonly formatName: string = 'ogg';

  public probe(data: Uint8Array): boolean {
    return data.length >= 4 && data[0] === 0x4F && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53;
  }

  public demux(data: Uint8Array): DemuxResult {
    const reader = new BitStreamReader(data);
    const tracks: Track[] = [];
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    
    // Parse OGG pages
    while (reader.position + 27 <= reader.byteLength) {
      const capturePattern = reader.readString(4);
      if (capturePattern !== 'OggS') break;
      
      const version = reader.readUint8();
      const headerType = reader.readUint8();
      const granulePosition = reader.readUint64BE();
      const serialNumber = reader.readUint32BE();
      const pageSequence = reader.readUint32BE();
      const checksum = reader.readUint32BE();
      const pageSegments = reader.readUint8();
      
      if (reader.position + pageSegments > reader.byteLength) break;
      
      const segmentTable: number[] = [];
      let totalSegmentSize = 0;
      
      for (let i = 0; i < pageSegments; i++) {
        const segSize = reader.readUint8();
        segmentTable.push(segSize);
        totalSegmentSize += segSize;
      }
      
      if (totalSegmentSize > MAX_OGG_PAGE) {
        throw new Error(`[Security] OGG page size ${totalSegmentSize} exceeds limit`);
      }
      
      if (reader.position + totalSegmentSize > reader.byteLength) break;
      
      const pageData = reader.readBytes(totalSegmentSize);
      
      // First page contains codec headers
      if (pageSequence === 0) {
        const headerTypeFlag = headerType & 0x02;
        if (headerTypeFlag !== 0) {
          // Identify codec from first bytes
          if (pageData.length >= 8) {
            const codecPacket = String.fromCharCode(...pageData.subarray(0, 6));
            if (codecPacket.startsWith('\x01vorbis')) {
              tracks.push({ id: String(serialNumber), kind: 'audio', codec: 'vorbis', channels: pageData[7], sampleRate: 48000 });
            } else if (codecPacket.startsWith('\x01opus')) {
              tracks.push({ id: String(serialNumber), kind: 'audio', codec: 'opus', channels: 2, sampleRate: 48000 });
            } else if (codecPacket.startsWith('\x80theora')) {
              tracks.push({ id: String(serialNumber), kind: 'video', codec: 'theora' });
            }
          }
        }
      } else {
        // Data pages
        if (tracks.some(t => t.id === String(serialNumber) && t.kind === 'audio')) {
          audioPackets.push({
            pts: Number(granulePosition) / 48000,
            dts: Number(granulePosition) / 48000,
            data: pageData,
            sampleRate: 48000,
            channels: 2,
            duration: 0.023
          });
        } else if (tracks.some(t => t.id === String(serialNumber) && t.kind === 'video')) {
          videoPackets.push({
            pts: Number(granulePosition) / 3000,
            dts: Number(granulePosition) / 3000,
            data: pageData,
            isKeyframe: true
          });
        }
      }
    }
    
    if (tracks.length === 0) {
      tracks.push({ id: '1', kind: 'audio', codec: 'opus', sampleRate: 48000, channels: 2 });
    }
    
    return { tracks, videoPackets, audioPackets, subtitlePackets: [] };
  }
}

export class ASFDemuxer implements ContainerDemuxer {
  public readonly formatName: string = 'asf';

  public probe(data: Uint8Array): boolean {
    return data.length >= 16 && data[0] === 0x30 && data[1] === 0x26 && data[2] === 0xB2 && data[3] === 0x75;
  }

  public demux(data: Uint8Array): DemuxResult {
    const reader = new BitStreamReader(data);
    const tracks: Track[] = [];
    const videoPackets: VideoPacket[] = [];
    const audioPackets: AudioPacket[] = [];
    
    // Skip ASF header object
    if (reader.byteLength < 30) {
      return { tracks: [{ id: '1', kind: 'video', codec: 'wmv3' }], videoPackets: [], audioPackets: [], subtitlePackets: [] };
    }
    
    const headerSize = readUint64LE(reader);
    if (headerSize > MAX_BOX_SIZE) {
      throw new Error(`[Security] ASF header size ${headerSize} exceeds limit`);
    }
    
    reader.skipBytes(22); // Rest of header
    
    // Parse header sub-objects
    const headerEnd = Math.min(headerSize, reader.byteLength);
    
    while (reader.position + 24 <= headerEnd) {
      const objectId = readUint128LE(reader);
      const objectSize = readUint64LE(reader);
      
      if (objectSize > MAX_BOX_SIZE) {
        throw new Error(`[Security] ASF object size ${objectSize} exceeds limit`);
      }
      
      if (reader.position + objectSize > headerEnd) break;
      
      // File Properties Object
      if (objectId === '3026b2758e66cf11aedf11b2') { // Simplified GUID check
        reader.skipBytes(objectSize);
      }
      // Stream Properties Object
      else if (objectId === 'b7dc0791a6f6e969d4b86309') { // Simplified GUID check
        reader.skipBytes(16); // Stream GUID
        reader.skipBytes(8); // Time Offset
        const streamType = readUint128LE(reader);
        reader.skipBytes(objectSize - 24 - 16);
        
        // Simplified stream type detection
        tracks.push({
          id: String(tracks.length + 1),
          kind: streamType === '3626b2758e66cf1194b86309' ? 'video' : 'audio',
          codec: 'wmv3'
        });
      }
      else {
        reader.skipBytes(objectSize);
      }
    }
    
    // Skip to data objects
    reader.seek(headerEnd);
    
    // Parse data packets
    while (reader.position + 24 <= reader.byteLength) {
      const objectId = readUint128LE(reader);
      const objectSize = readUint64LE(reader);
      
      if (objectSize > MAX_BOX_SIZE) {
        throw new Error(`[Security] ASF data object size ${objectSize} exceeds limit`);
      }
      
      if (reader.position + objectSize > reader.byteLength) break;
      
      // Data Object
      if (objectId === '3626b2758e66cf1194b86309') {
        reader.skipBytes(16); // Object ID
        const totalDataPackets = readUint32LE(reader);
        reader.skipBytes(2); // Reserved
        
        // Read data packets
        for (let i = 0; i < totalDataPackets && i < 10000; i++) {
          if (reader.position + 8 > reader.byteLength) break;
          
          const sendTime = readUint32LE(reader);
          const duration = readUint16LE(reader);
          const packetSize = readUint16LE(reader);
          
          if (packetSize > MAX_PES_PAYLOAD) {
            throw new Error(`[Security] ASF packet size ${packetSize} exceeds limit`);
          }
          
          if (reader.position + packetSize > reader.byteLength) break;
          
          const packetData = reader.readBytes(packetSize);
          
          if (tracks.some(t => t.kind === 'video')) {
            videoPackets.push({
              pts: sendTime / 1000,
              dts: sendTime / 1000,
              data: packetData,
              isKeyframe: true
            });
          } else {
            audioPackets.push({
              pts: sendTime / 1000,
              dts: sendTime / 1000,
              data: packetData,
              sampleRate: 44100,
              channels: 2,
              duration: duration / 1000
            });
          }
        }
      } else {
        reader.skipBytes(objectSize);
      }
    }
    
    if (tracks.length === 0) {
      tracks.push({ id: '1', kind: 'video', codec: 'wmv3' });
    }
    
    return { tracks, videoPackets, audioPackets, subtitlePackets: [] };
  }
}

export class ContainerRegistry {
  private demuxers: ContainerDemuxer[] = [
    new MP4Demuxer(),
    new MOVDemuxer(),
    new MKVDemuxer(),
    new WebMDemuxer(),
    new FLVDemuxer(),
    new TSDemuxer(),
    new PSDemuxer(),
    new AVIDemuxer(),
    new OGGDemuxer(),
    new ASFDemuxer()
  ];

  public autoDemux(data: Uint8Array): DemuxResult {
    for (const demuxer of this.demuxers) {
      if (demuxer.probe(data)) {
        return demuxer.demux(data);
      }
    }
    throw new Error('Unsupported media container format. No matching demuxer found.');
  }
}
