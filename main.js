import { THREE } from './game.js';
import { World } from './world.js';
import { SkySystem } from './sky.js';
import { Player } from './player.js';

// ===========================================================
// Orientation handling
// ===========================================================
function checkOrientation() {
  const isPortrait = window.innerHeight > window.innerWidth;
  document.body.classList.toggle('portrait', isPortrait);
}
window.addEventListener('resize', checkOrientation);
checkOrientation();

// ===========================================================
// Renderer / Scene / Camera
// ===========================================================
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===========================================================
// World / Sky / Player
// ===========================================================
const world = new World(scene);
const sky = new SkySystem(scene);
const player = new Player(camera, world);

// underwater fog overlay handling
let underwaterActive = false;

// initial chunk load (force before first frame to avoid falling through world)
world.update(player.position.x, player.position.z);
player.position.y = world.getHeightAt(player.position.x, player.position.z) + 3;

// ===========================================================
// Loading screen progression (simulate + real chunk gen)
// ===========================================================
const loadBar = document.getElementById('loadBar');
const loadTip = document.getElementById('loadTip');
const tips = [
  'جاري توليد التضاريس...', 'جاري زراعة الأشجار...', 'جاري ملء المسطحات المائية...',
  'جاري ضبط الإضاءة الديناميكية...', 'جاري تجهيز عصا التحكم...'
];
let loadProgress = 0;
const loadInterval = setInterval(() => {
  loadProgress += 8 + Math.random() * 12;
  loadTip.textContent = tips[Math.floor(Math.random() * tips.length)];
  if (loadProgress >= 100) {
    loadProgress = 100;
    clearInterval(loadInterval);
    loadBar.style.width = '100%';
    setTimeout(() => {
      document.getElementById('loadingScreen').style.opacity = '0';
      setTimeout(() => {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('menuOverlay').classList.remove('hidden');
      }, 800);
    }, 300);
    return;
  }
  loadBar.style.width = loadProgress + '%';
}, 220);

// ===========================================================
// Inventory system
// ===========================================================
const inventory = {
  wood: 0, stone: 0, fiber: 0, torch: 0,
};
const HOTBAR_ITEMS = [
  { id: 'gather', icon: '⛏️', label: 'أداة تجميع', key: '1' },
  { id: 'build', icon: '🔨', label: 'بناء', key: '2' },
  { id: 'torch', icon: '🔥', label: 'مشعل', key: '3' },
];
let activeHotbar = 0;

function renderHotbar() {
  const wrap = document.getElementById('hotbarWrap');
  wrap.innerHTML = '';
  HOTBAR_ITEMS.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'hotSlot' + (i === activeHotbar ? ' active' : '');
    el.innerHTML = `<span class="key">${item.key}</span>${item.icon}`;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); activeHotbar = i; renderHotbar(); updateBuildMenuVisibility(); });
    wrap.appendChild(el);
  });
}
renderHotbar();

function updateBuildMenuVisibility() {
  const isBuild = HOTBAR_ITEMS[activeHotbar].id === 'build';
  document.getElementById('buildMenu').classList.toggle('show', isBuild);
  document.body.classList.toggle('build-mode', isBuild);
}

function renderInventoryPanel() {
  const grid = document.getElementById('invGrid');
  grid.innerHTML = '';
  const icons = { wood: '🪵', stone: '🪨', fiber: '🌾', torch: '🔥' };
  Object.entries(inventory).forEach(([k, v]) => {
    const slot = document.createElement('div');
    slot.className = 'invSlot';
    slot.innerHTML = `${icons[k] || '❔'}<span class="qty">${v}</span>`;
    grid.appendChild(slot);
  });
  for (let i = Object.keys(inventory).length; i < 24; i++) {
    grid.appendChild(document.createElement('div')).className = 'invSlot';
  }
}

function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ===========================================================
// Build system
// ===========================================================
let buildType = 'floor';
document.querySelectorAll('.buildOpt').forEach(el => {
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.buildOpt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    buildType = el.dataset.build;
  });
});

let buildRotation = 0;
document.getElementById('btnRotateBuild').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  buildRotation += Math.PI / 4;
});

let ghostMesh = null;
function createGhost(type) {
  if (ghostMesh) { scene.remove(ghostMesh); }
  const mat = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.45, wireframe: false });
  let geo;
  if (type === 'floor') geo = new THREE.BoxGeometry(2.4, 0.15, 2.4);
  else if (type === 'wall') geo = new THREE.BoxGeometry(2.4, 2.2, 0.2);
  else if (type === 'pillar') geo = new THREE.CylinderGeometry(0.18, 0.18, 2.4, 8);
  else geo = new THREE.CylinderGeometry(0.4, 0.5, 0.5, 8);
  ghostMesh = new THREE.Mesh(geo, mat);
  scene.add(ghostMesh);
  return ghostMesh;
}
createGhost(buildType);

