// =========================================================
// TERRA REALIS — Core Engine
// =========================================================
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.128.0/three.module.js';

// ---------------------------------------------------------
// Simplex Noise (self-contained, fast) — no external deps
// ---------------------------------------------------------
class SimplexNoise {
  constructor(seed = Math.random()) {
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    let s = seed * 10000;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
  }
  grad(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y, v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }
  noise2D(xin, yin) {
    const F2 = 0.3660254037844386, G2 = 0.21132486540518713;
    let n0, n1, n2;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]] % 12;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * this.grad(gi0, x0, y0));
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * this.grad(gi1, x1, y1));
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * this.grad(gi2, x2, y2));
    return 70 * (n0 + n1 + n2);
  }
}

function fbm(noise, x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise.noise2D(x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

// ---------------------------------------------------------
// Global constants
// ---------------------------------------------------------
const WORLD_SEED = Math.random() * 1000;
const CHUNK_SIZE = 48;
const CHUNK_RES = 24;          // vertices per side
const RENDER_DIST = 3;         // chunks radius
const HEIGHT_SCALE = 26;
const WATER_LEVEL = 1.2;

const heightNoise = new SimplexNoise(WORLD_SEED);
const detailNoise = new SimplexNoise(WORLD_SEED + 77);
const moistureNoise = new SimplexNoise(WORLD_SEED + 133);

function getHeight(x, z) {
  const nx = x / 220, nz = z / 220;
  let h = fbm(heightNoise, nx, nz, 5, 2.05, 0.5); // -1..1
  // create rolling hills + occasional peaks
  h = Math.pow(Math.abs(h), 1.35) * Math.sign(h);
  let base = h * HEIGHT_SCALE;
  // gentle valley carving
  const ridge = fbm(detailNoise, x / 90, z / 90, 3, 2.0, 0.5);
  base += ridge * 3.5;
  return base;
}

// runtime terraform deltas (sparse map for edited points near camera)
const terraformDeltas = new Map();
function tKey(x, z) { return Math.round(x) + '_' + Math.round(z); }
function getTerraformDelta(x, z) {
  return terraformDeltas.get(tKey(x, z)) || 0;
}
function addTerraformDelta(x, z, amount, radius) {
  const r = Math.ceil(radius);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      const key = tKey(x + dx, z + dz);
      const prev = terraformDeltas.get(key) || 0;
      terraformDeltas.set(key, prev + amount * falloff);
    }
  }
}
function finalHeight(x, z) {
  return getHeight(x, z) + getTerraformDelta(x, z);
}

export { THREE, SimplexNoise, fbm, getHeight, finalHeight, addTerraformDelta,
  WORLD_SEED, CHUNK_SIZE, CHUNK_RES, RENDER_DIST, HEIGHT_SCALE, WATER_LEVEL, moistureNoise };
