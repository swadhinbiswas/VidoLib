<div align="center">
<img src="./docs/logo.png" alt="VidoLib logo" width="180" />

# VidoLib

**The Native, Zero-Dependency Browser Media Engine**

Hardware-accelerated playback, transcoding, and processing for HLS, DASH, MP4, WebM, MKV, FLV, TS, and subtitles — without a 30 MB FFmpeg WASM binary.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/github/license/swadhinbiswas/VidoLib?style=flat-square)](./LICENSING.md)
[![Status](https://img.shields.io/badge/status-pre--release-orange?style=flat-square)](#quick-start)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](./CONTRIBUTING.md)

[![Last Commit](https://img.shields.io/github/last-commit/swadhinbiswas/VidoLib?style=flat-square)](https://github.com/swadhinbiswas/VidoLib/commits)
[![Repo Size](https://img.shields.io/github/repo-size/swadhinbiswas/VidoLib?style=flat-square)](https://github.com/swadhinbiswas/VidoLib)
[![Open Issues](https://img.shields.io/github/issues/swadhinbiswas/VidoLib?style=flat-square)](https://github.com/swadhinbiswas/VidoLib/issues)
[![Open PRs](https://img.shields.io/github/issues-pr/swadhinbiswas/VidoLib?style=flat-square)](https://github.com/swadhinbiswas/VidoLib/pulls)
[![Contributors](https://img.shields.io/github/contributors/swadhinbiswas/VidoLib?style=flat-square)](https://github.com/swadhinbiswas/VidoLib/graphs/contributors)
[![Repo Views](https://komarev.com/ghpvc/?username=swadhinbiswas&repo=VidoLib&label=Repo%20Views&color=blue&style=flat-square)](https://github.com/swadhinbiswas/VidoLib)

</div>

> [!WARNING]
> VidoLib is in active pre-release development. Packages are built locally from source and are not yet published to npm. APIs may change without notice before v1.0.0.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Native Browser FFmpeg-Equivalent Capabilities](#native-browser-ffmpeg-equivalent-capabilities)
- [Why No FFmpeg WASM](#why-no-ffmpeg-wasm)
- [Architecture Overview](#architecture-overview)
- [Package Ecosystem](#package-ecosystem)
- [Contributing and Developer Guide](#contributing-and-developer-guide)
- [Contributors](#contributors)
- [Project Activity](#project-activity)
- [License and Codec Policy](#license-and-codec-policy)

---

## Overview

Traditional web media players tend to fall into one of two traps:

1. **Monolithic and heavy.** Bundling a 15–40 MB FFmpeg WASM binary that drains mobile battery, adds 1.5–4 seconds to startup, and holds hundreds of megabytes of RAM for the life of the session.
2. **Standard-player lock-in.** Hardcoding layout, network logic, and UI into a single rigid package that's difficult to customize, tree-shake, or extend.

VidoLib takes a runtime-first, modular approach instead:

- **Zero-copy and hardware-accelerated** — direct integration with the browser's `WebCodecs`, `WebAudio` / `AudioWorklet`, and `WebGL` / `WebGPU` decode paths, so frames never round-trip through a software decoder.
- **Lightweight core** — `@vidolib/core` ships at **3.4 KB gzipped** with zero bundled decoders.
- **Fully plugin-based** — every container parser, ABR algorithm, subtitle renderer, and UI component is an independent, tree-shakeable package.
- **Patent-safe by construction** — hardware decoding for licensed codecs (H.264, HEVC, AC-3) keeps patent-pool liability off the application layer.

> [!TIP]
> Only import the plugins you actually use. Because every capability ships as a separate package, a minimal HLS-only player can land well under 15 KB gzipped — a fraction of a single FFmpeg WASM chunk.

[Back to top](#vidolib)

---

## Quick Start

VidoLib is currently source-only. Clone and build locally to try it:

```bash
# 1. Clone the repository
git clone https://github.com/swadhinbiswas/VidoLib.git
cd VidoLib

# 2. Install workspace dependencies
npm install

# 3. Build all 22 monorepo packages
npm run build

# 4. Run the test and verification suite
node scripts/test-runner.js
```

> [!NOTE]
> The build step compiles each package with esbuild and generates TypeScript declarations. Make sure Node.js and npm are available before running `npm run build`.

### Usage in local projects

Import directly from the compiled `dist/` output, or link packages into your own workspace:

```typescript
import { Player } from './packages/core/dist/index.js';
import { PlayerUI } from './packages/ui/dist/index.js';

// Initialize the core runtime
const player = new Player();

// Mount a WCAG 2.1 AA accessible UI
const container = document.getElementById('player-root');
const ui = new PlayerUI(player, container);

// Load and play
await player.load('https://example.com/video.mp4');
player.play();
```

[Back to top](#vidolib)

---

## Native Browser FFmpeg-Equivalent Capabilities

VidoLib re-implements the FFmpeg operations most web apps actually need, natively, using `WebCodecs`, `WebGL`, `WebAudio`, and `Streams`:

| Capability | Package | Description |
|---|---|---|
| Hardware transcoding and re-encoding | [`@vidolib/transcoder`](./packages/transcoder) | GPU-accelerated client-side re-encoding to H.264 / VP9 via `VideoEncoder`. |
| GPU video and audio filters | [`@vidolib/filters`](./packages/filters) | Real-time chroma key, color balance, brightness, contrast, blur, and watermarking. |
| Zero-lag canvas and screen recording | [`@vidolib/recorder`](./packages/recorder) | Capture canvas, webcam, or stream sources directly to downloadable MP4 / WebM. |
| Multi-container demuxing | [`@vidolib/containers`](./packages/containers) | Isolated parsers for MP4, MKV, WebM, AVI, MOV, FLV, TS, PS, OGG, and ASF. |

Full technical mapping: [`FFMPEG_CAPABILITIES_ROADMAP.md`](./docs/FFMPEG_CAPABILITIES_ROADMAP.md)

[Back to top](#vidolib)

---

## Why No FFmpeg WASM

Full rationale: [`NO_FFMPEG_MANIFESTO.md`](./docs/NO_FFMPEG_MANIFESTO.md)

| Metric | Native VidoLib | FFmpeg WASM players |
|---|---|---|
| Engine download size | 3.4 KB – 30 KB | 15 MB – 40 MB |
| Startup latency | < 110 ms | 1,500 ms – 4,000 ms |
| Battery impact | Minimal (OS hardware decoders) | Heavy (CPU-bound WASM threads) |
| Memory footprint | < 18 MB RAM | 150 MB – 400 MB RAM |
| Mobile web compatibility | Native OS decoder support | Frequently OOM-crashes iOS Safari |

> [!CAUTION]
> The most common production failure mode for FFmpeg WASM players is memory eviction on iOS Safari under WebKit's stricter tab memory limits. This is the core motivation for keeping decode entirely on native hardware paths.

[Back to top](#vidolib)

---

## Architecture Overview

A load request flows from the stream layer through demuxing and hardware decode, out to the render and audio sinks, coordinated by a shared clock and event bus:

```mermaid
flowchart LR
    A[Stream layer<br/>HTTP Range / Blob / WS / WebRTC] --> B[Container parser<br/>MP4 / MKV / WebM / TS ...]
    B --> C[WebCodecs<br/>hardware decoder]
    C --> D[Renderer<br/>Canvas2D / WebGL / WebGPU]
    C --> E[WebAudio<br/>AudioWorklet]
    F[ABR engine] -.-> A
    G[Clock / EventBus] -.-> D
    G -.-> E
    G -.-> F
```

Deep dive: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · Plugin authoring: [`docs/PLUGINS.md`](./docs/PLUGINS.md)

[Back to top](#vidolib)

---

## Package Ecosystem

> [!NOTE]
> All packages currently compile to `packages/<name>/dist/` inside the monorepo. None are published to npm yet — track publication status on the [roadmap](./docs/ROADMAP.md).

| Package | Purpose | Size (gzip) | Global |
|---|---|---|---|
| [`@vidolib/core`](./packages/core) | Player, clock, pipeline, event bus | 3.44 KB | `VidoLibCore` |
| [`@vidolib/stream`](./packages/stream) | Range HTTP, Blob, File, WS, WebRTC, S3, IPFS | 2.86 KB | `VidoLibStream` |
| [`@vidolib/containers`](./packages/containers) | MP4, MKV, WebM, AVI, MOV, FLV, TS, PS, OGG, ASF | 5.14 KB | `VidoLibContainers` |
| [`@vidolib/manifest`](./packages/manifest) | HLS (`.m3u8`) and DASH (`.mpd`) parsers | 3.07 KB | `VidoLibManifest` |
| [`@vidolib/abr`](./packages/abr) | EWMA throughput and buffer-based ABR | 1.75 KB | `VidoLibAbr` |
| [`@vidolib/codecs`](./packages/codecs) | WebCodecs / native / royalty-free WASM negotiator | 3.01 KB | `VidoLibCodecs` |
| [`@vidolib/transcoder`](./packages/transcoder) | WebCodecs hardware video/audio re-encoder | 1.50 KB | `VidoLibTranscoder` |
| [`@vidolib/filters`](./packages/filters) | WebGL chroma key, brightness, blur, watermark | 1.84 KB | `VidoLibFilters` |
| [`@vidolib/recorder`](./packages/recorder) | Canvas and MediaStream zero-lag MP4/WebM recorder | 1.63 KB | `VidoLibRecorder` |
| [`@vidolib/renderer`](./packages/renderer) | Canvas2D, WebGL, WebGPU backends | 1.85 KB | `VidoLibRenderer` |
| [`@vidolib/subtitle`](./packages/subtitle) | ASS, SSA, SRT, VTT, PGS GPU engine | 2.45 KB | `VidoLibSubtitle` |
| [`@vidolib/ui`](./packages/ui) | WCAG 2.1 AA accessible glassmorphic UI controls | 3.53 KB | `VidoLibUi` |
| [`@vidolib/telemetry`](./packages/telemetry) | Zero-tracking QoE metrics event surface | 1.76 KB | `VidoLibTelemetry` |
| [`@vidolib/os-integration`](./packages/os-integration) | Media Session API, PiP, fullscreen, cast | 1.88 KB | `VidoLibOsIntegration` |

<details>
<summary>Repository layout</summary>

```text
VidoLib/
├── packages/
│   ├── core/
│   ├── stream/
│   ├── containers/
│   ├── manifest/
│   ├── abr/
│   ├── codecs/
│   ├── transcoder/
│   ├── filters/
│   ├── recorder/
│   ├── renderer/
│   ├── subtitle/
│   ├── ui/
│   ├── telemetry/
│   └── os-integration/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PLUGINS.md
│   ├── ROADMAP.md
│   ├── FFMPEG_CAPABILITIES_ROADMAP.md
│   └── NO_FFMPEG_MANIFESTO.md
├── scripts/
│   └── test-runner.js
├── CONTRIBUTING.md
└── LICENSING.md
```

</details>

[Back to top](#vidolib)

---

## Contributing and Developer Guide

| Resource | Description |
|---|---|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Setup, build system, and PR guidelines |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Core engine flow, Web Worker pipelines, memory model |
| [`docs/PLUGINS.md`](./docs/PLUGINS.md) | Build a custom plugin in under 30 lines of code |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Open contributor tasks |

[Back to top](#vidolib)

---

## Contributors

<a href="https://github.com/swadhinbiswas/VidoLib/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=swadhinbiswas/VidoLib" alt="Contributors" />
</a>

Generated automatically from the [live contributors graph](https://github.com/swadhinbiswas/VidoLib/graphs/contributors). Open a PR to have your avatar show up here.

[Back to top](#vidolib)

---

## Project Activity

<a href="https://star-history.com/#swadhinbiswas/VidoLib&Date">
  <img src="./assets/star-history.svg" alt="Star history chart" width="600" />
</a>

[![GitHub Stars](https://img.shields.io/github/stars/swadhinbiswas/VidoLib?style=social)](https://github.com/swadhinbiswas/VidoLib/stargazers)

[Back to top](#vidolib)

---

## License and Codec Policy

Distributed under the **MIT License**. See [`LICENSING.md`](./LICENSING.md) for the full codec licensing guardrails and royalty-free allow-list.

> [!IMPORTANT]
> MIT covers the VidoLib source. It does not grant patent rights for any codec your deployment target doesn't already license — VidoLib sidesteps this by decoding exclusively through OS/browser hardware paths instead of bundling codec implementations.

[Back to top](#vidolib)

---

<div align="center">

[Report a bug](https://github.com/swadhinbiswas/VidoLib/issues) · [Request a feature](https://github.com/swadhinbiswas/VidoLib/issues) · [Discussions](https://github.com/swadhinbiswas/VidoLib/discussions)

</div>
