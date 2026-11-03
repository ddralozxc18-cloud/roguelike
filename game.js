/* =========================================================
RYGALIK — a low-poly first-person 3D walker
Pure Three.js (r128), no bundlers, no modules.
========================================================= */
(function () {
'use strict';

// ---------------------------------------------------------
// Настройки баланса
// ---------------------------------------------------------
const CONFIG = {
  eyeHeight: 1.7,
  gravity: -22,
  jumpSpeed: 9.8,
  jumpStaminaCost: 0,
  // --- Параметры движения в стиле Source Engine (Valve) ---
  // Максимальная скорость на земле (аналог sv_maxspeed)
  maxSpeed: 4.3,
  // Ускорение на земле (аналог sv_accelerate)
  groundAccelerate: 40,
  // Искусственно ограниченный wishspeed в воздухе — позволяет
  // разгоняться только зигзагами (strafe-акселерация)
  airWishSpeed: 0.2,          // ~30 units/sec in Source terms (30/u_scale)
  // Ускорение в воздухе (аналог sv_airaccelerate, обычно 10–15)
  airAccelerate: 12,
  // Коэффициенты трения Source (friction / stopspeed)
  friction: 10,
  stopSpeed: 1.0,
  manaRegenRate: 4,
  flareManaCost: 18,
  hpRegenRate: 1.6,
  hpRegenDelay: 4,
  fallDamageThreshold: 10.2,
  fallDamageMultiplier: 3.2,
  worldBound: 95,
  pickupRadius: 2.6,
  playerRadius: 0.4,
};

// Определения предметов инвентаря
const ITEM_DEFS = {
  gem:            { name: 'Crystal',           icon: '◆', color: '#7dd3fc', use: null },
  potion_hp:      { name: 'Health Potion',      icon: '♥', color: '#e0403a', use: (s) => { s.hp = Math.min(s.maxHp, s.hp + 35); } },
  potion_mana:    { name: 'Mana Potion',          icon: '✦', color: '#4c8dfb', use: (s) => { s.mana = Math.min(s.maxMana, s.mana + 40); } },
};

// ---------------------------------------------------------
// Player state — equipment slots
// ---------------------------------------------------------
const equipmentState = {
  hand: null,              // Hand slot (defaults to the standard hand)
  active1: null,           // Active slot 1 (Shift key)
  active2: null,           // Active slot 2 (C key)
  passive1: null,          // Passive slot 1
  passive2: null,          // Passive slot 2
  innate: null,            // Dedicated innate ability cell (not a passive slot)
};

// Default standard hand
const DEFAULT_HAND = {
  id: 'default_hand',
  name: 'Hand',
  icon: '✊',
  damage: 1,
};

// Initialize the default hand
equipmentState.hand = DEFAULT_HAND;

// ---------------------------------------------------------
// Get current hand damage
// ---------------------------------------------------------
function getHandDamage() {
  if (equipmentState.hand && typeof equipmentState.hand.damage === 'number') {
    return equipmentState.hand.damage;
  }
  return 1; // Default damage
}

// ---------------------------------------------------------
// Состояние игры
// ---------------------------------------------------------
const state = {
  started: false,
  paused: false,
  inventoryOpen: false,
  dead: false,
  hp: 100, maxHp: 100,
  mana: 100, maxMana: 100,
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  lastDamageTime: -999,
  onGround: true,
  velocityY: 0,
  // Горизонтальная скорость (милли-единицы Source): {x, z} в юнитах/сек
  velocity: { x: 0, z: 0 },
  // Буфер ввода прыжка (jump-bug): «прыжок был нажат» с последнего кадра
  jumpQueued: false,
  bobTimer: 0,
  bobOffset: 0,
  keys: {},
  mouseSensitivity: 1,
  nearestPickup: null,
  inventory: {},
  gems: 0,
  // --- Врождённая магия (выбирается на старте) ---
  innateSchool: null,      // 'fire' | 'space' | 'luck'
  innateAbilityId: null,   // id врождённой способности из INNATE_ABILITIES
  // --- Parkour (space): двойной прыжок ---
  airJumpsUsed: 0,         // сколько прыжков в воздухе использовано
  doubleJumpActive: false, // серия с двойным прыжком — без урона от падения
  lastJumpTime: -999,      // время последнего прыжка (для снаряда)
};

// ---------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function randomPointInWorld(clearRadius) {
  let x = 0, z = 0, attempts = 0;
  do {
    x = rand(-CONFIG.worldBound + 6, CONFIG.worldBound - 6);
    z = rand(-CONFIG.worldBound + 6, CONFIG.worldBound - 6);
    attempts++;
  } while (Math.hypot(x, z) < clearRadius && attempts < 25);
  return { x, z };
}

// ---------------------------------------------------------
// Ссылки на DOM
// ---------------------------------------------------------
const container = document.getElementById('game-container');
const menuFrameContainer = document.getElementById('menu-frame-container');
const pauseScreen = document.getElementById('pause-screen');
const deathScreen = document.getElementById('death-screen');
const inventoryScreen = document.getElementById('inventory-screen');
const hudEl = document.getElementById('hud');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const respawnBtn = document.getElementById('respawn-btn');
const closeInventoryBtn = document.getElementById('close-inventory-btn');
const sensSliderPause = document.getElementById('sensitivity-slider-pause');
const fpsToggle = document.getElementById('fps-toggle');
const hpFillEl = document.getElementById('hp-fill');
const hpValueEl = document.getElementById('hp-value');
const hpRegenEl = document.getElementById('hp-regen');
const manaFillEl = document.getElementById('mana-fill');
const manaValueEl = document.getElementById('mana-value');
const manaRegenEl = document.getElementById('mana-regen');
const gemCountEl = document.getElementById('gem-count');
const levelValueEl = document.getElementById('level-value');
const xpFillEl = document.getElementById('xp-fill');
const hudActive1Icon = document.getElementById('hud-active1-icon');
const hudActive2Icon = document.getElementById('hud-active2-icon');
const pickupPromptEl = document.getElementById('pickup-prompt');
const inventoryGridEl = document.getElementById('inventory-grid');
const equipmentContainerEl = document.getElementById('equipment-container'); // FIX #2
const damageVignetteEl = document.getElementById('damage-vignette');
const fpsCounterEl = document.getElementById('fps-counter');
const cheatConsoleEl = document.getElementById('cheat-console');
const consoleInputEl = document.getElementById('console-input');
const consoleOutputEl = document.getElementById('console-output');

// ---------------------------------------------------------
// Three.js — глобальные объекты сцены
// ---------------------------------------------------------
let scene, camera, renderer, clock;
const collectibles = [];
const obstacles = [];
// Spawnable jump platforms (cheat commands spawn_box / spawn_bbox):
// boxes the player can land on and walk around like solid props.
const boxPlatforms = [];
const flares = [];
const parkourShots = []; // double-jump projectiles (space)
const targets = []; // Array of bob/superbob targets
let damageFlashTimeout = null;
let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;

// ---------------------------------------------------------
// Cheat Console State
// ---------------------------------------------------------
let cheatConsoleOpen = false;

// ---------------------------------------------------------
// Звуки ходьбы
// ---------------------------------------------------------
let walkSound1 = null;
let walkSound2 = null;
let walkSoundCurrent = null;
let lastFootstepTime = 0;
let footstepInterval = 0.5; // Interval between footsteps (varies with speed)

// ---------------------------------------------------------
// Инициализация сцены, освещения и рендера
// ---------------------------------------------------------
function initScene() {
  scene = new THREE.Scene();
  const skyColor = 0x8fb4d9;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 35, 155);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, CONFIG.eyeHeight, 6);
  scene.add(camera); // Add the camera to the scene right at initialization

  // Expose for UI/systems modules (e.g. chest cheat commands in systems/chests.js)
  window.scene = scene;
  window.camera = camera;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.sortObjects = true;
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x3f5a2e, 0.8);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d0, 1.1);
  sun.position.set(55, 70, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 220;
  scene.add(sun);

  clock = new THREE.Clock();

  // Загрузка звуков ходьбы
  try {
    walkSound1 = new Audio('sounds/walk1.mp3');
    walkSound2 = new Audio('sounds/walk2.mp3');
    walkSound1.volume = 0.4;
    walkSound2.volume = 0.4;
    walkSound1.loop = false;
    walkSound2.loop = false;
  } catch (e) {
    console.warn('Footstep sounds failed to load:', e);
  }
}

// ---------------------------------------------------------
// Построение низкополигонального мира
// ---------------------------------------------------------
function createGround() {
  const geo = new THREE.PlaneGeometry(220, 220, 44, 44);
  geo.rotateX(-Math.PI / 2);
  const posAttr = geo.attributes.position;
  const base = new THREE.Color(0x4a6b3a);
  const colors = [];
  for (let i = 0; i < posAttr.count; i++) {
    const shade = 0.82 + Math.random() * 0.34;
    const c = base.clone().multiplyScalar(shade);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);
}

function createTree(x, z) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, flatShading: true, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.7, 6), trunkMat);
  trunk.position.y = 0.85;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);
  const leafColors = [0x3f6b34, 0x4a7a3c, 0x386028];
  const leafMat = new THREE.MeshStandardMaterial({
    color: leafColors[randInt(0, leafColors.length - 1)],
    flatShading: true,
    roughness: 0.9,
  });
  let y = 1.55;
  const tiers = 2 + randInt(0, 1);
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i * 0.26;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05 * s, 1.5 * s, 6), leafMat);
    cone.position.y = y;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
    y += 0.9 * s;
  }
  const scale = 0.85 + Math.random() * 0.5;
  group.scale.setScalar(scale);
  group.position.set(x, 0, z);
  group.rotation.y = Math.random() * Math.PI * 2;
  scene.add(group);
  obstacles.push({ x, z, radius: 0.42 * scale });
}

