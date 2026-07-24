<div align="center">

<!-- Media Focus Header SVG -->
<img src="./docs/assets/vido-header.svg" alt="VidoLib - Zero-Dependency Browser Media Engine" width="100%" />

<br/>

### The Native, Zero-Dependency Browser Media Engine

**High-performance hardware-accelerated playback, transcoding, and processing**
*for HLS, DASH, MP4, WebM, MKV, FLV, TS & Subtitles — without 30MB FFmpeg WASM bloat.*

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSING.md)
[![Status: Pre-release](https://img.shields.io/badge/Status-Pre--release-orange.svg?style=for-the-badge)](#-building--local-development)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)
[![Tests](https://img.shields.io/badge/Tests-118%20passed-brightgreen.svg?style=for-the-badge)](#-testing)

<br/>

[🚀 Quick Start](#-building--local-development) • [⚡ Why No FFmpeg?](#-why-no-ffmpeg-wasm) • [🎥 Capabilities](#-native-browser-ffmpeg-equivalent-capabilities) • [🏗️ Architecture](#-architecture-overview) • [📦 Packages](#-package-ecosystem) • [🤝 Contributing](#-contributing--developer-guide)

</div>

---

## ✨ Why VidoLib?

Traditional web media players fall into two traps:

| Problem | Description |
|---------|-------------|
| 🐘 **Monolithic & Heavy** | Giant 15MB–40MB FFmpeg WASM binaries that drain mobile battery, stall startup by 3+ seconds, and consume hundreds of MB of RAM |
| 🔒 **Standard Player Lock-in** | Hardcoded layout, network logic, and UI into rigid single-package players that are difficult to customize or extend |

### VidoLib takes a runtime-first, modular approach:

| Feature | Description |
|---------|-------------|
| 🚀 **Zero-Copy & Hardware-Accelerated** | Direct integration with browser `WebCodecs API`, `WebAudio/AudioWorklet`, and `WebGL/WebGPU` hardware decoding paths |
| ⚡ **Lightweight Core** | `@vidolib/core` weighs **only 3.4 KB gzipped** with zero bundled decoders |
| 🧩 **100% Plugin-Based** | Every container parser, ABR algorithm, subtitle renderer, and UI component is an independent plugin |
| 🛡️ **Patent Safe** | Hardware decoding for patented codecs (H.264, HEVC, AC-3) eliminates patent pool liabilities |

---

## 🚀 Building & Local Development

```bash
# 1. Clone the repository
git clone git@github.com:swadhinbiswas/VidoLib.git
cd VidoLib

# 2. Install development dependencies
npm install

# 3. Build all 22 monorepo packages
npm run build

# 4. Run tests
npx vitest run

# 5. Run fuzz testing
node scripts/fuzz-all.js
```

### Quick Usage Example

```typescript
import { Player } from '@vidolib/core';
import { PlayerUI } from '@vidolib/ui';

// Initialize core VidoLib runtime
const player = new Player();

// Bind WCAG 2.1 AA accessible UI controls
const container = document.getElementById('player-root');
const ui = new PlayerUI(player, container);

// Load and play media
await player.load('https://example.com/video.mp4');
player.play();
```

---

## ⚡ Why No FFmpeg WASM?

> *Read our full breakdown: [NO_FFMPEG_MANIFESTO.md](./docs/NO_FFMPEG_MANIFESTO.md)*

| Metric | 🎯 VidoLib | 🐌 FFmpeg WASM |
|--------|-----------|----------------|
| **Engine Download** | **3.4 KB – 30 KB** | 15 MB – 40 MB |
| **Startup Latency** | **< 110 ms** | 1,500 ms – 4,000 ms |
| **Battery Impact** | **Minimal** (OS Hardware Decoders) | Heavy (CPU-bound WASM) |
| **Memory Footprint** | **< 18 MB RAM** | 150 MB – 400 MB RAM |
| **Mobile Support** | **100% Native** | Often crashes iOS Safari |

---

## 🎥 Native Browser FFmpeg-Equivalent Capabilities

VidoLib implements classic FFmpeg operations natively using modern web standards:

<table>
<tr>
<td width="50%" valign="top">

### 🔄 Transcoding
**`@vidolib/transcoder`**
GPU-accelerated client-side video frame encoding to H.264/VP9 via `VideoEncoder`.

```typescript
const encoder = new HardwareVideoEncoder();
await encoder.init({
  codec: 'avc1.4d401f',
  width: 1920, height: 1080,
  bitrate: 2_000_000
}, onPacket);
```

</td>
<td width="50%" valign="top">

### 🎨 Filters
**`@vidolib/filters`**
Real-time GPU Video Filters: Green Screen, Brightness, Contrast, Blur, Watermark.

```typescript
const processor = new VideoFilterProcessor(canvas);
processor.applyFilters(videoFrame, {
  brightness: 1.1,
  contrast: 1.2,
  chromaKeyGreen: true
});
```

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔴 Recording
**`@vidolib/recorder`**
Zero-Lag Canvas & Screen Recording to downloadable MP4/WebM files.

```typescript
const recorder = new MediaRecorderPipeline(stream);
recorder.start();
setTimeout(async () => {
  const blob = await recorder.stop();
  recorder.download('video.webm', blob);
}, 10000);
```

</td>
<td width="50%" valign="top">

### 📦 Containers
**`@vidolib/containers`**
Multi-Container Demuxing: MP4, MKV, WebM, AVI, MOV, FLV, TS, PS, OGG, ASF.

```typescript
const registry = new ContainerRegistry();
const result = registry.autoDemux(u8ArrayBuffer);
console.log('Tracks:', result.tracks);
```

</td>
</tr>
</table>

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Host Application                         │
└─────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│                     @vidolib/ui                             │
│           WCAG 2.1 AA Accessible Controls                   │
└─────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│                    @vidolib/core                             │
│    [Player] ←→ [Clock] ←→ [Pipeline] ←→ [Plugin Registry]  │
└─────────────────────────────────────────────────────────────┘
          │                   │                   │
┌─────────────┐    ┌───────────────┐    ┌─────────────────┐
│   stream/   │    │  containers/  │    │    renderer/    │
│   buffer/   │    │ (10 demuxers) │    │ (WebGL/WebGPU)  │
└─────────────┘    └───────────────┘    └─────────────────┘
          │                   │                   │
┌─────────────┐    ┌───────────────┐    ┌─────────────────┐
│  manifest/  │    │    worker/    │    │   subtitle/     │
│    abr/     │    │  (Transfer)   │    │  (ASS/SRT/VTT)  │
└─────────────┘    └───────────────┘    └─────────────────┘
```

---

## 📦 Package Ecosystem

| Package | Purpose | Size |
|---------|---------|------|
| [`@vidolib/core`](./packages/core) | Player, Clock, Pipeline, EventBus | **3.44 KB** |
| [`@vidolib/stream`](./packages/stream) | HTTP Range, Blob, File, WebSocket, WebRTC | **2.83 KB** |
| [`@vidolib/containers`](./packages/containers) | MP4, MKV, WebM, AVI, MOV, FLV, TS, PS, OGG, ASF | **14.11 KB** |
| [`@vidolib/manifest`](./packages/manifest) | HLS (`.m3u8`) & DASH (`.mpd`) parsers | **6.99 KB** |
| [`@vidolib/abr`](./packages/abr) | EWMA throughput & buffer-based ABR | **1.75 KB** |
| [`@vidolib/codecs`](./packages/codecs) | WebCodecs / Native / WASM negotiator | **4.63 KB** |
| [`@vidolib/transcoder`](./packages/transcoder) | WebCodecs video/audio encoder | **1.50 KB** |
| [`@vidolib/filters`](./packages/filters) | WebGL Chroma Key, Brightness, Blur, Watermark | **3.34 KB** |
| [`@vidolib/recorder`](./packages/recorder) | Canvas & MediaStream MP4/WebM recorder | **1.62 KB** |
| [`@vidolib/renderer`](./packages/renderer) | Canvas2D, WebGL, WebGPU backends | **5.36 KB** |
| [`@vidolib/subtitle`](./packages/subtitle) | ASS, SRT, VTT subtitle engine | **5.21 KB** |
| [`@vidolib/ui`](./packages/ui) | WCAG 2.1 AA accessible glassmorphic UI | **5.49 KB** |
| [`@vidolib/worker`](./packages/worker) | Web Worker pipeline with error handling | **2.73 KB** |
| [`@vidolib/telemetry`](./packages/telemetry) | Zero-tracking QoE metrics | **1.76 KB** |
| [`@vidolib/security`](./packages/security) | Container parser fuzzing & CSP | **1.83 KB** |
| [`@vidolib/plugins`](./packages/plugins) | Plugin registry & lifecycle | **1.42 KB** |
| [`@vidolib/utils`](./packages/utils) | BitStreamReader, RingBuffer, Logger | **2.90 KB** |

---

## 🧪 Testing

```bash
# Run all unit tests (118 tests)
npx vitest run

# Run fuzz testing (8000 iterations across all demuxers)
node scripts/fuzz-all.js

# Run specific package tests
npx vitest run packages/containers/src/index.test.ts
npx vitest run packages/manifest/src/index.test.ts
```

### Test Coverage

| Package | Tests | Status |
|---------|-------|--------|
| `@vidolib/containers` | 26 | ✅ |
| `@vidolib/manifest` | 17 | ✅ |
| `@vidolib/codecs` | 15 | ✅ |
| `@vidolib/subtitle` | 15 | ✅ |
| `@vidolib/filters` | 12 | ✅ |
| `@vidolib/worker` | 12 | ✅ |
| `@vidolib/renderer` | 9 | ✅ |
| `@vidolib/core` | 8 | ✅ |
| `@vidolib/utils` | 2 | ✅ |
| `@vidolib/ui` | 1 | ✅ |

---

## 🤝 Contributing & Developer Guide

We welcome contributions from developers worldwide!

| Resource | Description |
|----------|-------------|
| 📖 **[Contributor Guide](./CONTRIBUTING.md)** | Setup, build system, and PR guidelines |
| 🏗️ **[Architecture Deep-Dive](./docs/ARCHITECTURE.md)** | Core engine flow, Web Worker pipelines, and memory model |
| 🔌 **[Plugin Authoring Guide](./docs/PLUGINS.md)** | Build custom plugins in < 30 lines of code |
| 🗺️ **[Open Roadmap](./docs/ROADMAP.md)** | Pick up an open feature task! |

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSING.md`](./LICENSING.md) for full codec licensing guardrails and royalty-free allow-list details.

<br/>

<!-- Footer SVG -->
<img src="./docs/assets/vido-divider.svg" alt="divider" width="100%" />

<div align="center">

**Built with ❤️ using WebCodecs • WebGL • WebGPU • Web Workers**

</div>

<img src="./docs/assets/vido-footer.svg" alt="footer" width="100%" />
