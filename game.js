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
  maxSpeed: 4.3,
  groundAccelerate: 40,
  airWishSpeed: 0.2,
  airAccelerate: 12,
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

const ITEM_DEFS = {
  gem:            { name: 'Crystal',           icon: '◆', color: '#7dd3fc', use: null },
  potion_hp:      { name: 'Health Potion',      icon: '♥', color: '#e0403a', use: (s) => { s.hp = Math.min(s.maxHp, s.hp + 35); } },
  potion_mana:    { name: 'Mana Potion',          icon: '✦', color: '#4c8dfb', use: (s) => { s.mana = Math.min(s.maxMana, s.mana + 40); } },
};

const equipmentState = {
  hand: null,
  active1: null,
  active2: null,
  passive1: null,
  passive2: null,
  innate: null,
};

const DEFAULT_HAND = {
  id: 'default_hand',
  name: 'Hand',
  icon: '✊',
  damage: 1,
};

equipmentState.hand = DEFAULT_HAND;

function getHandDamage() {
  if (equipmentState.hand && typeof equipmentState.hand.damage === 'number') {
    return equipmentState.hand.damage;
  }
  return 1;
}

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
  velocity: { x: 0, z: 0 },
  jumpQueued: false,
  bobTimer: 0,
  bobOffset: 0,
  keys: {},
  mouseSensitivity: 1,
  nearestPickup: null,
  nearestChest: null,
  nearestDropped: null,
  inventory: {},
  gems: 0,
  innateSchool: null,
  innateAbilityId: null,
  airJumpsUsed: 0,
  doubleJumpActive: false,
  lastJumpTime: -999,
};

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
const equipmentContainerEl = document.getElementById('equipment-container');
const damageVignetteEl = document.getElementById('damage-vignette');
const fpsCounterEl = document.getElementById('fps-counter');
const cheatConsoleEl = document.getElementById('cheat-console');
const consoleInputEl = document.getElementById('console-input');
const consoleOutputEl = document.getElementById('console-output');

let scene, camera, renderer, clock;
const collectibles = [];
const obstacles = [];
const boxPlatforms = [];
const flares = [];
const parkourShots = [];
const targets = [];
let damageFlashTimeout = null;
let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;
let cheatConsoleOpen = false;

let walkSound1 = null;
let walkSound2 = null;
let walkSoundCurrent = null;
let lastFootstepTime = 0;
let footstepInterval = 0.5;

function initScene() {
  scene = new THREE.Scene();
  const skyColor = 0x8fb4d9;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 35, 155);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, CONFIG.eyeHeight, 6);
  scene.add(camera);

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
  window.clock = clock; // ВАЖНО: экспорт для внешних систем!

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
    const geo = id === 'gem' ? new THREE.OctahedronGeometry(0.32, 0) : new THREE.IcosahedronGeometry(0.3, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.55, flatShading: true, roughness: 0.35, metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, baseY, p.z);
    mesh.castShadow = true;
    scene.add(mesh);
    collectibles.push({ id, def, mesh, collected: false, baseY, phase: Math.random() * Math.PI * 2 });
  }
}

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

const PLATFORM_HEIGHT_MARGIN = 0.25;
const PLATFORM_FOOT_EYE_DELTA = CONFIG.eyeHeight;

function platformTopY(box) { return box.mesh.position.y + box.height / 2; }

function isOverPlatform(px, pz) {
  for (const b of boxPlatforms) {
    const hx = b.width / 2 + CONFIG.playerRadius * 0.5;
    const hz = b.depth / 2 + CONFIG.playerRadius * 0.5;
    if (Math.abs(px - b.x) <= hx && Math.abs(pz - b.z) <= hz) return b;
  }
  return null;
}

