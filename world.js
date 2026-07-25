import { THREE, finalHeight, addTerraformDelta, moistureNoise,
  CHUNK_SIZE, CHUNK_RES, RENDER_DIST, HEIGHT_SCALE, WATER_LEVEL } from './game.js';

// ---------------------------------------------------------
// Materials
// ---------------------------------------------------------
const grassColorLow = new THREE.Color(0x4f7a3d);
const grassColorHigh = new THREE.Color(0x8a9a5b);
const rockColor = new THREE.Color(0x767267);
const sandColor = new THREE.Color(0xd8c88f);
const snowColor = new THREE.Color(0xf2f5f7);

function terrainVertexColor(x, y, z, slope) {
  const c = new THREE.Color();
  const h = y;
  if (h < WATER_LEVEL + 0.6) {
    c.copy(sandColor);
  } else if (slope > 0.75) {
    c.copy(rockColor);
  } else if (h > HEIGHT_SCALE * 0.62) {
    c.lerpColors(grassColorHigh, snowColor, THREE.MathUtils.clamp((h - HEIGHT_SCALE * 0.62) / (HEIGHT_SCALE * 0.35), 0, 1));
  } else {
    const m = (moistureNoise.noise2D(x / 150, z / 150) + 1) / 2;
    c.lerpColors(grassColorLow, grassColorHigh, m);
  }
  return c;
}

const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0.0,
  flatShading: false,
});

const waterMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x1c6f8c,
  transparent: true,
  opacity: 0.78,
  roughness: 0.15,
  metalness: 0.1,
  transmission: 0.35,
  clearcoat: 0.6,
  side: THREE.DoubleSide,
});

// ---------------------------------------------------------
// Chunk class — builds a smooth terrain patch
// ---------------------------------------------------------
class Chunk {
  constructor(cx, cz, scene) {
    this.cx = cx; this.cz = cz;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    this.foliage = [];
    this.build();
    scene.add(this.group);
  }

  heightAtLocal(lx, lz) {
    const wx = this.cx * CHUNK_SIZE + lx;
    const wz = this.cz * CHUNK_SIZE + lz;
    return finalHeight(wx, wz);
  }

  build() {
    const res = CHUNK_RES;
    const size = CHUNK_SIZE;
    const geo = new THREE.PlaneGeometry(size, size, res, res);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const heights = [];

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = this.cx * CHUNK_SIZE + lx;
      const wz = this.cz * CHUNK_SIZE + lz;
      const h = finalHeight(wx, wz);
      pos.setY(i, h);
      heights.push(h);
    }
    geo.computeVertexNormals();

