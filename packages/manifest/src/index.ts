// Security limits
const MAX_MANIFEST_SIZE = 10 * 1024 * 1024;   // 10MB max manifest
const MAX_SEGMENTS = 100000;                    // Max segments per playlist
const MAX_RENDITIONS = 100;                     // Max renditions
const MAX_XML_DEPTH = 20;                       // Max XML nesting
const MAX_XML_ATTRIBUTES = 100;                 // Max attributes per element

export interface SegmentRef {
  id: string;
  url: string;
  durationSeconds: number;
  byteRange?: { offset: number; length: number };
  isInitialization?: boolean;
}

export interface EncryptionInfo {
  method: string;
  uri?: string;
  iv?: string;
}

export interface Rendition {
  id: string;
  bandwidth: number; // bits per second
  width?: number;
  height?: number;
  frameRate?: number;
  codecs: string;
  url: string;
  segments: SegmentRef[];
}

export interface LowLatencyConfig {
  canBlockReload: boolean;
  canSkipUntil: number;
  holdBack: number;
  partHoldBack: number;
  lastPart: number;
}

export interface VariantPlaylist {
  type: 'hls' | 'dash';
  targetDuration: number;
  isLive: boolean;
  renditions: Rendition[];
  audioRenditions: Rendition[];
  subtitleRenditions: Rendition[];
  encryption?: EncryptionInfo;
  lowLatency?: LowLatencyConfig;
}

/**
 * HLS m3u8 Parser supporting Master and Media Playlists, LL-HLS tags.
 */
export class HLSParser {
  public static parse(manifestText: string, baseUrl: string): VariantPlaylist {
    // Security: check manifest size
    if (manifestText.length > MAX_MANIFEST_SIZE) {
      throw new Error(`[Security] HLS manifest size ${manifestText.length} exceeds maximum limit`);
    }
    
    const lines = manifestText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0 || lines[0] !== '#EXTM3U') {
      throw new Error('Invalid HLS Manifest: Missing #EXTM3U header');
    }