function resolveBoxCollisions(pos, feetY) {
  for (const b of boxPlatforms) {
    if (feetY >= platformTopY(b) - 0.05) continue;
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

function createBoxPlatform(opts) {
  if (!scene || !camera) return null;
  const width = opts.width, height = opts.height, depth = opts.depth;
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshStandardMaterial({ color: opts.color || 0x9c7b4f, flatShading: true, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
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
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3a2c1a }));
  mesh.add(edges);
  const box = { mesh, width, height, depth, x: cx, z: cz, kind: opts.kind || 'box' };
  boxPlatforms.push(box);
  return box;
}

function spawnJumpBox() {
  const singleJumpPeak = (CONFIG.jumpSpeed * CONFIG.jumpSpeed) / (2 * Math.abs(CONFIG.gravity));
  const height = Math.max(0.5, singleJumpPeak - PLATFORM_HEIGHT_MARGIN);
  return createBoxPlatform({ width: 1, height, depth: 1, kind: 'box' });
}

function spawnBigJumpBox() {
  const singleJumpPeak = (CONFIG.jumpSpeed * CONFIG.jumpSpeed) / (2 * Math.abs(CONFIG.gravity));
  const height = clamp(singleJumpPeak * 1.5, singleJumpPeak + 0.2, singleJumpPeak * 2 - 0.4);
  return createBoxPlatform({ width: 6, height, depth: 1, kind: 'bbox', color: 0x6f7f8f });
}

function removeBoxPlatform(box) {
  const idx = boxPlatforms.indexOf(box);
  if (idx !== -1) boxPlatforms.splice(idx, 1);
  scene.remove(box.mesh);
}

function updateHUD() {
  hpFillEl.style.width = (state.hp / state.maxHp * 100) + '%';
  hpValueEl.textContent = Math.ceil(state.hp) + '/' + state.maxHp;
  manaFillEl.style.width = (state.mana / state.maxMana * 100) + '%';
  manaValueEl.textContent = Math.ceil(state.mana) + '/' + state.maxMana;
  gemCountEl.textContent = state.gems;
  levelValueEl.textContent = state.level;
  xpFillEl.style.width = (state.xp / state.xpToNextLevel * 100) + '%';
  updateActiveSlotsHUD();
}

function updateActiveSlotsHUD() {
  if (equipmentState.active1) {
    hudActive1Icon.textContent = equipmentState.active1.icon || '?';
    hudActive1Icon.parentElement.classList.add('filled');
    hudActive1Icon.parentElement.style.color = equipmentState.active1.color || '#eae6da';
  } else {
    hudActive1Icon.textContent = '';
    hudActive1Icon.parentElement.classList.remove('filled');
    hudActive1Icon.parentElement.style.color = '';
  }
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
  if (!fpsToggle || !fpsToggle.checked) { fpsCounterEl.textContent = ''; return; }
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
  if (typeof rollLuckDamage === 'function') amount = rollLuckDamage(amount);
  state.hp = Math.max(0, state.hp - amount);
  state.lastDamageTime = clock.getElapsedTime();
  flashDamage();
  if (state.hp <= 0) die();
}

function addToInventory(id) {
  const def = ITEM_DEFS[id];
  if (!state.inventory[id]) state.inventory[id] = { def, count: 0 };
  state.inventory[id].count++;
  if (id === 'gem') { state.gems++; addXp(10); } 
  else { addXp(5); }
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

  const equipmentSection = document.createElement('div');
  equipmentSection.className = 'equipment-section';
  const mainRow = document.createElement('div');
  mainRow.className = 'equipment-row';

  const handWrapper = document.createElement('div');
  handWrapper.className = 'equip-slot-wrapper';
  handWrapper.appendChild(createEquipmentSlot('hand', equipmentState.hand, 'Hand'));
  mainRow.appendChild(handWrapper);

  const activeSlotsContainer = document.createElement('div');
  activeSlotsContainer.className = 'active-slots-container';
  activeSlotsContainer.appendChild(createEquipmentSlot('active1', equipmentState.active1, 'Active 1 (Shift)'));
  activeSlotsContainer.appendChild(createEquipmentSlot('active2', equipmentState.active2, 'Active 2 (C)'));
  mainRow.appendChild(activeSlotsContainer);

  const passiveSlotsContainer = document.createElement('div');
  passiveSlotsContainer.className = 'passive-slots-container';
  passiveSlotsContainer.appendChild(createEquipmentSlot('passive1', equipmentState.passive1, 'Passive 1'));
  passiveSlotsContainer.appendChild(createEquipmentSlot('passive2', equipmentState.passive2, 'Passive 2'));
  mainRow.appendChild(passiveSlotsContainer);

  const innateSlotsContainer = document.createElement('div');
  innateSlotsContainer.className = 'innate-slots-container';
  innateSlotsContainer.appendChild(createEquipmentSlot('innate', equipmentState.innate, 'Innate Ability'));
  mainRow.appendChild(innateSlotsContainer);

  equipmentSection.appendChild(mainRow);
  equipmentContainerEl.appendChild(equipmentSection);

  // Безопасная отрисовка слотов
  const order = ['gem', 'potion_hp', 'potion_mana'];
  const totalSlots = 16;
  let rendered = 0;

  for (const itemId of order) {
    if (rendered >= totalSlots) break;
    const entry = state.inventory[itemId];
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    
    if (entry && entry.count > 0 && entry.def) {
      slot.classList.add('filled');
      slot.style.color = entry.def.color;
      const usable = entry.def.use ? ' — use' : '';
      slot.innerHTML = entry.def.icon + '<span class="inv-count">' + entry.count + '</span>' + '<span class="inv-tooltip">' + entry.def.name + usable + '</span>';
      if (entry.def.use) slot.addEventListener('click', () => useItem(itemId));
    }
    inventoryGridEl.appendChild(slot);
    rendered++;
  }

  for (const uid in state.inventory) {
    if (order.includes(uid)) continue;
    if (rendered >= totalSlots) break;
    const entry = state.inventory[uid];
    if (!entry || !entry.item) continue;

    const slot = document.createElement('div');
    slot.className = 'inv-slot filled';
    slot.style.color = entry.item.color || '#eae6da';
    slot.innerHTML = (entry.item.icon || '?') + (entry.count > 1 ? '<span class="inv-count">' + entry.count + '</span>' : '') + '<span class="inv-tooltip">' + entry.item.name + '</span>';

    if (entry.item.slot === 'passive' || entry.item.type === 'trinket') {
      slot.addEventListener('click', () => {
        if (typeof equipItem === 'function') {
          equipItem(entry.item);
          if (typeof removeItemByUid === 'function') removeItemByUid(uid, 1);
          renderInventoryGrid();
        }
      });
    }
    inventoryGridEl.appendChild(slot);
    rendered++;
  }

  for (let i = rendered; i < totalSlots; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
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
    slot.innerHTML = (item.icon || '?') + '<span class="equip-tooltip">' + tip + '</span>';
    if (slotName === 'innate' || item.innate) {
      slot.classList.add('equip-slot-innate');
      slot.style.borderColor = item.color || 'var(--panel-border)';
      slot.style.boxShadow = '0 0 8px ' + (item.color || '#fff') + '55';
    }
  } else if (slotName === 'innate') {
    slot.innerHTML = '<span class="slot-empty">✧</span><span class="equip-tooltip">' + tooltipText + '</span>';
    slot.classList.add('equip-slot-innate', 'empty');
  } else {
    slot.innerHTML = '<span class="slot-empty">+</span><span class="equip-tooltip">' + tooltipText + '</span>';
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

let handMesh = null;
let isPunching = false;
let punchStartTime = 0;
let punchDuration = 0.25;

function createHand() {
  const handGroup = new THREE.Group();
  const fistGeo = new THREE.BoxGeometry(0.15, 0.12, 0.2);
  const fistMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, flatShading: true });
  const fist = new THREE.Mesh(fistGeo, fistMat);
  fist.castShadow = true;
  handGroup.add(fist);
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
  camera.add(handGroup);
  return handGroup;
}

function initHand() { if (!handMesh) handMesh = createHand(); }

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
    handMesh.position.set(0.25, -0.2, -0.4);
    handMesh.rotation.set(0.05, -0.1, 0);
    return;
  }
  const t = elapsed / punchDuration;
  const punchProgress = Math.sin(t * Math.PI);
  handMesh.position.z = -0.4 + (0.15 * punchProgress);
  handMesh.position.y = -0.2 + (0.08 * punchProgress);
  handMesh.rotation.x = 0.05 + (-0.3 * punchProgress);
  handMesh.rotation.y = -0.1 - (0.15 * punchProgress);
}