function createRock(x, z) {
  const size = 0.5 + Math.random() * 0.9;
  const mat = new THREE.MeshStandardMaterial({ color: 0x757b82, flatShading: true, roughness: 1 });
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), mat);
  rock.position.set(x, size * 0.35, z);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  obstacles.push({ x, z, radius: size * 0.75 });
}

function createBoundaryPillars() {
  const count = 28;
  const radius = CONFIG.worldBound + 3;
  const mat = new THREE.MeshStandardMaterial({ color: 0x4b4d55, flatShading: true, roughness: 1 });
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const h = 2.4 + Math.random() * 1.6;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), mat);
    pillar.position.set(Math.sin(angle) * radius, h / 2, Math.cos(angle) * radius);
    pillar.rotation.y = Math.random() * 0.3;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
  }
}

function createDistantMountains() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b7aa0, flatShading: true, roughness: 1 });
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const dist = 140 + Math.random() * 40;
    const radius = 22 + Math.random() * 20;
    const height = 26 + Math.random() * 22;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), mat);
    mesh.position.set(Math.sin(angle) * dist, height / 2 - 4, Math.cos(angle) * dist);
    scene.add(mesh);
  }
}

function createWorld() {
  createGround();
  createBoundaryPillars();
  createDistantMountains();
  for (let i = 0; i < 55; i++) { const p = randomPointInWorld(5); createTree(p.x, p.z); }
  for (let i = 0; i < 28; i++) { const p = randomPointInWorld(5); createRock(p.x, p.z); }
}

function createCollectibles() {
  const types = [
    'gem', 'gem', 'gem', 'gem',
    'potion_hp', 'potion_hp', 'potion_hp',
    'potion_mana', 'potion_mana', 'potion_mana',
  ];
  const total = 20;
  for (let i = 0; i < total; i++) {
    const id = types[i % types.length];
    const def = ITEM_DEFS[id];
    const p = randomPointInWorld(8);
    const baseY = 1.0;
    const geo = id === 'gem'
      ? new THREE.OctahedronGeometry(0.32, 0)
      : new THREE.IcosahedronGeometry(0.3, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.55,
      flatShading: true,
      roughness: 0.35,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, baseY, p.z);
    mesh.castShadow = true;
    scene.add(mesh);
    collectibles.push({ id, def, mesh, collected: false, baseY, phase: Math.random() * Math.PI * 2 });
  }
}

// ---------------------------------------------------------
// Столкновения с деревьями/камнями (2D-круги в плоскости XZ)
// ---------------------------------------------------------
function resolveCollisions(pos) {
  for (const o of obstacles) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const dist = Math.hypot(dx, dz);
    const minDist = o.radius + CONFIG.playerRadius;
    if (dist > 0.0001 && dist < minDist) {
      const push = minDist - dist;
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }
}

// ---------------------------------------------------------
// Spawnable jump platforms (cheat commands spawn_box / spawn_bbox)
// ---------------------------------------------------------
// Single-jump height margin: the box top sits slightly BELOW the peak of a
// regular jump (h = jumpSpeed^2 / (2*|gravity|) ≈ 2.18 m), so one normal jump
// is "exactly enough" to land on it.
const PLATFORM_HEIGHT_MARGIN = 0.25;
// How far below the eye level the feet are (used for landing checks)
const PLATFORM_FOOT_EYE_DELTA = CONFIG.eyeHeight;

function platformTopY(box) {
  return box.mesh.position.y + box.height / 2;
}

// Is the player's feet point horizontally inside the box footprint?
function isOverPlatform(px, pz) {
  for (const b of boxPlatforms) {
    const hx = b.width / 2 + CONFIG.playerRadius * 0.5; // slight edge forgiveness
    const hz = b.depth / 2 + CONFIG.playerRadius * 0.5;
    if (Math.abs(px - b.x) <= hx && Math.abs(pz - b.z) <= hz) return b;
  }
  return null;
}

// Horizontal blocking: prevent walking through box side walls at any
// height below the platform top (AABB vs circle in XZ).
function resolveBoxCollisions(pos, feetY) {
  for (const b of boxPlatforms) {
    if (feetY >= platformTopY(b) - 0.05) continue; // standing above/on it
    const r = CONFIG.playerRadius;
    const hx = b.width / 2, hz = b.depth / 2;
    const dx = pos.x - b.x, dz = pos.z - b.z;
    if (Math.abs(dx) <= hx + r && Math.abs(dz) <= hz + r) {
      const penX = hx + r - Math.abs(dx);
      const penZ = hz + r - Math.abs(dz);
      if (penX < penZ) pos.x += (dx >= 0 ? 1 : -1) * penX;
      else pos.z += (dz >= 0 ? 1 : -1) * penZ;
    }
  }
}

// Vertical landing: returns the surface Y the feet should rest on
// (ground = 0 or the top of a platform we are over), or null if free-falling.
function getPlatformSupport(feetY) {
  let best = null;
  for (const b of boxPlatforms) {
    const top = platformTopY(b);
    if (top <= feetY + 0.001) continue; // already below the surface
    if (best === null || top < best) best = top;
  }
  return best;
}

function createBoxPlatform(opts) {
  if (!scene || !camera) return null;
  const width = opts.width, height = opts.height, depth = opts.depth;
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color || 0x9c7b4f,
    flatShading: true,
    roughness: 0.9,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Place in front of the player, resting on the ground
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  if (dir.lengthSq() > 0.0001) dir.normalize(); else dir.set(0, 0, -1);
  const cx = camera.position.x + dir.x * 3;
  const cz = camera.position.z + dir.z * 3;
  mesh.position.set(cx, height / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // Simple wooden crate look: dark frame edges
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x3a2c1a })
  );
  mesh.add(edges);
  const box = {
    mesh, width, height, depth,
    x: cx, z: cz,
    kind: opts.kind || 'box',
  };
  boxPlatforms.push(box);
  return box;
}

// spawn_box: 1×1×1 meter cube — a single jump lands exactly on it
function spawnJumpBox() {
  const singleJumpPeak = (CONFIG.jumpSpeed * CONFIG.jumpSpeed) / (2 * Math.abs(CONFIG.gravity));
  const height = Math.max(0.5, singleJumpPeak - PLATFORM_HEIGHT_MARGIN);
  return createBoxPlatform({ width: 1, height, depth: 1, kind: 'box' });
}

// spawn_bbox: long low wall-like box — reachable only with the double jump
// (height above a single jump peak, below the two-jump apex)
function spawnBigJumpBox() {
  const singleJumpPeak = (CONFIG.jumpSpeed * CONFIG.jumpSpeed) / (2 * Math.abs(CONFIG.gravity));
  const height = clamp(singleJumpPeak * 1.5, singleJumpPeak + 0.2, singleJumpPeak * 2 - 0.4);
  return createBoxPlatform({
    width: 6, height, depth: 1, kind: 'bbox',
    color: 0x6f7f8f,
  });
}

function removeBoxPlatform(box) {
  const idx = boxPlatforms.indexOf(box);
  if (idx !== -1) boxPlatforms.splice(idx, 1);
  scene.remove(box.mesh);
}

// ---------------------------------------------------------
// HUD
// ---------------------------------------------------------
function updateHUD() {
  hpFillEl.style.width = (state.hp / state.maxHp * 100) + '%';
  hpValueEl.textContent = Math.ceil(state.hp) + '/' + state.maxHp;
  manaFillEl.style.width = (state.mana / state.maxMana * 100) + '%';
  manaValueEl.textContent = Math.ceil(state.mana) + '/' + state.maxMana;
  gemCountEl.textContent = state.gems;
  levelValueEl.textContent = state.level;
  xpFillEl.style.width = (state.xp / state.xpToNextLevel * 100) + '%';
  // Обновляем HUD слоты активных предметов
  updateActiveSlotsHUD();
}

function updateActiveSlotsHUD() {
  // Слот 1 (Shift)
  if (equipmentState.active1) {
    hudActive1Icon.textContent = equipmentState.active1.icon || '?';
    hudActive1Icon.parentElement.classList.add('filled');
    hudActive1Icon.parentElement.style.color = equipmentState.active1.color || '#eae6da';
  } else {
    hudActive1Icon.textContent = '';
    hudActive1Icon.parentElement.classList.remove('filled');
    hudActive1Icon.parentElement.style.color = '';
  }
  // Слот 2 (C)
  if (equipmentState.active2) {
    hudActive2Icon.textContent = equipmentState.active2.icon || '?';
    hudActive2Icon.parentElement.classList.add('filled');
    hudActive2Icon.parentElement.style.color = equipmentState.active2.color || '#eae6da';
  } else {
    hudActive2Icon.textContent = '';
    hudActive2Icon.parentElement.classList.remove('filled');
    hudActive2Icon.parentElement.style.color = '';
  }
}

function updateFpsCounter(dt) {
  if (!fpsToggle || !fpsToggle.checked) {
    fpsCounterEl.textContent = '';
    return;
  }
  fpsAccum += dt; fpsFrames++; fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fpsCounterEl.textContent = Math.round(fpsFrames / fpsAccum) + ' fps';
    fpsAccum = 0; fpsFrames = 0; fpsTimer = 0;
  }
}

function flashDamage() {
  damageVignetteEl.classList.add('active');
  clearTimeout(damageFlashTimeout);
  damageFlashTimeout = setTimeout(() => damageVignetteEl.classList.remove('active'), 260);
}

function applyDamage(amount) {
  if (amount <= 0 || state.dead) return;
  // Ambassador of Luck: входящий урон тоже рандомизирован ±10%
  if (typeof rollLuckDamage === 'function') amount = rollLuckDamage(amount);
  state.hp = Math.max(0, state.hp - amount);
  state.lastDamageTime = clock.getElapsedTime();
  flashDamage();
  if (state.hp <= 0) die();
}

// ---------------------------------------------------------
// Инвентарь
// ---------------------------------------------------------
function addToInventory(id) {
  const def = ITEM_DEFS[id];
  if (!state.inventory[id]) state.inventory[id] = { def, count: 0 };
  state.inventory[id].count++;
  if (id === 'gem') {
    state.gems++;
    addXp(10);
  } else {
    addXp(5);
  }
  renderInventoryGrid();
}