    const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));

    if (isMaster) {
      return this.parseMasterPlaylist(lines, baseUrl);
    } else {
      return this.parseMediaPlaylist(lines, baseUrl);
    }
  }

  private static parseMasterPlaylist(lines: string[], baseUrl: string): VariantPlaylist {
    const renditions: Rendition[] = [];
    const audioRenditions: Rendition[] = [];
    const subtitleRenditions: Rendition[] = [];
    let currentBandwidth = 0;
    let currentWidth: number | undefined;
    let currentHeight: number | undefined;
    let currentCodecs = 'avc1.4d401f,mp4a.40.2';
    let targetDuration = 10;
    let isLive = false;

    for (let i = 0; i < lines.length && renditions.length < MAX_RENDITIONS; i++) {
      const line = lines[i];
      
      // Parse #EXT-X-MEDIA for audio/subtitle renditions
      if (line.startsWith('#EXT-X-MEDIA:')) {
        const mediaRendition = this.parseMediaTag(line, baseUrl);
        if (mediaRendition) {
          if (mediaRendition.kind === 'audio') {
            audioRenditions.push(mediaRendition.rendition);
          } else if (mediaRendition.kind === 'subtitle') {
            subtitleRenditions.push(mediaRendition.rendition);
          }
        }
      }
      // Parse #EXT-X-STREAM-INF
      else if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const attrStr = line.substring(18);
        const bwMatch = attrStr.match(/BANDWIDTH=(\d+)/);
        if (bwMatch) currentBandwidth = parseInt(bwMatch[1], 10);

        const resMatch = attrStr.match(/RESOLUTION=(\d+)x(\d+)/);
        if (resMatch) {
          currentWidth = parseInt(resMatch[1], 10);
          currentHeight = parseInt(resMatch[2], 10);
        }

        const codecMatch = attrStr.match(/CODECS="([^"]+)"/);
        if (codecMatch) currentCodecs = codecMatch[1];
        
        const frameRateMatch = attrStr.match(/FRAME-RATE=([\d.]+)/);
        if (frameRateMatch) {
          // Store frame rate but don't add to rendition yet
        }

        // Next line is the URI
        if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
          const uri = lines[i + 1];
          const fullUrl = this.resolveUrl(baseUrl, uri);
          renditions.push({
            id: `hls-${renditions.length}`,
            bandwidth: currentBandwidth,
            width: currentWidth,
            height: currentHeight,
            codecs: currentCodecs,
            url: fullUrl,
            segments: []
          });
          i++;
        }
      }
      // Parse #EXT-X-TARGETDURATION
      else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = parseFloat(line.substring(22));
      }
      // Parse #EXT-X-ENDLIST
      else if (line.startsWith('#EXT-X-ENDLIST')) {
        isLive = false;
      }
    }

    return {
      type: 'hls',
      targetDuration,
      isLive,
      renditions,
      audioRenditions,
      subtitleRenditions
    };
  }

  private static parseMediaTag(line: string, baseUrl: string): { kind: string; rendition: Rendition } | null {
    const attrs = this.parseAttributes(line.substring(13));
    const type = attrs.get('TYPE');
    const name = attrs.get('NAME') || attrs.get('GROUP-ID') || '';
    const uri = attrs.get('URI');
    const language = attrs.get('LANGUAGE') || 'und';
    const defaultFlag = attrs.get('DEFAULT') === 'YES';
    
    if (!type || !uri) return null;
    
    const kind = type.toLowerCase();
    const rendition: Rendition = {
      id: `hls-${kind}-${name}`,
      bandwidth: 0,
      codecs: attrs.get('CODECS') || '',
      url: this.resolveUrl(baseUrl, uri.replace(/"/g, '')),
      segments: []
    };
    
    return { kind, rendition };
  }

  private static parseMediaPlaylist(lines: string[], baseUrl: string): VariantPlaylist {
    const segments: SegmentRef[] = [];
    let targetDuration = 10;
    let currentSegDuration = 0;
    let isLive = true;
    let encryption: EncryptionInfo | undefined;
    let currentByteRange: { offset: number; length: number } | undefined;
    let isInitialization = false;

    for (let i = 0; i < lines.length && segments.length < MAX_SEGMENTS; i++) {
      const line = lines[i];
      
      if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = parseFloat(line.substring(22));
      } else if (line.startsWith('#EXT-X-ENDLIST')) {
        isLive = false;
      } else if (line.startsWith('#EXT-X-MAP:')) {
        // Init segment
        const attrs = this.parseAttributes(line.substring(11));
        const uri = attrs.get('URI');
        if (uri) {
          segments.push({
            id: `init-${segments.length}`,
            url: this.resolveUrl(baseUrl, uri.replace(/"/g, '')),
            durationSeconds: 0,
            isInitialization: true
          });
        }
      } else if (line.startsWith('#EXT-X-KEY:')) {
        // Encryption info
        const attrs = this.parseAttributes(line.substring(11));
        const method = attrs.get('METHOD');
        const uri = attrs.get('URI');
        const iv = attrs.get('IV');
        
        if (method && method !== 'NONE') {
          encryption = {
            method,
            uri: uri ? uri.replace(/"/g, '') : undefined,
            iv: iv || undefined
          };
        } else {
          encryption = undefined;
        }
      } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
        // Byte range for next segment
        const match = line.match(/#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/);
        if (match) {
          const length = parseInt(match[1], 10);
          const offset = match[2] ? parseInt(match[2], 10) : undefined;
          currentByteRange = { offset: offset || 0, length };
        }
      } else if (line.startsWith('#EXTINF:')) {
        const durMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durMatch) currentSegDuration = parseFloat(durMatch[1]);
        
        if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
          const uri = lines[i + 1];
          const segment: SegmentRef = {
            id: `seg-${segments.length}`,
            url: this.resolveUrl(baseUrl, uri),
            durationSeconds: currentSegDuration
          };
          
          if (currentByteRange) {
            segment.byteRange = currentByteRange;
            currentByteRange = undefined;
          }
          
          segments.push(segment);
          i++;
        }
      }
    }

    const singleRendition: Rendition = {
      id: 'hls-single',
      bandwidth: 2500000,
      codecs: 'avc1.4d401f,mp4a.40.2',
      url: baseUrl,
      segments
    };

    return {
      type: 'hls',
      targetDuration,
      isLive,
      renditions: [singleRendition],
      audioRenditions: [],
      subtitleRenditions: [],
      encryption
    };
  }

  private static parseAttributes(attrStr: string): Map<string, string> {
    const attrs = new Map<string, string>();
    // Handle quoted values
    const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g;
    let match;
    
    while ((match = regex.exec(attrStr))) {
      const key = match[1];
      const value = match[2] !== undefined ? match[2] : match[3];
      attrs.set(key, value);
    }
    
    return attrs;
  }

  private static resolveUrl(base: string, relative: string): string {
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  }
}

/**
 * DASH mpd XML Parser supporting AdaptationSets, Representations, and SegmentTemplates.
 */
export class DASHParser {
  public static parse(xmlText: string, baseUrl: string): VariantPlaylist {
    // Security: check manifest size
    if (xmlText.length > MAX_MANIFEST_SIZE) {
      throw new Error(`[Security] DASH manifest size ${xmlText.length} exceeds maximum limit`);
    }
    
    const renditions: Rendition[] = [];
    const audioRenditions: Rendition[] = [];
    const subtitleRenditions: Rendition[] = [];
    let targetDuration = 4;
    let isLive = xmlText.includes('type="dynamic"');
    
    // Parse BaseURL if present
    const baseUrlMatch = xmlText.match(/<BaseURL>([^<]+)<\/BaseURL>/);
    const effectiveBaseUrl = baseUrlMatch ? this.resolveUrl(baseUrl, baseUrlMatch[1]) : baseUrl;
    
    // Parse AdaptationSets
    const adaptationSets = Array.from(xmlText.matchAll(/<AdaptationSet\s+([^>]*)>([\s\S]*?)<\/AdaptationSet>/g));
    
    for (const asMatch of adaptationSets) {
      const asAttrs = asMatch[1];
      const asContent = asMatch[2];
      
      const asMimeType = this.getAttribute(asAttrs, 'mimeType') || '';
      const asContentType = this.getAttribute(asAttrs, 'contentType') || '';
      const asLang = this.getAttribute(asAttrs, 'lang') || 'und';
      
      // Determine if this is video, audio, or subtitle
      let streamType = 'video';
      if (asContentType === 'audio' || asMimeType.startsWith('audio')) {
        streamType = 'audio';
      } else if (asContentType === 'text' || asMimeType.includes('text/') || asMimeType.includes('ttml')) {
        streamType = 'subtitle';
      }
      
      // Parse Representations within this AdaptationSet
      const repMatches = Array.from(asContent.matchAll(/<Representation\s+([^>]+)>([\s\S]*?)<\/Representation>/g));
      
      // Parse SegmentTemplate if present
      const segTemplateMatch = asContent.match(/<SegmentTemplate\s+([^>]+)>/);
      let timescale = 1;
      let initialization = '';
      let media = '';
      let startNumber = 1;
      
      if (segTemplateMatch) {
        const segAttrs = segTemplateMatch[1];
        timescale = parseInt(this.getAttribute(segAttrs, 'timescale') || '1', 10);
        initialization = this.getAttribute(segAttrs, 'initialization') || '';
        media = this.getAttribute(segAttrs, 'media') || '';
        startNumber = parseInt(this.getAttribute(segAttrs, 'startNumber') || '1', 10);
      }
      
      // Parse SegmentTimeline if present
      const segTimelineMatch = asContent.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/);
      let timelineSegments: { t: number; d: number; r: number }[] = [];
      
      if (segTimelineMatch) {
        const sElements = Array.from(segTimelineMatch[1].matchAll(/<S\s+([^>]+)\/>/g));
        let currentTime = 0;
        
        for (const sMatch of sElements) {
          const sAttrs = sMatch[1];
          const t = parseInt(this.getAttribute(sAttrs, 't') || String(currentTime), 10);
          const d = parseInt(this.getAttribute(sAttrs, 'd') || '0', 10);
          const r = parseInt(this.getAttribute(sAttrs, 'r') || '0', 10);
          
          currentTime = t;
          timelineSegments.push({ t, d, r });
          
          // Advance time by duration * (repeat + 1)
          currentTime += d * (r + 1);
        }
      }
      
      for (let idx = 0; idx < repMatches.length && renditions.length < MAX_RENDITIONS; idx++) {
        const repAttrs = repMatches[idx][1];
        const bwMatch = repAttrs.match(/bandwidth="(\d+)"/);
        const widthMatch = repAttrs.match(/width="(\d+)"/);
        const heightMatch = repAttrs.match(/height="(\d+)"/);
        const codecsMatch = repAttrs.match(/codecs="([^"]+)"/);
        const idMatch = repAttrs.match(/id="([^"]+)"/);
        const frameRateMatch = repAttrs.match(/frameRate="([^"]+)"/);

        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 1000000;
        const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined;
        const height = heightMatch ? parseInt(heightMatch[1], 10) : undefined;
        const codecs = codecsMatch ? codecsMatch[1] : 'avc1.4d401f';
        const repId = idMatch ? idMatch[1] : `rep-${idx}`;
        const frameRate = frameRateMatch ? parseFloat(frameRateMatch[1]) : undefined;
        
        // Generate segments from SegmentTemplate or SegmentTimeline
        const segments: SegmentRef[] = [];
        
        if (timelineSegments.length > 0 && media) {
          // Generate segments from timeline
          let segmentIndex = startNumber;
          
          for (const timeline of timelineSegments) {
            const repeats = timeline.r + 1;
            
            for (let r = 0; r < repeats && segments.length < MAX_SEGMENTS; r++) {
              const segmentUrl = this.generateSegmentUrl(
                effectiveBaseUrl,
                media,
                initialization,
                segmentIndex,
                timeline.t + timeline.d * r,
                timescale
              );
              
              segments.push({
                id: `seg-${segmentIndex}`,
                url: segmentUrl,
                durationSeconds: timeline.d / timescale,
                isInitialization: segmentIndex === startNumber && r === 0
              });
              
              segmentIndex++;
            }
          }
        }
        
        const rendition: Rendition = {
          id: `dash-${streamType}-${repId}`,
          bandwidth,
          width,
          height,
          frameRate,
          codecs,
          url: effectiveBaseUrl,
          segments
        };
        
        if (streamType === 'video') {
          renditions.push(rendition);
        } else if (streamType === 'audio') {
          audioRenditions.push(rendition);
        } else {
          subtitleRenditions.push(rendition);
        }
      }
    }
    
    // Fallback: if no AdaptationSets found, try direct Representation parsing
    if (adaptationSets.length === 0) {
      const repMatches = Array.from(xmlText.matchAll(/<Representation\s+([^>]+)>/g));

      for (let idx = 0; idx < repMatches.length && renditions.length < MAX_RENDITIONS; idx++) {
        const attrsStr = repMatches[idx][1];
        const bwMatch = attrsStr.match(/bandwidth="(\d+)"/);
        const widthMatch = attrsStr.match(/width="(\d+)"/);
        const heightMatch = attrsStr.match(/height="(\d+)"/);
        const codecsMatch = attrsStr.match(/codecs="([^"]+)"/);

        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 1000000;
        const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined;
        const height = heightMatch ? parseInt(heightMatch[1], 10) : undefined;
        const codecs = codecsMatch ? codecsMatch[1] : 'avc1.4d401f';

        renditions.push({
          id: `dash-rep-${idx}`,
          bandwidth,
          width,
          height,
          codecs,
          url: effectiveBaseUrl,
          segments: []
        });
      }
    }

    return {
      type: 'dash',
      targetDuration,
      isLive,
      renditions,
      audioRenditions,
      subtitleRenditions
    };
  }
  
  private static getAttribute(attrs: string, name: string): string | null {
    const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return match ? match[1] : null;
  }
  
  private static generateSegmentUrl(
    baseUrl: string,
    mediaTemplate: string,
    initTemplate: string,
    index: number,
    time: number,
    timescale: number
  ): string {
    let url = mediaTemplate;
    
    // Replace $Number$ with segment number
    url = url.replace(/\$Number\$(?:%(\d+)d)?/g, (_, pad) => {
      return pad ? String(index).padStart(parseInt(pad), '0') : String(index);
    });
    
    // Replace $Time$ with time value
    url = url.replace(/\$Time\$/g, String(time));
    
    // Replace $Bandwidth$ placeholder
    url = url.replace(/\$Bandwidth\$/g, '0');
    
    // Replace $RepresentationID$
    url = url.replace(/\$RepresentationID\$/g, '0');
    
    // Handle time format ($$...$$) - simplified
    url = url.replace(/\$\$([^$]+)\$\$/g, '$1');
    
    return new URL(url, baseUrl).href;
  }
  
  private static resolveUrl(base: string, relative: string): string {
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  }
}