function hasInnateAbility(abilityId) {
  return !!state.innateSchool && state.innateAbilityId === abilityId;
}

function doJump(isDouble) {
  state.velocityY = CONFIG.jumpSpeed;
  state.onGround = false;
  state.jumpQueued = false;
  state.lastJumpTime = clock ? clock.getElapsedTime() : 0;
  if (isDouble) spawnParkourProjectile();
}

const PARKOUR = { speed: 16, maxAge: 2.5, spawnDrop: CONFIG.eyeHeight * 0.5, radius: 2.2 };

function spawnParkourProjectile() {
  const geo = new THREE.SphereGeometry(0.16, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(camera.position);
  mesh.position.y -= PARKOUR.spawnDrop;
  const light = new THREE.PointLight(0x8f6bff, 1.0, 6);
  mesh.add(light);
  scene.add(mesh);
  parkourShots.push({ mesh, dir: new THREE.Vector3(0, -1, 0), speed: PARKOUR.speed, born: clock.getElapsedTime(), damage: getHandDamage() * 2 });
}

function updateParkourShots(dt, elapsed) {
  for (let i = parkourShots.length - 1; i >= 0; i--) {
    const p = parkourShots[i];
    const age = elapsed - p.born;
    if (age > PARKOUR.maxAge) { scene.remove(p.mesh); parkourShots.splice(i, 1); continue; }
    p.mesh.position.addScaledVector(p.dir, p.speed * dt);
    if (p.mesh.position.y <= 0.15) { explodeParkourShot(p); scene.remove(p.mesh); parkourShots.splice(i, 1); continue; }
    for (const target of targets) {
      const dist = p.mesh.position.distanceTo(target.mesh.position);
      if (dist < 1.3) { explodeParkourShot(p); scene.remove(p.mesh); parkourShots.splice(i, 1); break; }
    }
  }
}

function explodeParkourShot(shot) {
  let dmg = shot.damage;
  if (typeof rollLuckDamage === 'function') dmg = rollLuckDamage(dmg);
  for (const target of targets.slice()) {
    const dist = shot.mesh.position.distanceTo(target.mesh.position);
    if (dist < PARKOUR.radius) applyDamageToTarget(target, Math.max(1, Math.round(dmg)));
  }
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.85 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), flashMat);
  flash.position.copy(shot.mesh.position);
  flash.position.y = Math.max(0.2, flash.position.y);
  scene.add(flash);
  scorchPulses.push({ mesh: flash, born: clock.getElapsedTime(), duration: 0.3 });
}

const SCORCH = { radius: 7, tickInterval: 0.55, baseDamagePerTick: 3 };

function getScorchParams() {
  const a = (typeof INNATE_ABILITIES !== 'undefined' && INNATE_ABILITIES.fire) || {};
  return { radius: a.radius ?? SCORCH.radius, tickInterval: a.tickInterval ?? SCORCH.tickInterval, damagePerTick: a.damagePerTick ?? SCORCH.baseDamagePerTick };
}

let scorchTickAccum = 0;
const scorchPulses = [];

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
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
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
    if (age >= p.duration) { scene.remove(p.mesh); p.mesh.material.dispose(); p.mesh.geometry.dispose(); scorchPulses.splice(i, 1); continue; }
    const t = age / p.duration;
    const s = 1 + t * 7;
    p.mesh.scale.set(s, s, s);
    p.mesh.material.opacity = 0.35 * (1 - t);
  }
}

function applyInnateSchool(schoolId) {
  const ability = INNATE_ABILITIES[schoolId];
  if (!ability) return;
  state.innateSchool = schoolId;
  state.innateAbilityId = ability.id;
  equipmentState.innate = { id: ability.id, name: ability.name, icon: ability.icon, color: ability.color, innate: true, tooltip: ability.description };
  state.airJumpsUsed = 0;
  state.doubleJumpActive = false;
  renderInventoryGrid();
  updateHUD();
}

window.applyInnateSchool = applyInnateSchool;
window.hasInnateAbility = hasInnateAbility;

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
    if (age > 1.1) { scene.remove(f.mesh); flares.splice(i, 1); continue; }
    f.mesh.position.addScaledVector(f.dir, dt * 9);
    const t = age / 1.1;
    f.mesh.material.opacity = 1 - t;
    f.light.intensity = 1.4 * (1 - t);
  }
}

function updateCollectiblesAnim(dt, elapsed) {
  for (const item of collectibles) {
    if (item.collected) continue;
    item.mesh.rotation.y += dt * 1.4;
    item.mesh.position.y = item.baseY + Math.sin(elapsed * 2 + item.phase) * 0.15;
  }
}