function addXp(amount) {
  state.xp += amount;
  if (state.xp >= state.xpToNextLevel) {
    state.xp -= state.xpToNextLevel;
    state.level++;
    state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.5);
    state.maxHp += 20;
    state.hp = state.maxHp;
    state.maxMana += 15;
    state.mana = state.maxMana;
  }
  updateHUD();
}

function useItem(id) {
  const entry = state.inventory[id];
  if (!entry || entry.count <= 0) return;
  if (entry.def.use) entry.def.use(state);
  entry.count--;
  if (entry.count <= 0) delete state.inventory[id];
  updateHUD();
  renderInventoryGrid();
}

function renderInventoryGrid() {
  inventoryGridEl.innerHTML = '';
  equipmentContainerEl.innerHTML = '';

  // ===== Секция экипировки (отдельный блок, НЕ в grid) =====
  const equipmentSection = document.createElement('div');
  equipmentSection.className = 'equipment-section';

  const mainRow = document.createElement('div');
  mainRow.className = 'equipment-row';

  // Слот руки
  const handWrapper = document.createElement('div');
  handWrapper.className = 'equip-slot-wrapper';
  handWrapper.appendChild(createEquipmentSlot('hand', equipmentState.hand, 'Hand'));
  mainRow.appendChild(handWrapper);

  // Активные слоты (Shift и C)
  const activeSlotsContainer = document.createElement('div');
  activeSlotsContainer.className = 'active-slots-container';
  activeSlotsContainer.appendChild(
    createEquipmentSlot('active1', equipmentState.active1, 'Active 1 (Shift)')
  );
  activeSlotsContainer.appendChild(
    createEquipmentSlot('active2', equipmentState.active2, 'Active 2 (C)')
  );
  mainRow.appendChild(activeSlotsContainer);

  // Пассивные слоты
  const passiveSlotsContainer = document.createElement('div');
  passiveSlotsContainer.className = 'passive-slots-container';
  passiveSlotsContainer.appendChild(
    createEquipmentSlot('passive1', equipmentState.passive1, 'Passive 1')
  );
  passiveSlotsContainer.appendChild(
    createEquipmentSlot('passive2', equipmentState.passive2, 'Passive 2')
  );
  mainRow.appendChild(passiveSlotsContainer);

  // Отдельная ячейка врождённой способности (не является пассивным слотом)
  const innateSlotsContainer = document.createElement('div');
  innateSlotsContainer.className = 'innate-slots-container';
  innateSlotsContainer.appendChild(
    createEquipmentSlot('innate', equipmentState.innate, 'Innate Ability')
  );
  mainRow.appendChild(innateSlotsContainer);

  equipmentSection.appendChild(mainRow);
  equipmentContainerEl.appendChild(equipmentSection);

  // ===== Слоты предметов (только они внутри grid) =====
  const order = ['gem', 'potion_hp', 'potion_mana'];
  const totalSlots = 16;
  for (let i = 0; i < totalSlots; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    const itemId = order[i];
    const entry = itemId ? state.inventory[itemId] : null;
    if (entry && entry.count > 0) {
      slot.classList.add('filled');
      slot.style.color = entry.def.color;
      const usable = entry.def.use ? ' — use' : '';
      slot.innerHTML = entry.def.icon +
        '<span class="inv-count">' + entry.count + '</span>' +
        '<span class="inv-tooltip">' + entry.def.name + usable + '</span>';
      if (entry.def.use) slot.addEventListener('click', () => useItem(itemId));
    }
    inventoryGridEl.appendChild(slot);
  }
}

function createEquipmentSlot(slotName, item, tooltipText) {
  const slot = document.createElement('div');
  slot.className = 'equip-slot';
  slot.dataset.slot = slotName;
  if (item) {
    slot.classList.add('filled');
    slot.style.color = item.color || '#eae6da';
    const tip = item.tooltip ? (item.name + ' — ' + item.tooltip) : (item.name || tooltipText);
    slot.innerHTML = (item.icon || '?') +
      '<span class="equip-tooltip">' + tip + '</span>';
    // Отдельная стилизация ячейки врождённой способности
    if (slotName === 'innate' || item.innate) {
      slot.classList.add('equip-slot-innate');
      slot.style.borderColor = item.color || 'var(--panel-border)';
      slot.style.boxShadow = '0 0 8px ' + (item.color || '#fff') + '55';
    }
  } else if (slotName === 'innate') {
    // Пустая врождённая ячейка показываем звёздочкой, а не плюсом
    slot.innerHTML = '<span class="slot-empty">✧</span>' +
      '<span class="equip-tooltip">' + tooltipText + '</span>';
    slot.classList.add('equip-slot-innate', 'empty');
  } else {
    slot.innerHTML = '<span class="slot-empty">+</span>' +
      '<span class="equip-tooltip">' + tooltipText + '</span>';
  }
  return slot;
}

function collectItem(item) {
  if (item.collected) return;
  item.collected = true;
  item.mesh.visible = false;
  addToInventory(item.id);
  state.nearestPickup = null;
  pickupPromptEl.classList.add('hidden');
}

// ---------------------------------------------------------
// Анимация руки/удара (ЛКМ - как в Far Cry)
// ---------------------------------------------------------
let handMesh = null;
let isPunching = false;
let punchStartTime = 0;
let punchDuration = 0.25;

function createHand() {
  // Создаём простую модель руки (кулак)
  const handGroup = new THREE.Group();
  // Кулак
  const fistGeo = new THREE.BoxGeometry(0.15, 0.12, 0.2);
  const fistMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, flatShading: true });
  const fist = new THREE.Mesh(fistGeo, fistMat);
  fist.castShadow = true;
  handGroup.add(fist);
  // Предплечье
  const armGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.35, 8);
  const armMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, flatShading: true });
  const arm = new THREE.Mesh(armGeo, armMat);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = -0.2;
  arm.castShadow = true;
  handGroup.add(arm);
  handGroup.position.set(0.25, -0.2, -0.4);
  handGroup.rotation.y = -0.1;
  handGroup.rotation.x = 0.05;
  // Прикрепляем руку к камере, чтобы она двигалась вместе с игроком
  camera.add(handGroup);
  return handGroup;
}

function initHand() {
  if (!handMesh) {
    handMesh = createHand();
  }
}

function startPunch() {
  if (isPunching || !handMesh) return;
  isPunching = true;
  punchStartTime = clock.getElapsedTime();
}

function updateHandAnimation(dt) {
  if (!handMesh || !isPunching) return;
  const elapsed = clock.getElapsedTime() - punchStartTime;
  if (elapsed >= punchDuration) {
    isPunching = false;
    // Возвращаем руку в исходное положение
    handMesh.position.set(0.25, -0.2, -0.4);
    handMesh.rotation.set(0.05, -0.1, 0);
    return;
  }
  // Анимация удара: рука движется вперёд и немного вверх
  const t = elapsed / punchDuration;
  const punchProgress = Math.sin(t * Math.PI); // Smooth there-and-back motion
  // Позиция во время удара
  const forwardDist = 0.15 * punchProgress;
  const upDist = 0.08 * punchProgress;
  const rotateAngle = -0.3 * punchProgress;
  handMesh.position.z = -0.4 + forwardDist;
  handMesh.position.y = -0.2 + upDist;
  handMesh.rotation.x = 0.05 + rotateAngle;
  handMesh.rotation.y = -0.1 - (0.15 * punchProgress);
}

// ---------------------------------------------------------
// Прыжки и врождённые способности
// ---------------------------------------------------------
// Есть ли у игрока врождённая способность с данным id
function hasInnateAbility(abilityId) {
  return !!state.innateSchool && state.innateAbilityId === abilityId;
}

// Совершить прыжок. isDouble — второй прыжок в воздухе (Parkour):
// вниз вылетает снаряд с уроном = урон руки ×2
function doJump(isDouble) {
  state.velocityY = CONFIG.jumpSpeed;
  state.onGround = false;
  state.jumpQueued = false;
  state.lastJumpTime = clock ? clock.getElapsedTime() : 0;
  if (isDouble) spawnParkourProjectile();
}

// Снаряд «Parkour»: летит вертикально вниз от ног игрока
// и взрывается при касании земли (y <= 0.15). Взрыв наносит урон только
// целям, игроку он вреда не причиняет.
const PARKOUR = {
  speed: 16,             // projectile fall speed (m/s)
  maxAge: 2.5,           // lifetime (seconds)
  spawnDrop: CONFIG.eyeHeight * 0.5, // how far below the camera the projectile spawns
  radius: 2.2,           // area-damage radius
};
function spawnParkourProjectile() {
  const geo = new THREE.SphereGeometry(0.16, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(camera.position);
  mesh.position.y -= PARKOUR.spawnDrop;
  const light = new THREE.PointLight(0x8f6bff, 1.0, 6);
  mesh.add(light);
  scene.add(mesh);
  parkourShots.push({
    mesh,
    dir: new THREE.Vector3(0, -1, 0),
    speed: PARKOUR.speed,
    born: clock.getElapsedTime(),
    damage: getHandDamage() * 2,
  });
}

function updateParkourShots(dt, elapsed) {
  for (let i = parkourShots.length - 1; i >= 0; i--) {
    const p = parkourShots[i];
    const age = elapsed - p.born;
    if (age > PARKOUR.maxAge) {
      scene.remove(p.mesh);
      parkourShots.splice(i, 1);
      continue;
    }
    p.mesh.position.addScaledVector(p.dir, p.speed * dt);
    // Снаряд упёрся в землю — взрыв по площади
    if (p.mesh.position.y <= 0.15) {
      explodeParkourShot(p);
      scene.remove(p.mesh);
      parkourShots.splice(i, 1);
      continue;
    }
    // Попадание по цели
    for (const target of targets) {
      const dist = p.mesh.position.distanceTo(target.mesh.position);
      if (dist < 1.3) {
        explodeParkourShot(p);
        scene.remove(p.mesh);
        parkourShots.splice(i, 1);
        break;
      }
    }
  }
}

// Взрыв снаряда: урон = урон руки ×2 (с учётом Ambassador of Luck)
function explodeParkourShot(shot) {
  let dmg = shot.damage;
  if (typeof rollLuckDamage === 'function') dmg = rollLuckDamage(dmg);
  for (const target of targets.slice()) {
    const dist = shot.mesh.position.distanceTo(target.mesh.position);
    if (dist < PARKOUR.radius) applyDamageToTarget(target, Math.max(1, Math.round(dmg)));
  }
  // Короткая вспышка на месте взрыва
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.85 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), flashMat);
  flash.position.copy(shot.mesh.position);
  flash.position.y = Math.max(0.2, flash.position.y);
  scene.add(flash);
  scorchPulses.push({ mesh: flash, born: clock.getElapsedTime(), duration: 0.3 });
}

