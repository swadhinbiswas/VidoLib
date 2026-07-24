#!/usr/bin/env node

/**
 * Fuzz all container demuxers to test for crashes and security issues.
 * Run with: node scripts/fuzz-all.js
 */

import { 
  MP4Demuxer, 
  FLVDemuxer, 
  TSDemuxer, 
  MKVDemuxer, 
  OGGDemuxer, 
  AVIDemuxer, 
  PSDemuxer, 
  ASFDemuxer 
} from '../packages/containers/dist/index.js';

const ITERATIONS = 1000;
const MAX_SIZE = 1024 * 1024; // 1MB max seed size

class ByteMutator {
  constructor(rate = 0.05) {
    this.rate = rate;
  }

  mutate(data) {
    const mutated = new Uint8Array(data);
    for (let i = 0; i < mutated.length; i++) {
      if (Math.random() < this.rate) {
        const mode = Math.floor(Math.random() * 3);
        switch (mode) {
          case 0: // Random byte
            mutated[i] = Math.floor(Math.random() * 256);
            break;
          case 1: // XOR with 0xFF
            mutated[i] ^= 0xFF;
            break;
          case 2: // Set to 0xFF
            mutated[i] = 0xFF;
            break;
        }
      }
    }
    return mutated;
  }
}

class FuzzTarget {
  constructor(demuxer, seed) {
    this.demuxer = demuxer;
    this.seed = seed;
    this.mutator = new ByteMutator();
  }

  run(iterations) {
    const results = {
      iterations: 0,
      crashes: 0,
      errors: [],
      securityErrors: 0
    };

    for (let i = 0; i < iterations; i++) {
      try {
        const mutated = this.mutator.mutate(this.seed);
        this.demuxer.demux(mutated);
        results.iterations++;
      } catch (error) {
        if (error.message.includes('[Security]')) {
          results.securityErrors++;
        } else if (error instanceof RangeError || error.message.includes('out of bounds')) {
          // Expected for malformed input
          results.iterations++;
        } else {
          results.crashes++;
          results.errors.push({
            iteration: i,
            message: error.message,
            stack: error.stack
          });
        }
      }
    }

    return results;
  }
}

// Generate seeds for each format
function generateSeeds() {
  const seeds = new Map();

  // MP4 seed (ftyp box)
  const mp4Seed = new Uint8Array(64);
  mp4Seed[0] = 0x00; mp4Seed[1] = 0x00; mp4Seed[2] = 0x00; mp4Seed[3] = 0x14;
  mp4Seed[4] = 0x66; mp4Seed[5] = 0x74; mp4Seed[6] = 0x79; mp4Seed[7] = 0x70;
  seeds.set('MP4', mp4Seed);

  // FLV seed
  const flvSeed = new Uint8Array([0x46, 0x4C, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00]);
  seeds.set('FLV', flvSeed);

  // TS seed (sync byte + packet)
  const tsSeed = new Uint8Array(188);
  tsSeed[0] = 0x47;
  tsSeed[1] = 0x40; tsSeed[2] = 0x10;
  seeds.set('TS', tsSeed);

  // MKV seed (EBML header)
  const mkvSeed = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
  seeds.set('MKV', mkvSeed);

  // OGG seed
  const oggSeed = new Uint8Array([0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]);
  seeds.set('OGG', oggSeed);

  // AVI seed (RIFF header)
  const aviSeed = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20]);
  seeds.set('AVI', aviSeed);

  // PS seed
  const psSeed = new Uint8Array([0x00, 0x00, 0x01, 0xBA, 0x44, 0x00, 0x04, 0x00, 0x04, 0x01, 0x01, 0x89, 0xC3, 0xF8]);
  seeds.set('PS', psSeed);

  // ASF seed
  const asfSeed = new Uint8Array([0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C]);
  seeds.set('ASF', asfSeed);

  return seeds;
}

// Main
console.log('Starting fuzz testing...\n');

const demuxers = [
  { name: 'MP4', demuxer: new MP4Demuxer() },
  { name: 'FLV', demuxer: new FLVDemuxer() },
  { name: 'TS', demuxer: new TSDemuxer() },
  { name: 'MKV', demuxer: new MKVDemuxer() },
  { name: 'OGG', demuxer: new OGGDemuxer() },
  { name: 'AVI', demuxer: new AVIDemuxer() },
  { name: 'PS', demuxer: new PSDemuxer() },
  { name: 'ASF', demuxer: new ASFDemuxer() }
];

const seeds = generateSeeds();
let totalCrashes = 0;
let totalIterations = 0;

for (const { name, demuxer } of demuxers) {
  const seed = seeds.get(name);
  if (!seed) {
    console.log(`[${name}] No seed available, skipping`);
    continue;
  }

  console.log(`[${name}] Running ${ITERATIONS} iterations...`);
  
  const fuzzer = new FuzzTarget(demuxer, seed);
  const results = fuzzer.run(ITERATIONS);
  
  totalCrashes += results.crashes;
  totalIterations += results.iterations;
  
  if (results.crashes > 0) {
    console.log(`[${name}] FAILED: ${results.crashes} crashes`);
    for (const error of results.errors.slice(0, 5)) {
      console.log(`  - Iteration ${error.iteration}: ${error.message}`);
    }
  } else {
    console.log(`[${name}] PASSED: ${results.iterations} iterations, ${results.securityErrors} security errors (expected)`);
  }
}

console.log('\n--- Fuzz Test Summary ---');
console.log(`Total iterations: ${totalIterations}`);
console.log(`Total crashes: ${totalCrashes}`);

if (totalCrashes > 0) {
  console.log('\nFAILED: Crashes detected!');
  process.exit(1);
} else {
  console.log('\nPASSED: All fuzz tests passed');
  process.exit(0);
}