function updateNearestPickup() {
  // 1. Дроп с сундуков (безопасная проверка)
  if (typeof getNearestDroppedItem === 'function') {
    const dropped = getNearestDroppedItem(camera.position);
    if (dropped && dropped.item) {
      pickupPromptEl.textContent = 'E — pick up: ' + dropped.item.name;
      pickupPromptEl.classList.remove('hidden');
      state.nearestDropped = dropped;
      state.nearestChest = null;
      state.nearestPickup = null;
      return;
    }
  }
  state.nearestDropped = null;

  // 2. Сундуки
  if (typeof getNearestChest === 'function') {
    const chest = getNearestChest(camera.position);
    if (chest && chest.def) {
      pickupPromptEl.textContent = 'E — open: ' + chest.def.name;
      pickupPromptEl.classList.remove('hidden');
      state.nearestChest = chest;
      state.nearestPickup = null;
      return;
    }
  }
  state.nearestChest = null;

  // 3. Старые предметы
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

function isActive() {
  if (typeof hasModalOverlayOpen === 'function' && hasModalOverlayOpen()) return false;
  if (typeof schoolSelectIsOpen === 'function' && schoolSelectIsOpen()) return false;
  return state.started && !state.paused && !state.inventoryOpen && !state.dead && !cheatConsoleOpen;
}

function hasModalOverlayOpen() {
  const ids = ['school-select-screen', 'inventory-screen', 'death-screen', 'spell-choice-screen'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) return true;
  }
  return false;
}

function accelerate(wishdir, wishspeed, accel, deltaTime) {
  const vel = state.velocity;
  const currentspeed = vel.x * wishdir.x + vel.z * wishdir.z;
  const addspeed = wishspeed - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = accel * deltaTime * wishspeed;
  if (accelspeed > addspeed) accelspeed = addspeed;
  vel.x += wishdir.x * accelspeed;
  vel.z += wishdir.z * accelspeed;
}

function applyFriction(deltaTime) {
  const vel = state.velocity;
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.001) { vel.x = 0; vel.z = 0; return; }
  const control = Math.max(speed, CONFIG.stopSpeed);
  const frictionFactor = control * (CONFIG.friction * deltaTime);
  const drop = speed * Math.min(frictionFactor, 1);
  const retain = Math.max(0, speed - drop) / speed;
  vel.x *= retain;
  vel.z *= retain;
}