// ---------------------------------------------------------
// Scorching Flame:
// аура ожога — постоянный урон по всем целям рядом с игроком
// ---------------------------------------------------------
const SCORCH = { radius: 7, tickInterval: 0.55, baseDamagePerTick: 3 };
// Параметры ауры можно переопределить из data/schools.js (INNATE_ABILITIES.fire)
function getScorchParams() {
  const a = (typeof INNATE_ABILITIES !== 'undefined' && INNATE_ABILITIES.fire) || {};
  return {
    radius: a.radius ?? SCORCH.radius,
    tickInterval: a.tickInterval ?? SCORCH.tickInterval,
    damagePerTick: a.damagePerTick ?? SCORCH.baseDamagePerTick,
  };
}
let scorchTickAccum = 0;
const scorchPulses = []; // visual aura pulses

function updateScorchAura(dt) {
  if (!hasInnateAbility('scorching_flame')) return;
  const params = getScorchParams();
  scorchTickAccum += dt;
  if (scorchTickAccum < params.tickInterval) return;
  scorchTickAccum = 0;
  let hitAny = false;
  for (const target of targets.slice()) {
    const dx = camera.position.x - target.mesh.position.x;
    const dz = camera.position.z - target.mesh.position.z;
    const dy = camera.position.y - target.mesh.position.y;
    if (Math.hypot(dx, dy, dz) <= params.radius) {
      let dmg = params.damagePerTick;
      if (typeof rollLuckDamage === 'function') dmg = rollLuckDamage(dmg);
      applyDamageToTarget(target, Math.max(1, Math.round(dmg)));
      hitAny = true;
    }
  }
  if (hitAny) {
    // Оранжевая волна, расходящаяся от игрока — индикация ауры
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff7a2a, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(camera.position.x, 0.06, camera.position.z);
    scene.add(ring);
    scorchPulses.push({ mesh: ring, born: clock.getElapsedTime(), duration: 0.6 });
  }
}

function updateScorchPulses(dt, elapsed) {
  for (let i = scorchPulses.length - 1; i >= 0; i--) {
    const p = scorchPulses[i];
    const age = elapsed - p.born;
    if (age >= p.duration) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      p.mesh.geometry.dispose();
      scorchPulses.splice(i, 1);
      continue;
    }
    const t = age / p.duration;
    const s = 1 + t * 7;
    p.mesh.scale.set(s, s, s);
    p.mesh.material.opacity = 0.35 * (1 - t);
  }
}

// ---------------------------------------------------------
// Применение выбранной врождённой магии (вызывается из ui/school_select.js)
// ---------------------------------------------------------
function applyInnateSchool(schoolId) {
  const ability = INNATE_ABILITIES[schoolId];
  if (!ability) return;
  state.innateSchool = schoolId;
  state.innateAbilityId = ability.id;

  // Врождённая способность занимает СВОЮ отдельную ячейку (не пассивные слоты)
  equipmentState.innate = {
    id: ability.id,
    name: ability.name,
    icon: ability.icon,
    color: ability.color,
    innate: true,
    tooltip: ability.description,
  };

  // Сброс состояния парного прыжка при смене школы
  state.airJumpsUsed = 0;
  state.doubleJumpActive = false;

  renderInventoryGrid();
  updateHUD();
}

// Экспорт для UI-систем
window.applyInnateSchool = applyInnateSchool;
window.hasInnateAbility = hasInnateAbility;
window.beginGame = beginGame;
window.gameState = state; // state reference for UI systems (school_select etc.)

// ---------------------------------------------------------
// Способность: вспышка маны (ПКМ)
// ---------------------------------------------------------
function castFlare() {
  if (state.mana < CONFIG.flareManaCost) return;
  state.mana -= CONFIG.flareManaCost;
  camera.updateMatrixWorld();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const mat = new THREE.MeshBasicMaterial({ color: 0x8ec9ff, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
  mesh.position.copy(camera.position).addScaledVector(dir, 0.8);
  const light = new THREE.PointLight(0x8ec9ff, 1.4, 8);
  mesh.add(light);
  scene.add(mesh);
  flares.push({ mesh, dir: dir.clone(), light, born: clock.getElapsedTime() });
}

function updateFlares(dt, elapsed) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i];
    const age = elapsed - f.born;
    if (age > 1.1) {
      scene.remove(f.mesh);
      flares.splice(i, 1);
      continue;
    }
    f.mesh.position.addScaledVector(f.dir, dt * 9);
    const t = age / 1.1;
    f.mesh.material.opacity = 1 - t;
    f.light.intensity = 1.4 * (1 - t);
  }
}

// ---------------------------------------------------------
// Анимация подбираемых предметов
// ---------------------------------------------------------
function updateCollectiblesAnim(dt, elapsed) {
  for (const item of collectibles) {
    if (item.collected) continue;
    item.mesh.rotation.y += dt * 1.4;
    item.mesh.position.y = item.baseY + Math.sin(elapsed * 2 + item.phase) * 0.15;
  }
}

function updateNearestPickup() {
  let nearest = null;
  let nearestDist = CONFIG.pickupRadius;
  for (const item of collectibles) {
    if (item.collected) continue;
    const dx = camera.position.x - item.mesh.position.x;
    const dz = camera.position.z - item.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < nearestDist) { nearestDist = dist; nearest = item; }
  }
  state.nearestPickup = nearest;
  if (nearest) {
    pickupPromptEl.textContent = 'E — pick up: ' + nearest.def.name;
    pickupPromptEl.classList.remove('hidden');
  } else {
    pickupPromptEl.classList.add('hidden');
  }
}

// ---------------------------------------------------------
// Игрок: движение, физика, характеристики
// ---------------------------------------------------------
function isActive() {
  // Any modal window with a visible cursor (school select etc.) blocks input
  if (typeof hasModalOverlayOpen === 'function' && hasModalOverlayOpen()) return false;
  if (typeof schoolSelectIsOpen === 'function' && schoolSelectIsOpen()) return false;
  return state.started && !state.paused && !state.inventoryOpen && !state.dead && !cheatConsoleOpen;
}

// Is there an open modal window that requires a visible cursor?
// NOTE: 'pause-screen' is intentionally NOT in the list. The pause menu is
// opened as a RESULT of losing pointer lock; if it counted as a blocking
// modal, requestGamePointerLock() (guarded by isActive()) would refuse to
// re-lock while paused, and the resume retry loop could never succeed —
// which caused the "can't close pause / infinite reopen" cycle. Pause state
// itself is tracked via state.paused everywhere else.
function hasModalOverlayOpen() {
  const ids = [
    'school-select-screen',
    'inventory-screen',
    'death-screen',
    'spell-choice-screen',
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) return true;
  }
  return false;
}

// ---------------------------------------------------------
// Физика движения в стиле Valve Source Engine
// ---------------------------------------------------------

// Аналог CMovement::Accelerate из SDK Source (vphysics).
// Ключевая идея: ограничивается НЕ абсолютная скорость, а её
// ПРОЕКЦИЯ на направление желаемого движения (wishdir). Поэтому
// при зигзагообразном движении (strafe) в воздухе можно набирать
// скорость выше wishspeed — классическая стрейф-акселерация.
function accelerate(wishdir, wishspeed, accel, deltaTime) {
  const vel = state.velocity;
  // currentspeed = Dot Product текущей скорости и направления желания
  const currentspeed = vel.x * wishdir.x + vel.z * wishdir.z;
  // Прирост скорости ограничен разницей между желаемой и проекцией
  const addspeed = wishspeed - currentspeed;
  if (addspeed <= 0) return;
  // Сколько реально можем добавить за этот кадр
  let accelspeed = accel * deltaTime * wishspeed;
  if (accelspeed > addspeed) accelspeed = addspeed;
  // velocity += wishdir * accelspeed
  vel.x += wishdir.x * accelspeed;
  vel.z += wishdir.z * accelspeed;
}

// Аналог CMovement::ApplyFriction из SDK Source.
// Уменьшает горизонтальную скорость пропорционально её величине.
function applyFriction(deltaTime) {
  const vel = state.velocity;
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.001) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  // control = max(speed, stopspeed)
  const control = Math.max(speed, CONFIG.stopSpeed);
  // frictionfactor = control * (friction * frametime)
  const frictionFactor = control * (CONFIG.friction * deltaTime);
  // drop = speed * frictionfactor, но не более самой скорости
  const drop = speed * Math.min(frictionFactor, 1);
  const retain = Math.max(0, speed - drop) / speed;
  vel.x *= retain;
  vel.z *= retain;
}