const buildCosts = {
  floor: { wood: 5 },
  wall: { wood: 8 },
  pillar: { wood: 4 },
  campfire: { stone: 6, wood: 3 },
};

function placeBuild(position) {
  const cost = buildCosts[buildType];
  for (const k in cost) if ((inventory[k] || 0) < cost[k]) { toast('لا تملك مواد كافية'); return; }
  for (const k in cost) inventory[k] -= cost[k];

  let mesh;
  if (buildType === 'floor') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 2.4), new THREE.MeshStandardMaterial({ color: 0xc9a15f, roughness: 0.85 }));
  } else if (buildType === 'wall') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xb98d52, roughness: 0.85 }));
  } else if (buildType === 'pillar') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0xa9834e, roughness: 0.85 }));
  } else if (buildType === 'campfire') {
    mesh = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 1 }));
    const light = new THREE.PointLight(0xff8a3d, 1.6, 12, 2);
    light.position.y = 0.6;
    mesh.add(base, light);
    mesh.userData.isCampfire = true;
    mesh.userData.light = light;
  }
  mesh.position.copy(position);
  mesh.rotation.y = buildRotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  world.buildObjects.push(mesh);
  toast('تم البناء ✔');
  renderInventoryPanel();
}

// ===========================================================
// Touch controls: Joystick
// ===========================================================
const joyZone = document.getElementById('joystickZone');
const joyStick = document.getElementById('joyStick');
let joyActive = false, joyTouchId = null, joyCenter = { x: 0, y: 0 };