function updatePlayer(dt, elapsed) {
  if (typeof schoolSelectIsOpen === 'function' && schoolSelectIsOpen()) return;
  const forward = new THREE.Vector3(-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y));
  const right = new THREE.Vector3(Math.cos(camera.rotation.y), 0, -Math.sin(camera.rotation.y));
  let moveX = 0, moveZ = 0;
  if (state.keys['KeyW']) moveZ += 1;
  if (state.keys['KeyS']) moveZ -= 1;
  if (state.keys['KeyD']) moveX += 1;
  if (state.keys['KeyA']) moveX -= 1;
  const isMoving = moveX !== 0 || moveZ !== 0;

  let wishdirX = 0, wishdirZ = 0;
  if (isMoving) {
    wishdirX = forward.x * moveZ + right.x * moveX;
    wishdirZ = forward.z * moveZ + right.z * moveX;
    const len = Math.hypot(wishdirX, wishdirZ);
    if (len > 0.0001) { wishdirX /= len; wishdirZ /= len; }
  }
  const wishspeed = CONFIG.maxSpeed;
  const jumpHeld = !!state.keys['Space'] || state.jumpQueued;

  if (state.onGround) {
    if (jumpHeld) { doJump(); } 
    else {
      applyFriction(dt);
      if (isMoving) accelerate({ x: wishdirX, z: wishdirZ }, wishspeed, CONFIG.groundAccelerate, dt);
    }
  } else {
    if (isMoving) accelerate({ x: wishdirX, z: wishdirZ }, CONFIG.airWishSpeed, CONFIG.airAccelerate, dt);
  }

  const next = new THREE.Vector3(camera.position.x + state.velocity.x * dt, 0, camera.position.z + state.velocity.z * dt);
  resolveCollisions(next);
  resolveBoxCollisions(next, camera.position.y - state.bobOffset - CONFIG.eyeHeight);
  next.x = clamp(next.x, -CONFIG.worldBound, CONFIG.worldBound);
  next.z = clamp(next.z, -CONFIG.worldBound, CONFIG.worldBound);

  const expectedX = camera.position.x + state.velocity.x * dt;
  const expectedZ = camera.position.z + state.velocity.z * dt;
  if (Math.abs(next.x - expectedX) > 1e-6) state.velocity.x = 0;
  if (Math.abs(next.z - expectedZ) > 1e-6) state.velocity.z = 0;
  camera.position.x = next.x;
  camera.position.z = next.z;

  state.mana = Math.min(state.maxMana, state.mana + CONFIG.manaRegenRate * dt);
  if (elapsed - state.lastDamageTime > CONFIG.hpRegenDelay) {
    state.hp = Math.min(state.maxHp, state.hp + CONFIG.hpRegenRate * dt);
  }
  
  const hpRegenDisplay = (elapsed - state.lastDamageTime > CONFIG.hpRegenDelay) ? CONFIG.hpRegenRate : 0;
  hpRegenEl.textContent = '+' + hpRegenDisplay.toFixed(1) + '/s';
  manaRegenEl.textContent = '+' + CONFIG.manaRegenRate.toFixed(1) + '/sec';

  state.velocityY += CONFIG.gravity * dt;
  let newY = camera.position.y - state.bobOffset + state.velocityY * dt;
  const supportTop = isOverPlatform(camera.position.x, camera.position.z);
  const feetNow = camera.position.y - state.bobOffset - CONFIG.eyeHeight;
  let surfaceY = 0;

  if (supportTop && state.velocityY >= 0) {
    if (feetNow < platformTopY(supportTop) - 0.05 && newY - CONFIG.eyeHeight > platformTopY(supportTop)) {
      newY = platformTopY(supportTop) + CONFIG.eyeHeight;
      state.velocityY = Math.min(state.velocityY, 0);
    }
  }

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
      if (impact > CONFIG.fallDamageThreshold && !state.doubleJumpActive) {
        applyDamage((impact - CONFIG.fallDamageThreshold) * CONFIG.fallDamageMultiplier);
      }
      if (jumpHeld && impact <= CONFIG.fallDamageThreshold) {
        doJump(); state.onGround = true; newY = surfaceEye;
      } else {
        newY = surfaceEye; state.velocityY = 0; state.onGround = true;
      }
      state.airJumpsUsed = 0;
      state.doubleJumpActive = false;
    } else {
      newY = surfaceEye; state.velocityY = 0; state.onGround = true; state.airJumpsUsed = 0; state.doubleJumpActive = false;
    }
  } else { state.onGround = false; }

  const horizSpeed = Math.hypot(state.velocity.x, state.velocity.z);
  if (state.onGround && isMoving) {
    state.bobTimer += dt * 8.4 * clamp(horizSpeed / CONFIG.maxSpeed, 0.3, 2);
    state.bobOffset = Math.sin(state.bobTimer) * 0.05;
    const stepInterval = 0.5;
    if (elapsed - lastFootstepTime > stepInterval) { lastFootstepTime = elapsed; playFootstep(); }
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

function playFootstep() {
  if (!walkSound1 || !walkSound2) return;
  if (walkSoundCurrent && !walkSoundCurrent.paused) { walkSoundCurrent.pause(); walkSoundCurrent.currentTime = 0; }
  walkSoundCurrent = (walkSoundCurrent === walkSound1) ? walkSound2 : walkSound1;
  walkSoundCurrent.currentTime = 0;
  walkSoundCurrent.play().catch(() => {});
}

function resetPlayerPosition() {
  camera.position.set(0, CONFIG.eyeHeight, 6);
  camera.rotation.set(0, 0, 0);
  state.velocityY = 0; state.velocity.x = 0; state.velocity.z = 0; state.jumpQueued = false;
  state.onGround = true; state.bobOffset = 0; state.bobTimer = 0; state.keys = {};
}

function beginGame() {
  state.started = true; state.paused = false; state.dead = false;
  menuFrameContainer.classList.add('hidden');
  hudEl.classList.remove('hidden');
  resetPlayerPosition();
  if (typeof recalcStats === 'function') recalcStats();
  updateHUD(); renderInventoryGrid(); initHand();
  if (document.activeElement && document.activeElement.tagName === 'IFRAME') document.activeElement.blur();
  window.focus(); container.focus();
  requestGamePointerLock();
}

function requestGamePointerLock() {
  if (!isActive()) return;
  const pl = document.pointerLockElement;
  if (pl === container) return;
  if (pl) { document.exitPointerLock(); setTimeout(requestGamePointerLock, 60); return; }
  try { const res = container.requestPointerLock(); if (res && typeof res.catch === 'function') res.catch(() => {}); } catch (err) {}
}
window.requestGamePointerLock = requestGamePointerLock;

let wasLockedBeforeUnlock = false;
let resumeLockTimer = null;

function stopResumeLockRetries() { if (resumeLockTimer) { clearInterval(resumeLockTimer); resumeLockTimer = null; } }

setInterval(() => {
  if (document.pointerLockElement === container) return;
  if (!isActive()) return;
  requestGamePointerLock();
}, 500);

container.addEventListener('click', () => {
  if (isActive() && document.pointerLockElement !== container) requestGamePointerLock();
});

function die() {
  state.dead = true; state.keys = {};
  document.exitPointerLock();
  deathScreen.classList.remove('hidden');
}

function respawn() {
  state.hp = state.maxHp; state.mana = state.maxMana; state.lastDamageTime = -999;
  resetPlayerPosition(); state.dead = false;
  deathScreen.classList.add('hidden'); updateHUD();
  if (!handMesh) initHand();
  requestGamePointerLock();
}

function fullReset() {
  state.hp = 100; state.maxHp = 100; state.mana = 100; state.maxMana = 100;
  state.level = 1; state.xp = 0; state.xpToNextLevel = 100;
  state.inventory = {}; state.gems = 0; state.lastDamageTime = -999;
  equipmentState.hand = DEFAULT_HAND; equipmentState.active1 = null; equipmentState.active2 = null;
  equipmentState.passive1 = null; equipmentState.passive2 = null; equipmentState.innate = null;
  state.innateSchool = null; state.innateAbilityId = null;
  state.airJumpsUsed = 0; state.doubleJumpActive = false;
  for (const p of parkourShots) scene.remove(p.mesh); parkourShots.length = 0;
  for (const p of scorchPulses) scene.remove(p.mesh); scorchPulses.length = 0;
  while (boxPlatforms.length) removeBoxPlatform(boxPlatforms[0]);
  if (typeof activeChests !== 'undefined') { for (const c of activeChests) scene.remove(c.mesh); activeChests.length = 0; }
  collectibles.forEach((c) => { c.collected = false; c.mesh.visible = true; });
  resetPlayerPosition(); state.dead = false; state.paused = false;
  deathScreen.classList.add('hidden'); pauseScreen.classList.add('hidden'); menuFrameContainer.classList.add('hidden');
  hudEl.classList.remove('hidden'); updateHUD(); renderInventoryGrid();
  if (!handMesh) initHand();
  requestGamePointerLock();
}

function toggleInventory() {
  state.inventoryOpen = !state.inventoryOpen;
  if (state.inventoryOpen) {
    state.keys = {}; renderInventoryGrid(); inventoryScreen.classList.remove('hidden'); document.exitPointerLock();
  } else {
    inventoryScreen.classList.add('hidden'); requestGamePointerLock();
    if (!handMesh) initHand();
  }
  if (typeof window.syncStatsInventoryPanel === 'function') window.syncStatsInventoryPanel();
}

function onSensitivityChange(e) { state.mouseSensitivity = parseFloat(e.target.value); sensSliderPause.value = state.mouseSensitivity; }

function onMouseMove(e) {
  if (document.pointerLockElement !== container || !isActive()) return;
  const sens = 0.0022 * state.mouseSensitivity;
  camera.rotation.y -= e.movementX * sens;
  camera.rotation.x -= e.movementY * sens;
  camera.rotation.x = clamp(camera.rotation.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
}

function onMouseDown(e) {
  if (e.button === 2 && document.pointerLockElement === container && isActive()) castFlare();
  if (e.button === 0 && isActive()) { startPunch(); checkTargetHit(); }
}

function checkTargetHit() {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 2.5;
  const targetMeshes = targets.map(t => t.mesh);
  const intersects = raycaster.intersectObjects(targetMeshes);
  if (intersects.length > 0) {
    const target = targets.find(t => t.mesh === intersects[0].object);
    if (target) {
      let damage = getHandDamage();
      if (typeof rollLuckDamage === 'function') damage = rollLuckDamage(damage);
      applyDamageToTarget(target, damage);
    }
  }
}
window.checkTargetHit = checkTargetHit;

function resumeFromPause() {
  if (!state.paused && pauseScreen.classList.contains('hidden')) return;
  stopResumeLockRetries();
  state.paused = false; state.keys = {}; pauseScreen.classList.add('hidden'); wasLockedBeforeUnlock = false;
  let attempts = 0;
  resumeLockTimer = setInterval(() => {
    if (document.pointerLockElement === container || !state.started || state.paused || state.dead || state.inventoryOpen || hasModalOverlayOpen()) { stopResumeLockRetries(); return; }
    requestGamePointerLock();
    if (++attempts > 8) stopResumeLockRetries();
  }, 250);
  requestGamePointerLock();
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === container;
  if (locked) {
    stopResumeLockRetries(); wasLockedBeforeUnlock = true;
    if (state.paused) { state.paused = false; pauseScreen.classList.add('hidden'); }
  } else if (wasLockedBeforeUnlock) {
    wasLockedBeforeUnlock = false; stopResumeLockRetries();
    if (state.started && !state.paused && !state.dead && !state.inventoryOpen && !hasModalOverlayOpen()) {
      state.paused = true; state.keys = {}; pauseScreen.classList.remove('hidden');
    }
  }
  if (sensSliderPause) sensSliderPause.value = state.mouseSensitivity;
}

function onKeyDown(e) {
  if (e.code === 'Backquote') { e.preventDefault(); toggleCheatConsole(); return; }
  if (cheatConsoleOpen) {
    if (e.code === 'Enter') { e.preventDefault(); executeCheatCommand(consoleInputEl.value); consoleInputEl.value = ''; return; }
    if (e.code === 'Escape') { e.preventDefault(); closeCheatConsole(); return; }
    return;
  }
  if (e.code === 'KeyI') {
    e.preventDefault();
    if (state.inventoryOpen) toggleInventory();
    else if (state.started && !state.dead && !state.paused && !state.inventoryOpen) toggleInventory();
    return;
  }
  if (e.code === 'Escape') {
    if (state.inventoryOpen) { toggleInventory(); return; }
    if (state.paused) { e.preventDefault(); resumeFromPause(); }
    return;
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault();
    if (isActive() && equipmentState.active1 && equipmentState.active1.use) { equipmentState.active1.use(state); updateHUD(); }
    return;
  }
  if (e.code === 'KeyC') {
    e.preventDefault();
    if (isActive() && equipmentState.active2 && equipmentState.active2.use) { equipmentState.active2.use(state); updateHUD(); }
    return;
  }
  if (!isActive()) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.onGround) doJump();
    else if (hasInnateAbility('parkour') && state.airJumpsUsed < 1) { state.airJumpsUsed++; state.doubleJumpActive = true; doJump(true); } 
    else state.jumpQueued = true;
    return;
  }
  if (e.code === 'KeyE') {
    if (state.nearestChest && typeof openChest === 'function') { openChest(state.nearestChest); state.nearestChest = null; return; }
    if (state.nearestDropped && typeof pickupDroppedItem === 'function') { pickupDroppedItem(state.nearestDropped); state.nearestDropped = null; return; }
    if (state.nearestPickup) { collectItem(state.nearestPickup); return; }
    return;
  }
  state.keys[e.code] = true;
}