function updatePlayer(dt, elapsed) {
  // Пока открыт экран выбора врождённой магии — игрока не обновляем
  if (typeof schoolSelectIsOpen === 'function' && schoolSelectIsOpen()) return;
  const forward = new THREE.Vector3(-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y));
  const right = new THREE.Vector3(Math.cos(camera.rotation.y), 0, -Math.sin(camera.rotation.y));
  let moveX = 0, moveZ = 0;
  if (state.keys['KeyW']) moveZ += 1;
  if (state.keys['KeyS']) moveZ -= 1;
  if (state.keys['KeyD']) moveX += 1;
  if (state.keys['KeyA']) moveX -= 1;
  const isMoving = moveX !== 0 || moveZ !== 0;

  // --- Формируем wishdir (направление желаемого движения) ---
  let wishdirX = 0, wishdirZ = 0;
  if (isMoving) {
    wishdirX = forward.x * moveZ + right.x * moveX;
    wishdirZ = forward.z * moveZ + right.z * moveX;
    const len = Math.hypot(wishdirX, wishdirZ);
    if (len > 0.0001) { wishdirX /= len; wishdirZ /= len; }
  }
  const wishspeed = CONFIG.maxSpeed;

  // --- GroundMove / AirMove (как в player.cpp Source) ---
  // Активен ли прыжок: клавиша зажата ИЛИ находится в буфере ввода
  const jumpHeld = !!state.keys['Space'] || state.jumpQueued;
  if (state.onGround) {
    // Bunnyhop: если в момент приземления активна клавиша прыжка,
    // пропускаем фазу трения этого кадра — накопленная горизонтальная
    // скорость сохраняется, и сразу выдаётся импульс прыжка вверх.
    if (jumpHeld) {
      doJump();
    } else {
      // На земле: сначала трение (Friction), уменьшающее velocity,
      // затем accelerate() с обычными высокими параметрами
      applyFriction(dt);
      if (isMoving) {
        accelerate({ x: wishdirX, z: wishdirZ }, wishspeed, CONFIG.groundAccelerate, dt);
      }
    }
  } else {
    // В воздухе: трение полностью отключено.
    // wishspeed искусственно ограничен очень маленьким значением,
    // airAccelerate ~ 10–15 (sv_airaccelerate). Это не даёт разогнаться
    // по прямой, но позволяет набирать скорость зигзагами при
    // синхронном повороте мыши и зажатии стрейфов (A или D).
    if (isMoving) {
      accelerate({ x: wishdirX, z: wishdirZ }, CONFIG.airWishSpeed, CONFIG.airAccelerate, dt);
    }
  }

  // --- Интегрирование горизонтальной скорости в позицию ---
  const next = new THREE.Vector3(
    camera.position.x + state.velocity.x * dt,
    0,
    camera.position.z + state.velocity.z * dt
  );
  resolveCollisions(next);
  // Box platforms: block walking through their side walls (unless we are
  // already above the platform surface)
  resolveBoxCollisions(next, camera.position.y - state.bobOffset - CONFIG.eyeHeight);
  next.x = clamp(next.x, -CONFIG.worldBound, CONFIG.worldBound);
  next.z = clamp(next.z, -CONFIG.worldBound, CONFIG.worldBound);
  // Если столкновение «съело» движение — гасим скорость по этой оси,
  // чтобы не «тереться» об препятствие (аналог ClipVelocity)
  const expectedX = camera.position.x + state.velocity.x * dt;
  const expectedZ = camera.position.z + state.velocity.z * dt;
  if (Math.abs(next.x - expectedX) > 1e-6) state.velocity.x = 0;
  if (Math.abs(next.z - expectedZ) > 1e-6) state.velocity.z = 0;
  camera.position.x = next.x;
  camera.position.z = next.z;

  // Мана и здоровье
  state.mana = Math.min(state.maxMana, state.mana + CONFIG.manaRegenRate * dt);
  if (elapsed - state.lastDamageTime > CONFIG.hpRegenDelay) {
    state.hp = Math.min(state.maxHp, state.hp + CONFIG.hpRegenRate * dt);
  }
  // Обновление показателей восстановления в HUD
  const hpRegenDisplay = (elapsed - state.lastDamageTime > CONFIG.hpRegenDelay) ? CONFIG.hpRegenRate : 0;
  const manaRegenDisplay = CONFIG.manaRegenRate;
  hpRegenEl.textContent = '+' + hpRegenDisplay.toFixed(1) + '/s';
  manaRegenEl.textContent = '+' + manaRegenDisplay.toFixed(1) + '/sec';
  // Вертикальная физика (гравитация и приземление)
  state.velocityY += CONFIG.gravity * dt;
  let newY = camera.position.y - state.bobOffset + state.velocityY * dt;
  // Landing surface for the feet: ground (y=0) or the top of a box platform
  // we are horizontally over. Standing on a platform keeps bunnyhop/jump
  // mechanics identical to standing on the ground, just at eyeHeight + topY.
  const supportTop = isOverPlatform(camera.position.x, camera.position.z);
  const feetNow = camera.position.y - state.bobOffset - CONFIG.eyeHeight;
  let surfaceY = 0;
  if (supportTop && state.velocityY >= 0) {
    // Rising/standing under a platform ceiling — block upward motion
    if (feetNow < platformTopY(supportTop) - 0.05 && newY - CONFIG.eyeHeight > platformTopY(supportTop)) {
      newY = platformTopY(supportTop) + CONFIG.eyeHeight;
      state.velocityY = Math.min(state.velocityY, 0);
    }
  }
  // Which platform tops can the feet rest on right now? A platform supports
  // the player when they are over it and their feet are at/above its surface
  // (with a small tolerance). The highest such surface wins; otherwise the
  // player falls to the ground.
  function getSupportSurfaceY(feetY) {
    let best = 0;
    for (const b of boxPlatforms) {
      const hx = b.width / 2 + CONFIG.playerRadius * 0.5;
      const hz = b.depth / 2 + CONFIG.playerRadius * 0.5;
      if (Math.abs(camera.position.x - b.x) <= hx && Math.abs(camera.position.z - b.z) <= hz) {
        const top = platformTopY(b);
        if (top <= feetY + 0.08 && top > best) best = top;
      }
    }
    return best;
  }
  surfaceY = getSupportSurfaceY(feetNow);
  const surfaceEye = CONFIG.eyeHeight + surfaceY;
  // While standing on a platform, walk off its edge → start falling
  if (state.onGround && surfaceY > 0.001) {
    const b = isOverPlatform(camera.position.x, camera.position.z);
    if (!b || Math.abs(platformTopY(b) - surfaceY) > 0.01) {
      state.onGround = false;
      newY = camera.position.y - state.bobOffset;
    }
  }
  if (newY <= surfaceEye) {
    if (!state.onGround) {
      const impact = Math.abs(state.velocityY);
      // Урон от падения не начисляется, если игрок приземляется
      // после двойного прыжка «Parkour»
      if (impact > CONFIG.fallDamageThreshold && !state.doubleJumpActive) {
        applyDamage((impact - CONFIG.fallDamageThreshold) * CONFIG.fallDamageMultiplier);
      }
      // Bunnyhop: в момент приземления, если клавиша прыжка активна
      // (зажата или находится в буфере ввода), пропускаем фазу трения
      // этого кадра — горизонтальная скорость сохраняется целиком,
      // и сразу придаётся импульс прыжка вверх.
      if (jumpHeld && impact <= CONFIG.fallDamageThreshold) {
        doJump();
        state.onGround = true;
        newY = surfaceEye;
      } else {
        newY = surfaceEye;
        state.velocityY = 0;
        state.onGround = true;
      }
      // Приземление — сбрасываем счётчик прыжков в воздухе (Parkour)
      state.airJumpsUsed = 0;
      state.doubleJumpActive = false;
    } else {
      newY = surfaceEye;
      state.velocityY = 0;
      state.onGround = true;
      state.airJumpsUsed = 0;
      state.doubleJumpActive = false;
    }
  } else {
    state.onGround = false;
  }
  // Покачивание камеры при ходьбе (амплитуда зависит от скорости)
  const horizSpeed = Math.hypot(state.velocity.x, state.velocity.z);
  if (state.onGround && isMoving) {
    state.bobTimer += dt * 8.4 * clamp(horizSpeed / CONFIG.maxSpeed, 0.3, 2);
    state.bobOffset = Math.sin(state.bobTimer) * 0.05;
    // Воспроизведение звуков шагов
    const stepInterval = 0.5;
    if (elapsed - lastFootstepTime > stepInterval) {
      lastFootstepTime = elapsed;
      playFootstep();
    }
  } else {
    state.bobOffset += (0 - state.bobOffset) * Math.min(1, dt * 8);
  }
  camera.position.y = newY + state.bobOffset;
  updateNearestPickup();
}

function idleCameraUpdate(elapsed) {
  const angle = elapsed * 0.045;
  const radius = 34;
  camera.position.set(Math.sin(angle) * radius, 11, Math.cos(angle) * radius);
  camera.lookAt(0, 2.5, 0);
}

// ---------------------------------------------------------
// Управление состояниями игры
// ---------------------------------------------------------
function playFootstep() {
  if (!walkSound1 || !walkSound2) return;
  // Останавливаем текущий звук
  if (walkSoundCurrent && !walkSoundCurrent.paused) {
    walkSoundCurrent.pause();
    walkSoundCurrent.currentTime = 0;
  }
  // Выбираем следующий звук (чередование)
  walkSoundCurrent = (walkSoundCurrent === walkSound1) ? walkSound2 : walkSound1;
  // Сбрасываем и воспроизводим
  walkSoundCurrent.currentTime = 0;
  walkSoundCurrent.play().catch(() => {});
}

function resetPlayerPosition() {
  camera.position.set(0, CONFIG.eyeHeight, 6);
  camera.rotation.set(0, 0, 0);
  state.velocityY = 0;
  state.velocity.x = 0;
  state.velocity.z = 0;
  state.jumpQueued = false;
  state.onGround = true;
  state.bobOffset = 0;
  state.bobTimer = 0;
  state.keys = {};
}