    // slope-based coloring using normals
    const normal = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const ny = normal.getY(i);
      const slope = 1 - THREE.MathUtils.clamp(ny, 0, 1);
      const wx = this.cx * CHUNK_SIZE + pos.getX(i);
      const wz = this.cz * CHUNK_SIZE + pos.getZ(i);
      const c = terrainVertexColor(wx, pos.getY(i), wz, slope);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, terrainMaterial);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.userData.isTerrain = true;
    this.mesh.userData.chunk = this;
    this.group.add(this.mesh);

    // water plane if any part below water level
    const avgH = heights.reduce((a, b) => a + b, 0) / heights.length;
    if (avgH < WATER_LEVEL + 4) {
      const wgeo = new THREE.PlaneGeometry(size, size, 1, 1);
      wgeo.rotateX(-Math.PI / 2);
      const wmesh = new THREE.Mesh(wgeo, waterMaterial);
      wmesh.position.y = WATER_LEVEL;
      wmesh.userData.isWater = true;
      this.group.add(wmesh);
      this.water = wmesh;
    }

    this.scatterFoliage();
  }

  scatterFoliage() {
    const size = CHUNK_SIZE;
    const count = 14;
    for (let i = 0; i < count; i++) {
      const lx = (Math.random() - 0.5) * size;
      const lz = (Math.random() - 0.5) * size;
      const h = this.heightAtLocal(lx, lz);
      if (h < WATER_LEVEL + 0.8) continue; // no trees in water/sand edge
      const slopeSample = this.heightAtLocal(lx + 1, lz) - h;
      if (Math.abs(slopeSample) > 2.2) continue; // avoid steep cliffs

      const r = Math.random();
      if (h > HEIGHT_SCALE * 0.68) continue; // no trees at snowcap

      if (r < 0.45) {
        this.addTree(lx, h, lz);
      } else if (r < 0.75) {
        this.addRock(lx, h, lz);
      } else {
        this.addBush(lx, h, lz);
      }
    }
  }

  addTree(lx, h, lz) {
    const trunkH = 2.2 + Math.random() * 1.8;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, trunkH, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4227, roughness: 1 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(lx, h + trunkH / 2, lz);
    trunk.castShadow = true;
    trunk.userData = { type: 'tree', resource: 'wood', health: 3, chunk: this };

    const leafColor = Math.random() > 0.5 ? 0x3f6b2e : 0x2f7a3a;
    const leafGeo = new THREE.ConeGeometry(1.5 + Math.random() * 0.6, 3 + Math.random(), 7);
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.9 });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(lx, h + trunkH + 1.4, lz);
    leaf.castShadow = true;

    this.group.add(trunk);
    this.group.add(leaf);
    this.foliage.push(trunk, leaf);
    trunk.userData.linked = [leaf];
  }

  addRock(lx, h, lz) {
    const s = 0.5 + Math.random() * 0.9;
    const geo = new THREE.DodecahedronGeometry(s, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x83837c, roughness: 1, flatShading: true });
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(lx, h + s * 0.3, lz);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.userData = { type: 'rock', resource: 'stone', health: 3, chunk: this };
    this.group.add(rock);
    this.foliage.push(rock);
  }

  addBush(lx, h, lz) {
    const s = 0.3 + Math.random() * 0.3;
    const geo = new THREE.IcosahedronGeometry(s, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a8a3f, roughness: 1 });
    const bush = new THREE.Mesh(geo, mat);
    bush.position.set(lx, h + s * 0.6, lz);
    bush.userData = { type: 'bush', resource: 'fiber', health: 1, chunk: this };
    this.group.add(bush);
    this.foliage.push(bush);
  }

  removeFoliageObject(obj) {
    const idx = this.foliage.indexOf(obj);
    if (idx >= 0) this.foliage.splice(idx, 1);
    this.group.remove(obj);
    if (obj.userData.linked) {
      obj.userData.linked.forEach(l => this.group.remove(l));
    }
  }

  // regenerate the heightfield after a terraform edit
  rebuildTerrain() {
    const pos = this.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = this.cx * CHUNK_SIZE + lx;
      const wz = this.cz * CHUNK_SIZE + lz;
      pos.setY(i, finalHeight(wx, wz));
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    const colors = this.geo.attributes.color;
    const normal = this.geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const ny = normal.getY(i);
      const slope = 1 - THREE.MathUtils.clamp(ny, 0, 1);
      const wx = this.cx * CHUNK_SIZE + pos.getX(i);
      const wz = this.cz * CHUNK_SIZE + pos.getZ(i);
      const c = terrainVertexColor(wx, pos.getY(i), wz, slope);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }

  dispose() {
    this.scene.remove(this.group);
    this.geo.dispose();
    this.foliage.forEach(f => { f.geometry.dispose(); f.material.dispose(); });
  }
}

// ---------------------------------------------------------
// World manager — streams chunks around player
// ---------------------------------------------------------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.buildObjects = []; // player-placed structures
  }

  key(cx, cz) { return cx + ',' + cz; }

  update(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const needed = new Set();

    for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
      for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        const k = this.key(cx, cz);
        needed.add(k);
        if (!this.chunks.has(k)) {
          this.chunks.set(k, new Chunk(cx, cz, this.scene));
        }
      }
    }
    // dispose far chunks
    for (const [k, chunk] of this.chunks) {
      if (!needed.has(k)) {
        chunk.dispose();
        this.chunks.delete(k);
      }
    }
  }

  getHeightAt(x, z) {
    return finalHeight(x, z);
  }

  terraform(x, z, amount, radius) {
    addTerraformDelta(x, z, amount, radius);
    const affectedChunkRadius = Math.ceil(radius / CHUNK_SIZE) + 1;
    const ccx = Math.floor(x / CHUNK_SIZE), ccz = Math.floor(z / CHUNK_SIZE);
    for (let dx = -affectedChunkRadius; dx <= affectedChunkRadius; dx++) {
      for (let dz = -affectedChunkRadius; dz <= affectedChunkRadius; dz++) {
        const k = this.key(ccx + dx, ccz + dz);
        const c = this.chunks.get(k);
        if (c) c.rebuildTerrain();
      }
    }
  }

  // gather all interactable meshes currently loaded (for raycasting)
  getInteractables() {
    let list = [];
    for (const chunk of this.chunks.values()) {
      list = list.concat(chunk.foliage);
    }
    list = list.concat(this.buildObjects);
    return list;
  }

  getTerrainMeshes() {
    const list = [];
    for (const chunk of this.chunks.values()) list.push(chunk.mesh);
    return list;
  }

  removeFoliage(obj) {
    const chunk = obj.userData.chunk;
    if (chunk) chunk.removeFoliageObject(obj);
  }
}