function onKeyUp(e) { state.keys[e.code] = false; }

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindEvents() {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'START_GAME') {
      if (document.activeElement && document.activeElement.tagName === 'IFRAME') document.activeElement.blur();
      window.focus(); container.focus(); menuFrameContainer.classList.add('hidden');
      if (typeof openSchoolSelect === 'function') openSchoolSelect();
      else beginGame();
    }
  });

  resumeBtn.addEventListener('click', resumeFromPause);
  restartBtn.addEventListener('click', () => {
    fullReset(); menuFrameContainer.classList.remove('hidden'); hudEl.classList.add('hidden'); state.started = false;
  });
  respawnBtn.addEventListener('click', respawn);
  closeInventoryBtn.addEventListener('click', toggleInventory);
  fpsToggle.addEventListener('change', (e) => { fpsCounterEl.style.display = e.target.checked ? 'block' : 'none'; });
  sensSliderPause.addEventListener('input', onSensitivityChange);
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
// Главный цикл с защитой от вылетов
// ---------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  try {
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.getElapsedTime();
    
    if (typeof updateCollectiblesAnim === 'function') updateCollectiblesAnim(dt, elapsed);
    if (typeof updateChestsAnim === 'function') updateChestsAnim(dt, elapsed);
    
    if (!state.started) {
      idleCameraUpdate(elapsed);
    } else if (isActive()) {
      updatePlayer(dt, elapsed);
      if (typeof updateFlares === 'function') updateFlares(dt, elapsed);
      if (typeof updateParkourShots === 'function') updateParkourShots(dt, elapsed);
      if (typeof updateScorchAura === 'function') updateScorchAura(dt);
      if (typeof updateScorchPulses === 'function') updateScorchPulses(dt, elapsed);
      if (typeof updateHandAnimation === 'function') updateHandAnimation(dt);
      updateHUD();

      // Защищенные вызовы новых систем
      if (typeof updateStatusEffects === 'function') updateStatusEffects(dt, elapsed);
      if (typeof updateSpellCooldowns === 'function') updateSpellCooldowns(dt);
      if (typeof updateAttackCooldown === 'function') updateAttackCooldown(dt);
      if (typeof tickPassiveItems === 'function') tickPassiveItems(dt);
      if (typeof updateDroppedItems === 'function') updateDroppedItems(dt, elapsed);
    }
    
    if (targets.length > 0) updateHPBars();
    updateFpsCounter(dt);
    
    renderer.render(scene, camera);
  } catch (error) {
    console.error('Ошибка в игровом цикле:', error);
    // Принудительный рендер, чтобы экран не застывал
    renderer.render(scene, camera);
  }
}