function beginGame() {
  state.started = true;
  state.paused = false;
  state.dead = false;
  menuFrameContainer.classList.add('hidden');
  hudEl.classList.remove('hidden');
  resetPlayerPosition();
  // Инициализация статов из data/stats.js + systems/stats.js (броня, резисты и т.д.)
  if (typeof recalcStats === 'function') recalcStats();
  updateHUD();
  renderInventoryGrid();
  initHand();

  // ФИКС №1: снимаем фокус с iframe и возвращаем родительскому окну
  if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
    document.activeElement.blur();
  }
  if (menuFrameContainer.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  window.focus();
  container.focus();

  requestGamePointerLock();
}

// Acquire the game pointer lock. If the pointer is already locked by another
// element (or stuck after the school-select screen), release it first —
// otherwise requestPointerLock() fails silently with pointerlockerror and a
// visible cursor stays behind with no camera control.
function requestGamePointerLock() {
  if (!isActive()) return; // modal window open (school select) — don't lock
  const pl = document.pointerLockElement;
  if (pl === container) return; // already locked
  if (pl) {
    // locked on another element — wait for pointerlockchange and retry
    document.exitPointerLock();
    setTimeout(requestGamePointerLock, 60);
    return;
  }
  try {
    const res = container.requestPointerLock();
    if (res && typeof res.catch === 'function') {
      res.catch(() => {});
    }
  } catch (err) {
    console.warn('requestPointerLock failed', err);
  }
  // Если браузер отклонил запрос (нет user activation / «cooling-off» период
  // после выхода из блокировки), повторит страховочный setInterval ниже —
  // здесь дополнительных таймеров не нужно, чтобы не создавать гонку.
}

// Access from UI scripts (school_select etc.)
window.requestGamePointerLock = requestGamePointerLock;

// ---------------------------------------------------------------
// Pointer-lock state machine for the pause menu.
//
// Root cause of the old bugs: pressing Esc fires BOTH the keydown handler
// AND the browser's built-in pointer-unlock (pointerlockchange event).
// Depending on timing/ordering this used to open the pause screen twice
// (stacked overlays) or re-open it forever when trying to close it (the
// resume lock attempt failed during Chrome's ~1s "cooling-off" period
// after an Esc-unlock, and each failure path re-triggered the pause logic).
//
// The single rule now: pointerlockchange ONLY pauses the game when the
// pointer WAS locked and the game was fully active. Resuming goes through
// resumeFromPause(), which hides the screen synchronously and then retries
// the lock in a bounded loop that NEVER touches the pause screen state.
// ---------------------------------------------------------------
let wasLockedBeforeUnlock = false; // true right after a real lock existed
let resumeLockTimer = null;        // bounded retry timer after resuming

function stopResumeLockRetries() {
  if (resumeLockTimer) {
    clearInterval(resumeLockTimer);
    resumeLockTimer = null;
  }
}

// Safety loop: if the browser rejected the lock request (no user activation
// / cooling-off period), automatically retry every 500 ms while the game is
// active and the pointer is not locked. Bounded interval — one single place
// that requests locks outside of direct user gestures.
setInterval(() => {
  if (document.pointerLockElement === container) return; // already locked
  if (!isActive()) return; // pause/inventory/school select — cursor must stay visible
  requestGamePointerLock();
}, 500);

// Fallback: clicking the game viewport (a user gesture — browsers always
// allow locking in response to one) requests the lock immediately.
container.addEventListener('click', () => {
  if (isActive() && document.pointerLockElement !== container) {
    requestGamePointerLock();
  }
});

function die() {
  state.dead = true;
  state.keys = {};
  document.exitPointerLock();
  deathScreen.classList.remove('hidden');
}

function respawn() {
  state.hp = state.maxHp;
  state.mana = state.maxMana;
  state.lastDamageTime = -999;
  resetPlayerPosition();
  state.dead = false;
  deathScreen.classList.add('hidden');
  updateHUD();
  // Reinitialize hand if it was removed
  if (!handMesh) {
    initHand();
  }
  requestGamePointerLock();
}

function fullReset() {
  state.hp = 100;
  state.maxHp = 100;
  state.mana = 100;
  state.maxMana = 100;
  state.level = 1;
  state.xp = 0;
  state.xpToNextLevel = 100;
  state.inventory = {};
  state.gems = 0;
  state.lastDamageTime = -999;
  // Сброс экипировки к значениям по умолчанию
  equipmentState.hand = DEFAULT_HAND;
  equipmentState.active1 = null;
  equipmentState.active2 = null;
  equipmentState.passive1 = null;
  equipmentState.passive2 = null;
  equipmentState.innate = null;
  // Сброс врождённой магии
  state.innateSchool = null;
  state.innateAbilityId = null;
  state.airJumpsUsed = 0;
  state.doubleJumpActive = false;
  // Убрать активные снаряды/вспышки
  for (const p of parkourShots) scene.remove(p.mesh);
  parkourShots.length = 0;
  for (const p of scorchPulses) scene.remove(p.mesh);
  scorchPulses.length = 0;
  // Remove spawned jump platforms (spawn_box / spawn_bbox)
  while (boxPlatforms.length) removeBoxPlatform(boxPlatforms[0]);
  // Remove spawned chests (chest_* cheat commands)
  if (typeof activeChests !== 'undefined') {
    for (const c of activeChests) scene.remove(c.mesh);
    activeChests.length = 0;
  }
  collectibles.forEach((c) => { c.collected = false; c.mesh.visible = true; });
  resetPlayerPosition();
  state.dead = false;
  state.paused = false;
  deathScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  menuFrameContainer.classList.add('hidden');
  hudEl.classList.remove('hidden');
  updateHUD();
  renderInventoryGrid();
  // Reinitialize hand if it was removed
  if (!handMesh) {
    initHand();
  }
  requestGamePointerLock();
}

function toggleInventory() {
  state.inventoryOpen = !state.inventoryOpen;
  if (state.inventoryOpen) {
    state.keys = {};
    renderInventoryGrid();
    inventoryScreen.classList.remove('hidden');
    document.exitPointerLock();
  } else {
    inventoryScreen.classList.add('hidden');
    requestGamePointerLock();
    // Reinitialize hand if it was removed
    if (!handMesh) {
      initHand();
    }
  }
  // Окошко статов слева в инвентаре (ui/inventory.js)
  if (typeof window.syncStatsInventoryPanel === 'function') window.syncStatsInventoryPanel();
}

// ---------------------------------------------------------
// Обработчики ввода
// ---------------------------------------------------------
function onSensitivityChange(e) {
  state.mouseSensitivity = parseFloat(e.target.value);
  sensSliderPause.value = state.mouseSensitivity;
}

function onMouseMove(e) {
  if (document.pointerLockElement !== container || !isActive()) return;
  const sens = 0.0022 * state.mouseSensitivity;
  camera.rotation.y -= e.movementX * sens;
  camera.rotation.x -= e.movementY * sens;
  camera.rotation.x = clamp(camera.rotation.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
}

function onMouseDown(e) {
  if (e.button === 2 && document.pointerLockElement === container && isActive()) {
    castFlare();
  }
  // Punch animation on left click (button 0) - works when game is active (not paused/dead)
  // Allow punching even when cheat console is open
  if (e.button === 0 && isActive()) {
    startPunch();
    checkTargetHit();
  }
}

function checkTargetHit() {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 2.5; // Limit raycast check distance
  const targetMeshes = targets.map(t => t.mesh);
  const intersects = raycaster.intersectObjects(targetMeshes);
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    const target = targets.find(t => t.mesh === hitMesh);
    if (target) {
      // Get damage from the current hand
      let damage = getHandDamage();
      // Innate ability "Ambassador of Luck": ±10% to any damage
      if (typeof rollLuckDamage === 'function') damage = rollLuckDamage(damage);
      // Deal damage and show immediately
      applyDamageToTarget(target, damage);
    }
  }
}

// Expose checkTargetHit globally for cheat console access
window.checkTargetHit = checkTargetHit;

// Resume the game from the pause menu: hide the screen, clear the flag and
// re-acquire pointer lock. Shared by the Resume button and the Escape key.
function resumeFromPause() {
  // Idempotent guard: if the pause menu is not actually open (already
  // resumed via another path), do nothing — prevents double-close races
  // between the Esc keydown handler and other listeners.
  if (!state.paused && pauseScreen.classList.contains('hidden')) return;
  stopResumeLockRetries();
  state.paused = false;
  state.keys = {};
  pauseScreen.classList.add('hidden');
  wasLockedBeforeUnlock = false;
  // Bounded retry loop: browsers reject a new lock request for ~1 second
  // after an Escape unlock ("cooling-off"). We ONLY retry the lock here —
  // this loop never shows the pause screen, so it cannot cause a reopen
  // cycle. The generic safety interval picks up if these retries fail too.
  let attempts = 0;
  resumeLockTimer = setInterval(() => {
    if (document.pointerLockElement === container || !state.started ||
        state.paused || state.dead || state.inventoryOpen || hasModalOverlayOpen()) {
      stopResumeLockRetries();
      return;
    }
    requestGamePointerLock();
    if (++attempts > 8) stopResumeLockRetries(); // give up after ~2 s
  }, 250);
  requestGamePointerLock();
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === container;
  if (locked) {
    // A real lock succeeded: cancel any resume-retry, make sure no stale
    // pause overlay can remain visible above the running game.
    stopResumeLockRetries();
    wasLockedBeforeUnlock = true;
    if (state.paused) {
      state.paused = false;
      pauseScreen.classList.add('hidden');
    }
    // Don't call beginGame() here — the game was already initialized via START_GAME
  } else if (wasLockedBeforeUnlock) {
    // The pointer WAS locked and just got released. This only happens from:
    //  - the user pressing Esc while playing (browser default unlock), or
    //  - our own exitPointerLock() calls (inventory/death/etc.).
    // Show the pause menu ONLY when the game was fully active beforehand;
    // every other modal path sets its own state first, and the checks below
    // prevent stacking a second pause screen over an existing one.
    wasLockedBeforeUnlock = false;
    stopResumeLockRetries();
    if (state.started && !state.paused && !state.dead && !state.inventoryOpen && !hasModalOverlayOpen()) {
      state.paused = true;
      state.keys = {};
      pauseScreen.classList.remove('hidden');
    }
  }
  // Обновляем меню паузы, чтобы синхронизировать значение чувствительности
  if (sensSliderPause) {
    sensSliderPause.value = state.mouseSensitivity;
  }
}