function joyStart(e) {
  const t = e.changedTouches ? e.changedTouches[0] : e;
  joyTouchId = t.identifier !== undefined ? t.identifier : 'mouse';
  const rect = joyZone.getBoundingClientRect();
  joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  joyActive = true;
  joyMove(e);
}
function joyMove(e) {
  if (!joyActive) return;
  let t = e.changedTouches ? [...e.changedTouches].find(tt => tt.identifier === joyTouchId) : e;
  if (!t) return;
  let dx = t.clientX - joyCenter.x;
  let dy = t.clientY - joyCenter.y;
  const maxR = 40;
  const dist = Math.min(Math.hypot(dx, dy), maxR);
  const ang = Math.atan2(dy, dx);
  dx = Math.cos(ang) * dist; dy = Math.sin(ang) * dist;
  joyStick.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`;
  player.moveVec.x = dx / maxR;
  player.moveVec.y = dy / maxR;
}
function joyEnd(e) {
  if (e.changedTouches && ![...e.changedTouches].some(t => t.identifier === joyTouchId)) return;
  joyActive = false;
  joyTouchId = null;
  joyStick.style.transform = 'translate(-50%,-50%)';
  player.moveVec.x = 0; player.moveVec.y = 0;
}
joyZone.addEventListener('touchstart', joyStart, { passive: true });
joyZone.addEventListener('touchmove', joyMove, { passive: true });
joyZone.addEventListener('touchend', joyEnd);
joyZone.addEventListener('touchcancel', joyEnd);
joyZone.addEventListener('mousedown', joyStart);
window.addEventListener('mousemove', joyMove);
window.addEventListener('mouseup', joyEnd);

// ===========================================================
// Touch controls: Look area (right side of screen)
// ===========================================================
const lookZone = document.getElementById('lookZone');
let lookActive = false, lookTouchId = null, lastLook = { x: 0, y: 0 };

function lookStart(e) {
  const t = e.changedTouches ? e.changedTouches[0] : e;
  lookTouchId = t.identifier !== undefined ? t.identifier : 'mouse';
  lastLook = { x: t.clientX, y: t.clientY };
  lookActive = true;
}
function lookMove(e) {
  if (!lookActive) return;
  let t = e.changedTouches ? [...e.changedTouches].find(tt => tt.identifier === lookTouchId) : e;
  if (!t) return;
  const dx = t.clientX - lastLook.x;
  const dy = t.clientY - lastLook.y;
  player.lookDelta.x += dx;
  player.lookDelta.y += dy;
  lastLook = { x: t.clientX, y: t.clientY };
}
function lookEnd(e) {
  if (e.changedTouches && ![...e.changedTouches].some(t => t.identifier === lookTouchId)) return;
  lookActive = false; lookTouchId = null;
}
lookZone.addEventListener('touchstart', lookStart, { passive: true });
lookZone.addEventListener('touchmove', lookMove, { passive: true });
lookZone.addEventListener('touchend', lookEnd);
lookZone.addEventListener('touchcancel', lookEnd);
lookZone.addEventListener('mousedown', lookStart);
window.addEventListener('mousemove', lookMove);
window.addEventListener('mouseup', lookEnd);

// ===========================================================
// Action buttons
// ===========================================================
document.getElementById('btnJump').addEventListener('pointerdown', (e) => { e.stopPropagation(); player.wantJump = true; });
const sprintBtn = document.getElementById('btnSprint');
sprintBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  player.sprinting = !player.sprinting;
  sprintBtn.classList.toggle('active', player.sprinting);
});

let mainBtnHeld = false;
let mainBtnHoldTime = 0;
const btnMain = document.getElementById('btnMain');
btnMain.addEventListener('pointerdown', (e) => { e.stopPropagation(); mainBtnHeld = true; mainBtnHoldTime = 0; });
window.addEventListener('pointerup', () => { mainBtnHeld = false; });

function doMainAction() {
  const item = HOTBAR_ITEMS[activeHotbar];
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 4.2;

  if (item.id === 'build') {
    const hits = raycaster.intersectObjects(world.getTerrainMeshes(), false);
    if (hits.length) placeBuild(hits[0].point);
    return;
  }

  // gather mode
  const interactables = world.getInteractables();
  const hits = raycaster.intersectObjects(interactables, false);
  if (hits.length) {
    const obj = hits[0].object;
    const ud = obj.userData;
    if (ud.type === 'tree' || ud.type === 'rock' || ud.type === 'bush') {
      ud.health -= 1;
      obj.scale.multiplyScalar(0.93);
      if (ud.health <= 0) {
        const amt = ud.type === 'tree' ? 4 : ud.type === 'rock' ? 3 : 2;
        inventory[ud.resource] = (inventory[ud.resource] || 0) + amt;
        toast(`+${amt} ${({ wood: 'خشب', stone: 'حجر', fiber: 'ألياف' })[ud.resource]}`);
        world.removeFoliage(obj);
        renderInventoryPanel();
      }
    }
    return;
  }

  // terraform fallback: dig/raise terrain
  const thits = raycaster.intersectObjects(world.getTerrainMeshes(), false);
  if (thits.length) {
    const p = thits[0].point;
    world.terraform(p.x, p.z, -0.6, 1.6);
  }
}

// ===========================================================
// UI panel toggles
// ===========================================================
const invPanel = document.getElementById('invPanel');
document.getElementById('btnInv').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); renderInventoryPanel(); invPanel.classList.add('show');
});
document.getElementById('btnInvClose').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); invPanel.classList.remove('show');
});

document.getElementById('btnBuildToggle').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  activeHotbar = HOTBAR_ITEMS.findIndex(h => h.id === 'build');
  renderHotbar();
  updateBuildMenuVisibility();
  document.getElementById('btnBuildToggle').classList.toggle('active', true);
});

let paused = false;
const pauseMenu = document.getElementById('pauseMenu');
document.getElementById('btnPause').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); paused = true; pauseMenu.classList.add('show');
});
document.getElementById('btnResume').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); paused = false; pauseMenu.classList.remove('show');
});
document.getElementById('btnSaveNow').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); saveGame(); toast('تم الحفظ 💾');
});
document.getElementById('btnMainMenu').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); saveGame();
  paused = false; pauseMenu.classList.remove('show');
  document.getElementById('hudLayer').style.display = 'none';
  document.getElementById('menuOverlay').classList.remove('hidden');
});

document.getElementById('fsBtn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
});

// ===========================================================
// Death / respawn
// ===========================================================
const deathScreen = document.getElementById('deathScreen');
document.getElementById('btnRespawn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  player.respawn();
  deathScreen.classList.remove('show');
});

// ===========================================================
// Menu / New world / Continue
// ===========================================================
function saveGame() {
  try {
    const data = {
      inventory,
      playerPos: { x: player.position.x, y: player.position.y, z: player.position.z },
      time: sky.time,
    };
    localStorage.setItem('terraRealisSave', JSON.stringify(data));
  } catch (e) { /* storage unavailable */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem('terraRealisSave');
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(inventory, data.inventory);
    player.position.set(data.playerPos.x, data.playerPos.y, data.playerPos.z);
    sky.time = data.time ?? sky.time;
    return true;
  } catch (e) { return false; }
}

function startGame() {
  document.getElementById('menuOverlay').classList.add('hidden');
  document.getElementById('hudLayer').style.display = 'block';
  renderInventoryPanel();
  renderHotbar();
  toast('مرحباً بك في تيرا رياليس 🌍');
}
document.getElementById('btnNewWorld').addEventListener('pointerdown', (e) => { e.stopPropagation(); startGame(); });
document.getElementById('btnContinue').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  const ok = loadGame();
  startGame();
  if (!ok) toast('لا يوجد حفظ سابق، بدأنا عالماً جديداً');
});
document.getElementById('btnHowTo').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  toast('استخدم العصا للحركة، اسحب يمين الشاشة للنظر، اضغط الزر البرتقالي للتفاعل');
});

// ===========================================================
// PWA install
// ===========================================================
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBtn').classList.add('show');
});
document.getElementById('installBtn').addEventListener('pointerdown', async (e) => {
  e.stopPropagation();
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBtn').classList.remove('show');
});

// ===========================================================
// HUD updates
// ===========================================================
function updateHUD() {
  document.getElementById('healthFill').style.width = player.health + '%';
  document.getElementById('staminaFill').style.width = player.stamina + '%';
  document.getElementById('hungerFill').style.width = player.hunger + '%';
  document.getElementById('thirstFill').style.width = player.thirst + '%';

  const clock = sky.getClockString();
  document.getElementById('clockTime').textContent = clock.str;
  const isNight = clock.h >= 20 || clock.h < 6;
  document.getElementById('clockIcon').textContent = isNight ? '🌙' : (clock.h >= 6 && clock.h < 8) || (clock.h >= 18 && clock.h < 20) ? '🌇' : '☀️';

  sprintBtn.classList.toggle('active', player.sprinting);

  // crosshair hit indicator
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 4.2;
  const hits = raycaster.intersectObjects(world.getInteractables(), false);
  const thits = raycaster.intersectObjects(world.getTerrainMeshes(), false);
  const crosshair = document.getElementById('crosshair');
  const prompt = document.getElementById('interactPrompt');
  if (hits.length) {
    crosshair.classList.add('hit');
    prompt.classList.add('show');
    const t = hits[0].object.userData.type;
    prompt.textContent = t === 'tree' ? '🪓 اجمع الخشب' : t === 'rock' ? '⛏️ اجمع الحجر' : '🌾 اجمع الألياف';
  } else if (HOTBAR_ITEMS[activeHotbar].id === 'build' && thits.length) {
    crosshair.classList.remove('hit');
    prompt.classList.add('show');
    prompt.textContent = '🔨 اضغط للبناء';
  } else {
    crosshair.classList.remove('hit');
    prompt.classList.remove('show');
  }
  return { thits };
}

// ===========================================================
// Main loop
// ===========================================================
const clock = new THREE.Clock();
let ghostVisible = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  const hudLayerVisible = document.getElementById('hudLayer').style.display !== 'none';

  if (!paused && hudLayerVisible && player.alive) {
    player.update(dt);
    world.update(player.position.x, player.position.z);

    if (mainBtnHeld) {
      mainBtnHoldTime += dt;
      if (mainBtnHoldTime > 0.35 || mainBtnHoldTime === dt) {
        doMainAction();
        mainBtnHoldTime = -0.15; // throttle repeat rate
      }
    }
  }

  sky.update(dt, player.position);

  // build ghost preview
  const item = HOTBAR_ITEMS[activeHotbar];
  if (item.id === 'build' && hudLayerVisible) {
    if (!ghostMesh || ghostMesh.userData.type !== buildType) {
      createGhost(buildType);
      ghostMesh.userData.type = buildType;
    }
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 6;
    const thits = raycaster.intersectObjects(world.getTerrainMeshes(), false);
    if (thits.length) {
      ghostMesh.visible = true;
      ghostMesh.position.copy(thits[0].point);
      ghostMesh.rotation.y = buildRotation;
    } else {
      ghostMesh.visible = false;
    }
  } else if (ghostMesh) {
    ghostMesh.visible = false;
  }

  if (hudLayerVisible) updateHUD();

  if (!player.alive) {
    document.getElementById('deathScreen').classList.add('show');
  }

  renderer.render(scene, camera);
}
animate();

// periodic autosave
setInterval(() => {
  if (document.getElementById('hudLayer').style.display !== 'none') saveGame();
}, 30000);

// prevent context menu on long press
window.addEventListener('contextmenu', (e) => e.preventDefault());