function toggleCheatConsole() {
  cheatConsoleOpen = !cheatConsoleOpen;
  if (cheatConsoleOpen) { cheatConsoleEl.classList.remove('hidden'); consoleInputEl.focus(); document.exitPointerLock(); } 
  else closeCheatConsole();
}

function closeCheatConsole() {
  cheatConsoleOpen = false; cheatConsoleEl.classList.add('hidden'); consoleInputEl.value = '';
  requestGamePointerLock();
}

function logToConsole(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = '> ' + message;
  consoleOutputEl.appendChild(entry);
  consoleOutputEl.scrollTop = consoleOutputEl.scrollHeight;
  setTimeout(() => { entry.remove(); }, 5000);
}

function printHelp() {
  const cmds = (typeof getCheatCommands === 'function') ? getCheatCommands() : [];
  logToConsole('═══ Available commands ═══', 'info');
  const byCat = new Map();
  for (const c of cmds) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }
  for (const [cat, list] of byCat) {
    logToConsole(`── ${cat} ──`, 'info');
    for (const c of list) logToConsole(`  ${c.usage} — ${c.description}`, 'success');
  }
  logToConsole('Total commands: ' + cmds.length, 'info');
}

function executeCheatCommand(cmd) {
  const trimmedCmd = cmd.trim().toLowerCase();
  if (!trimmedCmd) return;
  logToConsole(trimmedCmd, 'info');
  const parts = trimmedCmd.split(/\s+/);
  let command = parts[0];
  const args = parts.slice(1);
  try {
    const registered = (typeof findCheatCommand === 'function') ? findCheatCommand(command) : null;
    if (registered && typeof registered.run === 'function') { registered.run(args, CHEAT_CTX); return; }
    const underscoreIdx = command.indexOf('_');
    if (underscoreIdx > 0) {
      const baseName = command.slice(0, underscoreIdx);
      const suffix = command.slice(underscoreIdx + 1);
      const base = (typeof findCheatCommand === 'function') ? findCheatCommand(baseName) : null;
      if (base && base.kind === 'generator' && /^\d+$/.test(suffix)) { base.run([suffix], CHEAT_CTX); return; }
    }
    switch (command) {
      case 'help': case '?': printHelp(); break;
      default: logToConsole(`Unknown command: ${command}. Type "help"`, 'error');
    }
  } catch (err) { logToConsole(`Error: ${err.message}`, 'error'); }
}

const CHEAT_CTX = {
  game: {
    state, equipmentState,
    get targets() { return targets; },
    get scene() { return scene; },
    spawnTarget, applyInnateSchool, updateHUD, log: logToConsole,
  },
};

function registerBuiltinCheatCommands() {
  if (typeof registerCheatCommand !== 'function') return;
  registerCheatCommand({ name: 'lvlup', usage: 'lvlup [N]', description: 'Level up', category: 'Character', kind: 'generator', run: (args) => {
    const levels = parseInt(args[0], 10) || 1;
    for (let i = 0; i < levels; i++) {
      state.xp += state.xpToNextLevel;
      while (state.xp >= state.xpToNextLevel) {
        state.xp -= state.xpToNextLevel; state.level++; state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.5);
        state.maxHp += 20; state.hp = state.maxHp; state.maxMana += 15; state.mana = state.maxMana;
      }
    }
    updateHUD(); logToConsole(`Leveled up to ${state.level}`, 'success');
  }});
  registerCheatCommand({ name: 'rhp', description: 'Restore health', category: 'Character', run: () => { state.hp = state.maxHp; updateHUD(); } });
  registerCheatCommand({ name: 'rmn', description: 'Restore mana', category: 'Character', run: () => { state.mana = state.maxMana; updateHUD(); } });
  registerCheatCommand({ name: 'rst', description: 'Restore all', category: 'Character', run: () => { state.hp = state.maxHp; state.mana = state.maxMana; updateHUD(); } });
  registerCheatCommand({ name: 'spawn_bob', description: 'Spawn target', category: 'Targets', run: () => { spawnTarget('bob'); } });
  registerCheatCommand({ name: 'spawn_superbob', description: 'Spawn immortal target', category: 'Targets', run: () => { spawnTarget('superbob'); } });
  registerCheatCommand({ name: 'delall_bob', description: 'Remove targets', category: 'Targets', run: () => { for (const t of targets) scene.remove(t.mesh); targets.length = 0; } });
  registerCheatCommand({ name: 'spawn_box', description: 'Spawn box', category: 'Platforms', run: () => { spawnJumpBox(); } });
  registerCheatCommand({ name: 'spawn_bbox', description: 'Spawn big box', category: 'Platforms', run: () => { spawnBigJumpBox(); } });
  registerCheatCommand({ name: 'delall_box', description: 'Remove boxes', category: 'Platforms', run: () => { while (boxPlatforms.length) removeBoxPlatform(boxPlatforms[0]); } });
  registerCheatCommand({ name: 'help', description: 'Show commands', category: 'Console', run: printHelp });
  registerInnateCheatCommands();
}