function onKeyDown(e) {
  // Cheat console toggle with Backquote (`~`) - works regardless of game state
  if (e.code === 'Backquote') {
    e.preventDefault();
    toggleCheatConsole();
    return;
  }
  // Handle input when cheat console is open
  if (cheatConsoleOpen) {
    if (e.code === 'Enter') {
      e.preventDefault();
      executeCheatCommand(consoleInputEl.value);
      consoleInputEl.value = '';
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      closeCheatConsole();
      return;
    }
    return; // Block other keys when console is open
  }
  if (e.code === 'KeyI') {
    e.preventDefault();
    if (state.inventoryOpen) { toggleInventory(); }
    else if (state.started && !state.dead && !state.paused && !state.inventoryOpen) { toggleInventory(); }
    return;
  }
  if (e.code === 'Escape') {
    // Escape is consumed by the browser to exit pointer lock — the pause menu
    // then opens via onPointerLockChange. If the pointer was NOT locked
    // (we are already in the pause menu, or never got a lock), Escape must
    // resume the game directly, otherwise the menu could not be closed.
    if (state.inventoryOpen) { toggleInventory(); return; }
    if (state.paused) {
      // Already paused: this Escape did NOT come from unlocking the pointer
      // (there is nothing to unlock), so it means "close the pause menu".
      // Without this check we would call exitPointerLock() first and the
      // resulting pointerlockchange event would re-open a second pause
      // screen stacked over the first one.
      e.preventDefault();
      resumeFromPause();
    }
    return;
  }
  // Обработка клавиш для активных слотов (Shift и C)
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault();
    if (isActive() && equipmentState.active1 && equipmentState.active1.use) {
      equipmentState.active1.use(state);
      updateHUD();
    }
    return;
  }
  if (e.code === 'KeyC') {
    e.preventDefault();
    if (isActive() && equipmentState.active2 && equipmentState.active2.use) {
      equipmentState.active2.use(state);
      updateHUD();
    }
    return;
  }
  if (!isActive()) return;
  if (e.code === 'Space') {
    e.preventDefault();
    // Прыжок обрабатывается в физическом цикле (updatePlayer), чтобы
    // корректно работать с bunnyhop: на приземлении фазовая проверка
    // «прыжок активен» выполняется до применения трения.
    // Здесь — мгновенный прыжок, если игрок уже на земле, и запись
    // в буфер ввода (jump-queue) для случаев точного тайинга.
    if (state.onGround) {
      doJump();
    } else if (hasInnateAbility('parkour') && state.airJumpsUsed < 1) {
      // «Parkour» — двойной прыжок: второй прыжок в воздухе.
      // Помечаем серию, чтобы при приземлении не начислялся урон от падения.
      state.airJumpsUsed++;
      state.doubleJumpActive = true;
      doJump(true);
    } else {
      state.jumpQueued = true;
    }
    // Прыжки не тратят стамину
    return;
  }
  if (e.code === 'KeyE') {
    if (state.nearestPickup) collectItem(state.nearestPickup);
    return;
  }
  state.keys[e.code] = true;
}

function onKeyUp(e) {
  state.keys[e.code] = false;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindEvents() {
  // Слушаем сообщения от iframe меню
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'START_GAME') {
      // Снимаем фокус с iframe, затем открываем экран выбора врождённой магии
      if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        document.activeElement.blur();
      }
      window.focus();
      container.focus();
      menuFrameContainer.classList.add('hidden');
      if (typeof openSchoolSelect === 'function') {
        // Игра стартует после выбора школы (openSchoolSelect -> beginGame)
        openSchoolSelect();
      } else {
        beginGame();
      }
    }
  });

  resumeBtn.addEventListener('click', () => {
    resumeFromPause();
  });

  restartBtn.addEventListener('click', () => {
    fullReset();
    menuFrameContainer.classList.remove('hidden');
    hudEl.classList.add('hidden');
    state.started = false;
  });

  respawnBtn.addEventListener('click', respawn);
  closeInventoryBtn.addEventListener('click', toggleInventory);

  const fpsToggle = document.getElementById('fps-toggle');
  fpsToggle.addEventListener('change', (e) => {
    fpsCounterEl.style.display = e.target.checked ? 'block' : 'none';
  });

  sensSliderPause.addEventListener('input', onSensitivityChange);
  fpsToggle.addEventListener('change', () => {});

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', () => console.warn('Failed to acquire pointer lock'));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', onMouseMove);
  container.addEventListener('mousedown', onMouseDown);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);
}

// ---------------------------------------------------------
// Главный цикл
// ---------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();
  updateCollectiblesAnim(dt, elapsed);
  // Chest idle animation (hover + spin) — runs even while paused
  if (typeof updateChestsAnim === 'function') updateChestsAnim(dt, elapsed);
  if (!state.started) {
    idleCameraUpdate(elapsed);
  } else if (isActive()) {
    updatePlayer(dt, elapsed);
    updateFlares(dt, elapsed);
    updateParkourShots(dt, elapsed);
    updateScorchAura(dt);
    updateScorchPulses(dt, elapsed);
    updateHandAnimation(dt);
    updateHUD();
  }
  // Update HP bars for targets
  if (targets.length > 0) {
    updateHPBars();
  }
  updateFpsCounter(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------
// Cheat Console Functions
// ---------------------------------------------------------
function toggleCheatConsole() {
  cheatConsoleOpen = !cheatConsoleOpen;
  if (cheatConsoleOpen) {
    cheatConsoleEl.classList.remove('hidden');
    consoleInputEl.focus();
    document.exitPointerLock();
  } else {
    closeCheatConsole();
  }
}

function closeCheatConsole() {
  cheatConsoleOpen = false;
  cheatConsoleEl.classList.add('hidden');
  consoleInputEl.value = '';
  requestGamePointerLock();
}

function logToConsole(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = '> ' + message;
  consoleOutputEl.appendChild(entry);
  consoleOutputEl.scrollTop = consoleOutputEl.scrollHeight;
  // Auto-remove old entries after some time
  setTimeout(() => {
    entry.remove();
  }, 5000);
}

// ---------------------------------------------------------
// Built-in "help" command: the list is built automatically
// из реестра CHEAT_COMMANDS — при добавлении новых команд
// обновлять её НЕ нужно.
// ---------------------------------------------------------
function printHelp() {
  const cmds = (typeof getCheatCommands === 'function') ? getCheatCommands() : [];
  logToConsole('═══ Available commands ═══', 'info');
  // Group by category (first-appearance order of each category)
  const byCat = new Map();
  for (const c of cmds) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }
  for (const [cat, list] of byCat) {
    logToConsole(`── ${cat} ──`, 'info');
    for (const c of list) {
      logToConsole(`  ${c.usage} — ${c.description}`, 'success');
    }
  }
  logToConsole('Total commands: ' + cmds.length, 'info');
}

function executeCheatCommand(cmd) {
  const trimmedCmd = cmd.trim().toLowerCase();
  if (!trimmedCmd) return;
  logToConsole(trimmedCmd, 'info');
  // Parse command and arguments
  const parts = trimmedCmd.split(/\s+/);
  let command = parts[0];
  const args = parts.slice(1);

  try {
    // Commands from the registry (systems/cheats.js)
    const registered = (typeof findCheatCommand === 'function') ? findCheatCommand(command) : null;
    if (registered && typeof registered.run === 'function') {
      registered.run(args, CHEAT_CTX);
      return;
    }

    // Generators like lvlup_12 (command prefix + numeric suffix)
    const underscoreIdx = command.indexOf('_');
    if (underscoreIdx > 0) {
      const baseName = command.slice(0, underscoreIdx);
      const suffix = command.slice(underscoreIdx + 1);
      const base = (typeof findCheatCommand === 'function') ? findCheatCommand(baseName) : null;
      if (base && base.kind === 'generator' && /^\d+$/.test(suffix)) {
        base.run([suffix], CHEAT_CTX);
        return;
      }
    }

    switch (command) {
      case 'help':
      case '?': {
        printHelp();
        break;
      }
      default:
        logToConsole(`Unknown command: ${command}. Type "help" for the command list.`, 'error');
    }
  } catch (err) {
    logToConsole(`Error: ${err.message}`, 'error');
  }
}

// Context passed to registry command handlers
const CHEAT_CTX = {
  game: {
    state,
    equipmentState,
    get targets() { return targets; },
    get scene() { return scene; },
    spawnTarget,
    applyInnateSchool,
    updateHUD,
    log: logToConsole,
  },
};

