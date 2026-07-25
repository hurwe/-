import { THREE } from './game.js';

// Day length in real seconds (full 24h cycle)
export const DAY_LENGTH_SECONDS = 24 * 60; // 24 minutes = 1 game day

export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.28; // 0..1 fraction of day, start ~06:45

    // Sky dome
    const skyGeo = new THREE.SphereGeometry(900, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x2a6fb0) },
        bottomColor: { value: new THREE.Color(0xcfe8f0) },
        sunPos: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunPos;
        varying vec3 vWorldPos;
        void main(){
          float h = normalize(vWorldPos).y;
          float t = clamp(h*0.5+0.5, 0.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(t,0.55));
          float sunDot = max(dot(normalize(vWorldPos), normalize(sunPos)), 0.0);
          col += vec3(1.0,0.85,0.6) * pow(sunDot, 32.0) * 0.6;
          gl_FragColor = vec4(col,1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    scene.add(this.skyMesh);

    // Sun & Moon
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.3);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.bias = -0.0015;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x8fa8d8, 0.0);
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    this.ambient = new THREE.HemisphereLight(0x9fd0ff, 0x4a4030, 0.55);
    scene.add(this.ambient);

    this.fog = new THREE.FogExp2(0xbcd9e8, 0.0028);
    scene.fog = this.fog;

    // stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 800; i++) {
      const r = 850;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.9);
      starPos.push(r * Math.sin(phi) * Math.cos(theta), Math.abs(r * Math.cos(phi)), r * Math.sin(phi) * Math.sin(theta));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0 }));
    scene.add(this.stars);

    this.buildClouds();
  }

  buildClouds() {
    this.cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, roughness: 1 });
    this.clouds = [];
    for (let i = 0; i < 22; i++) {
      const cluster = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffs; p++) {
        const s = 4 + Math.random() * 5;
        const geo = new THREE.SphereGeometry(s, 7, 6);
        const mesh = new THREE.Mesh(geo, cloudMat);
        mesh.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 8);
        mesh.scale.y = 0.6;
        cluster.add(mesh);
      }
      cluster.position.set((Math.random() - 0.5) * 600, 90 + Math.random() * 40, (Math.random() - 0.5) * 600);
      cluster.userData.speed = 0.4 + Math.random() * 0.6;
      this.cloudGroup.add(cluster);
      this.clouds.push(cluster);
    }
    this.scene.add(this.cloudGroup);
  }

  update(dt, playerPos) {
    this.time += dt / DAY_LENGTH_SECONDS;
    if (this.time >= 1) this.time -= 1;

    const angle = this.time * Math.PI * 2 - Math.PI / 2;
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.35).normalize();

    this.sunLight.position.copy(playerPos).add(sunDir.clone().multiplyScalar(200));
    this.sunLight.target.position.copy(playerPos);
    this.moonLight.position.copy(playerPos).add(sunDir.clone().multiplyScalar(-200));
    this.moonLight.target.position.copy(playerPos);

    const dayFactor = THREE.MathUtils.clamp(sunDir.y + 0.15, 0, 1);
    this.sunLight.intensity = dayFactor * 1.4;
    this.moonLight.intensity = (1 - dayFactor) * 0.18;
    this.ambient.intensity = 0.15 + dayFactor * 0.55;

    // color temperature shift for sunrise/sunset
    const warm = new THREE.Color(0xffb066);
    const day = new THREE.Color(0xfff4e0);
    const t = THREE.MathUtils.smoothstep ? 0 : 0;
    const sunsetFactor = 1 - THREE.MathUtils.clamp(Math.abs(sunDir.y) * 3, 0, 1);
    this.sunLight.color.copy(day).lerp(warm, sunsetFactor * 0.7);

    const topDay = new THREE.Color(0x2a6fb0), topNight = new THREE.Color(0x040814);
    const botDay = new THREE.Color(0xcfe8f0), botNight = new THREE.Color(0x0d1a2b);
    this.skyMat.uniforms.topColor.value.copy(topNight).lerp(topDay, dayFactor);
    this.skyMat.uniforms.bottomColor.value.copy(botNight).lerp(botDay, dayFactor);
    this.skyMat.uniforms.sunPos.value.copy(sunDir);

    this.fog.color.copy(this.skyMat.uniforms.bottomColor.value);

    this.stars.material.opacity = (1 - dayFactor) * 0.8;
    this.skyMesh.position.copy(playerPos);
    this.stars.position.copy(playerPos);

    // clouds drift
    this.clouds.forEach(c => {
      c.position.x += c.userData.speed * dt;
      if (c.position.x - playerPos.x > 350) c.position.x -= 700;
      if (c.position.x - playerPos.x < -350) c.position.x += 700;
    });
    this.cloudGroup.position.z = 0;

    return { dayFactor, sunDir };
  }

  getClockString() {
    const totalMinutes = this.time * 24 * 60;
    let h = Math.floor(totalMinutes / 60);
    let m = Math.floor(totalMinutes % 60);
    return { h, m, str: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }
}