function registerInnateCheatCommands() {
  if (typeof registerCheatCommand !== 'function') return false;
  const abilities = (typeof INNATE_ABILITIES !== 'undefined' && INNATE_ABILITIES) || (typeof window !== 'undefined' && window.INNATE_ABILITIES) || null;
  if (!abilities) return false;
  for (const schoolId of Object.keys(abilities)) {
    const a = abilities[schoolId];
    if (!a || !a.name) continue;
    registerCheatCommand({ name: 'innate_' + schoolId, description: `Innate: ${a.name}`, category: 'Innate Magic', run: () => { applyInnateSchool(schoolId); } });
  }
  return true;
}

function ensureInnateCheatCommandsRegistered() {
  if (registerInnateCheatCommands()) return;
  let tries = 0;
  const timer = setInterval(() => { tries++; if (registerInnateCheatCommands() || tries > 60) clearInterval(timer); }, 100);
}
if (typeof document !== 'undefined') window.addEventListener('load', () => registerInnateCheatCommands());

function spawnTarget(type) {
  const playerDir = new THREE.Vector3(); camera.getWorldDirection(playerDir);
  const spawnPos = camera.position.clone().add(playerDir.multiplyScalar(3));
  spawnPos.y = 1.5;
  const geometry = new THREE.BoxGeometry(1, 2, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: type === 'superbob' ? 0xff00ff : 0xff4444, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(spawnPos); mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const target = { type, mesh, hpTextMesh: null, hp: 100, maxHp: 100, hpRegen: 2, mana: 100, maxMana: 100, manaRegen: 2, isImmortal: type === 'superbob', lastRegenTime: 0, damageNumbers: [] };
  const hpTextMesh = createHPText(`${target.hp}/${target.maxHp}`);
  hpTextMesh.position.copy(spawnPos); hpTextMesh.position.y += 1.3;
  scene.add(hpTextMesh); target.hpTextMesh = hpTextMesh; targets.push(target);
}

function createHPText(text) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 44);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(material); sprite.scale.set(1.5, 0.6, 1); sprite.renderOrder = 1001; sprite.userData.currentText = text; return sprite;
}

function updateHPText(target) {
  if (!target.hpTextMesh) return;
  const newText = `${Math.floor(target.hp)}/${target.maxHp}`;
  if (newText !== target.hpTextMesh.userData.currentText) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center'; ctx.fillText(newText, 128, 44);
    target.hpTextMesh.material.map.dispose(); target.hpTextMesh.material.map = new THREE.CanvasTexture(canvas); target.hpTextMesh.material.needsUpdate = true; target.hpTextMesh.userData.currentText = newText;
  }
  target.hpTextMesh.position.copy(target.mesh.position); target.hpTextMesh.position.y += 1.3;
}

function updateHPBars() {
  for (const target of targets) {
    updateHPText(target);
    const now = clock.getElapsedTime();
    if (now - target.lastRegenTime >= 1 && target.hp < target.maxHp) {
      target.hp = Math.min(target.maxHp, target.hp + target.hpRegen);
      target.mana = Math.min(target.maxMana, target.mana + target.manaRegen);
      target.lastRegenTime = now;
    }
    updateDamageNumbers(target, now);
  }
}

function showDamageNumber(target, amount) {
  if (!target || !target.mesh) return;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ff0000'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.fillText(amount.toString(), 64, 48);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(material); sprite.scale.set(1.2, 0.6, 1); sprite.position.copy(target.mesh.position); sprite.position.y += 1.5; sprite.renderOrder = 2000; scene.add(sprite);
  target.damageNumbers.push({ mesh: sprite, amount: amount, birthTime: clock.getElapsedTime(), lifetime: 1.5 });
}

function updateDamageNumbers(target, now) {
  for (let i = target.damageNumbers.length - 1; i >= 0; i--) {
    const dn = target.damageNumbers[i];
    const age = now - dn.birthTime;
    if (age >= dn.lifetime) { scene.remove(dn.mesh); dn.mesh.material.map.dispose(); dn.mesh.material.dispose(); target.damageNumbers.splice(i, 1); continue; }
    dn.mesh.position.y += 0.05;
    dn.mesh.material.opacity = 1 - (age / dn.lifetime);
  }
}

function applyDamageToTarget(target, amount) {
  if (!target) return;
  showDamageNumber(target, amount);
  if (target.isImmortal) return;
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp <= 0) {
    const index = targets.indexOf(target);
    if (index > -1) targets.splice(index, 1);
    scene.remove(target.mesh);
    if (target.hpTextMesh) scene.remove(target.hpTextMesh);
    for (const dn of target.damageNumbers) scene.remove(dn.mesh);
  }
}

function init() {
  registerBuiltinCheatCommands();
  ensureInnateCheatCommandsRegistered();
  if (typeof registerChestCheatCommands === 'function') registerChestCheatCommands();
  initScene();
  createWorld();
  createCollectibles();
  bindEvents();
  animate();
}

// ---------------------------------------------------------
// Экспорт переменных для внешних систем (systems/*)
// ---------------------------------------------------------
window.state = state;
window.equipmentState = equipmentState;
window.updateHUD = updateHUD;
window.updateActiveSlotsHUD = updateActiveSlotsHUD;
window.renderInventoryGrid = renderInventoryGrid;
window.updateInventoryUI = renderInventoryGrid;
window.recalcStats = recalcStats;
window.beginGame = beginGame;
window.gameState = state;

init();
})();