// ---------------------------------------------------------
// Register built-in cheat commands (registry: systems/cheats.js)
// help is not listed here: it prints the live list itself.
// Called from init() — after all data scripts are loaded.
// ---------------------------------------------------------
function registerBuiltinCheatCommands() {
  if (typeof registerCheatCommand !== 'function') return;
  registerCheatCommand({
    name: 'lvlup',
    usage: 'lvlup [N] / lvlup_N',
    description: 'Level up (N times, default 1)',
    category: 'Character',
    kind: 'generator',
    run: (args) => {
      const levels = parseInt(args[0], 10) || 1;
      for (let i = 0; i < levels; i++) {
        state.xp += state.xpToNextLevel;
        while (state.xp >= state.xpToNextLevel) {
          state.xp -= state.xpToNextLevel;
          state.level++;
          state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.5);
          state.maxHp += 20;
          state.hp = state.maxHp;
          state.maxMana += 15;
          state.mana = state.maxMana;
        }
      }
      updateHUD();
      logToConsole(`Leveled up by ${levels}. Current level: ${state.level}`, 'success');
    },
  });

  registerCheatCommand({
    name: 'rhp',
    description: 'Restore health to maximum',
    category: 'Character',
    run: () => {
      state.hp = state.maxHp;
      updateHUD();
      logToConsole('Health restored to maximum', 'success');
    },
  });

  registerCheatCommand({
    name: 'rmn',
    description: 'Restore mana to maximum',
    category: 'Character',
    run: () => {
      state.mana = state.maxMana;
      updateHUD();
      logToConsole('Mana restored to maximum', 'success');
    },
  });

  registerCheatCommand({
    name: 'rst',
    description: 'Restore health and mana to maximum',
    category: 'Character',
    run: () => {
      state.hp = state.maxHp;
      state.mana = state.maxMana;
      updateHUD();
      logToConsole('Health and mana restored to maximum', 'success');
    },
  });

  registerCheatCommand({
    name: 'spawn_bob',
    description: 'Spawn a Bob target (HP: 100, Regen: 2)',
    category: 'Targets',
    run: () => {
      spawnTarget('bob');
      logToConsole('Bob created (HP: 100, Regen: 2, Mana: 100, ManaRegen: 2)', 'success');
    },
  });

  registerCheatCommand({
    name: 'spawn_superbob',
    description: 'Spawn an immortal SuperBob target',
    category: 'Targets',
    run: () => {
      spawnTarget('superbob');
      logToConsole('Spawned SuperBob (immortal)', 'success');
    },
  });

  registerCheatCommand({
    name: 'delall_bob',
    description: 'Remove all targets',
    category: 'Targets',
    run: () => {
      let count = targets.length;
      for (const target of targets) {
        scene.remove(target.mesh);
        if (target.hpTextMesh) {
          scene.remove(target.hpTextMesh);
        }
        // Remove damage numbers
        if (target.damageNumbers) {
          for (const dn of target.damageNumbers) {
            scene.remove(dn.mesh);
          }
        }
      }
      targets.length = 0;
      logToConsole(`Targets removed: ${count}`, 'success');
    },
  });

  registerCheatCommand({
    name: 'spawn_box',
    description: 'Spawn a 1×1 m wooden crate (single jump is exactly enough to land on it)',
    category: 'Platforms',
    run: () => {
      const box = spawnJumpBox();
      if (!box) { logToConsole('Cannot spawn a box: scene not ready', 'error'); return; }
      logToConsole(`Crate spawned: ${box.width.toFixed(1)}×${box.height.toFixed(2)}×${box.depth.toFixed(1)} m (reachable with ONE jump)`, 'success');
    },
  });

  registerCheatCommand({
    name: 'spawn_bbox',
    description: 'Spawn a long 6×1 m wall-like box (requires the Parkour DOUBLE jump to get on top)',
    category: 'Platforms',
    run: () => {
      const box = spawnBigJumpBox();
      if (!box) { logToConsole('Cannot spawn a box: scene not ready', 'error'); return; }
      logToConsole(`Big box spawned: ${box.width.toFixed(1)}×${box.height.toFixed(2)}×${box.depth.toFixed(1)} m (needs the DOUBLE jump)`, 'success');
    },
  });

  registerCheatCommand({
    name: 'delall_box',
    description: 'Remove all spawned boxes/platforms',
    category: 'Platforms',
    run: () => {
      const count = boxPlatforms.length;
      while (boxPlatforms.length) removeBoxPlatform(boxPlatforms[0]);
      logToConsole(`Boxes removed: ${count}`, 'success');
    },
  });

  registerCheatCommand({
    name: 'help',
    usage: 'help / ?',
    description: 'Show the full command list (built automatically from the registry)',
    category: 'Console',
    run: () => printHelp(),
  });

  registerInnateCheatCommands();
}

// Innate schools are registered dynamically from INNATE_ABILITIES —
// adding a new school makes innate_<id> appear in help automatically.
// The function is idempotent (no duplicates) and is called:
//   1) from registerBuiltinCheatCommands() during init();
//   2) again on DOMContentLoaded / short intervals in case the data
//      scripts have not finished loading when init() runs.
function registerInnateCheatCommands() {
  if (typeof registerCheatCommand !== 'function') return false;
  const abilities =
    (typeof INNATE_ABILITIES !== 'undefined' && INNATE_ABILITIES) ||
    (typeof window !== 'undefined' && window.INNATE_ABILITIES) ||
    null;
  if (!abilities) return false;
  for (const schoolId of Object.keys(abilities)) {
    const a = abilities[schoolId];
    if (!a || !a.name) continue;
    registerCheatCommand({
      name: 'innate_' + schoolId,
      description: `Innate magic: ${a.name} (${a.description})`,
      category: 'Innate Magic',
      run: () => {
        applyInnateSchool(schoolId);
        logToConsole(`Innate magic: ${a.name}`, 'success');
      },
    });
  }
  return true;
}

// Safety net: if for some reason school data isn't available yet when
// init() runs, registration repeats until INNATE_ABILITIES appears.
// The function is idempotent — extra calls are safe (no duplicates).
function ensureInnateCheatCommandsRegistered() {
  if (registerInnateCheatCommands()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (registerInnateCheatCommands() || tries > 60) clearInterval(timer);
  }, 100);
}

// Extra safety: re-register after the page fully loads.
if (typeof document !== 'undefined') {
  window.addEventListener('load', () => registerInnateCheatCommands());
}

function spawnTarget(type) {
  // Get player position and direction
  const playerPos = camera.position.clone();
  const playerDir = new THREE.Vector3();
  camera.getWorldDirection(playerDir);
  // Spawn 3 units in front of player
  const spawnPos = playerPos.clone().add(playerDir.multiplyScalar(3));
  spawnPos.y = 1.5; // Height of target
  const isSuperBob = type === 'superbob';
  // Create target mesh
  const geometry = new THREE.BoxGeometry(1, 2, 0.5);
  const material = new THREE.MeshStandardMaterial({ 
    color: isSuperBob ? 0xff00ff : 0xff4444,
    flatShading: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(spawnPos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // Target object (no HP bar anymore, only text value)
  const target = {
    type: type,
    mesh: mesh,
    hpTextMesh: null,
    hp: 100,
    maxHp: 100,
    hpRegen: 2,
    mana: 100,
    maxMana: 100,
    manaRegen: 2,
    isImmortal: isSuperBob,
    lastRegenTime: 0,
    damageNumbers: []
  };
  // Create HP text above target
  const hpTextMesh = createHPText(`${target.hp}/${target.maxHp}`);
  hpTextMesh.position.copy(spawnPos);
  hpTextMesh.position.y += 1.3;
  scene.add(hpTextMesh);
  target.hpTextMesh = hpTextMesh;
  targets.push(target);
}

function createHPText(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 44);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.5, 0.6, 1);
  sprite.renderOrder = 1001;
  sprite.userData.currentText = text;
  return sprite;
}

function updateHPText(target) {
  if (!target.hpTextMesh) return;
  const newText = `${Math.floor(target.hp)}/${target.maxHp}`;
  const currentText = target.hpTextMesh.userData.currentText || '';
  if (newText !== currentText) {
    // Update texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(newText, 128, 44);
    target.hpTextMesh.material.map.dispose();
    target.hpTextMesh.material.map = new THREE.CanvasTexture(canvas);
    target.hpTextMesh.material.needsUpdate = true;
    target.hpTextMesh.userData.currentText = newText;
  }
  // Make HP text face camera
  target.hpTextMesh.position.copy(target.mesh.position);
  target.hpTextMesh.position.y += 1.3;
}

function updateHPBars() {
  for (const target of targets) {
    // Update HP text display
    updateHPText(target);
    // Regen
    const now = clock.getElapsedTime();
    if (now - target.lastRegenTime >= 1 && target.hp < target.maxHp) {
      target.hp = Math.min(target.maxHp, target.hp + target.hpRegen);
      target.mana = Math.min(target.maxMana, target.mana + target.manaRegen);
      target.lastRegenTime = now;
    }
    // Update damage numbers
    updateDamageNumbers(target, now);
  }
}

function showDamageNumber(target, amount) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(amount.toString(), 64, 48);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.2, 0.6, 1);
  sprite.position.copy(target.mesh.position);
  sprite.position.y += 1.5;
  sprite.renderOrder = 2000;
  scene.add(sprite);
  target.damageNumbers.push({
    mesh: sprite,
    amount: amount,
    birthTime: clock.getElapsedTime(),
    lifetime: 1.5
  });
}

function updateDamageNumbers(target, now) {
  for (let i = target.damageNumbers.length - 1; i >= 0; i--) {
    const dn = target.damageNumbers[i];
    const age = now - dn.birthTime;
    if (age >= dn.lifetime) {
      scene.remove(dn.mesh);
      dn.mesh.material.map.dispose();
      dn.mesh.material.dispose();
      target.damageNumbers.splice(i, 1);
      continue;
    }
    // Make damage number always face camera (Sprites do this automatically)
    // Move up and fade
    dn.mesh.position.y += 0.05;
    const opacity = 1 - (age / dn.lifetime);
    dn.mesh.material.opacity = opacity;
  }
}

function applyDamageToTarget(target, amount) {
  if (!target) return;
  // Show damage number immediately for both immortal and mortal targets
  showDamageNumber(target, amount);
  if (target.isImmortal) {
    return;
  }
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp <= 0) {
    // Target destroyed
    const index = targets.indexOf(target);
    if (index > -1) {
      targets.splice(index, 1);
    }
    scene.remove(target.mesh);
    if (target.hpTextMesh) {
      scene.remove(target.hpTextMesh);
    }
    // Clean up damage numbers
    for (const dn of target.damageNumbers) {
      scene.remove(dn.mesh);
    }
  }
}

// ---------------------------------------------------------
// Инициализация
// ---------------------------------------------------------
function init() {
  registerBuiltinCheatCommands();
  ensureInnateCheatCommandsRegistered();
  initScene();
  createWorld();
  createCollectibles();
  bindEvents();
  animate();
}

init();
})();
