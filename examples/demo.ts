import { Player } from '@vidolib/core';
import { HTTPRangeSource } from '@vidolib/stream';
import { HLSParser } from '@vidolib/manifest';
import { ABRController } from '@vidolib/abr';
import { ContainerRegistry } from '@vidolib/containers';
import { CodecNegotiator } from '@vidolib/codecs';
import { TelemetryPlugin } from '@vidolib/telemetry';

async function main() {
  console.log('--- media-runtime TypeScript Integration Example ---');

  // 1. Capability Negotiation
  const capability = await CodecNegotiator.negotiateVideo('avc1.4d401f', 1920, 1080);
  console.log('Negotiated Video Decoder Capability:', capability);

  // 2. Stream Source
  const streamSource = new HTTPRangeSource('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  console.log('Stream Source Type:', streamSource.type);

  // 3. Manifest Parsing
  const manifestText = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=720x480,CODECS="avc1.4d401f,mp4a.40.2"
rendition-480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
rendition-720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.4d401f,mp4a.40.2"
rendition-1080p.m3u8`;

  const playlist = HLSParser.parse(manifestText, 'https://test-streams.mux.dev/x36xhzz/');
  console.log('Parsed HLS Renditions:', playlist.renditions.length);

  // 4. ABR Controller
  const abr = new ABRController();
  abr.recordSample(2_500_000, 1000); // 20 Mbps link
  const selected = abr.selectRendition(playlist.renditions, playlist.renditions[0], 8.0);
  console.log('ABR Selected Rendition Bandwidth:', selected.bandwidth, 'Resolution:', `${selected.width}x${selected.height}`);

  // 5. Initialize Player
  const player = new Player();
  const telemetry = new TelemetryPlugin();
  await player.use(telemetry);

  player.on('statechange', (state: any) => console.log('Player State:', state));
  player.play();
  player.seek(30);
  player.pause();
}

main().catch(console.error);
