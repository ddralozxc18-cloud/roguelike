/* =========================================================
ПУСТОШИ — низкополигональная 3D-бродилка от первого лица
Чистый Three.js (r128), без сборщиков и модулей.
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
  airWishSpeed: 0.2,          // ~30 units/sec в терминах Source (30/u_scale)
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
  gem:            { name: 'Кристалл',           icon: '◆', color: '#7dd3fc', use: null },
  potion_hp:      { name: 'Зелье здоровья',      icon: '♥', color: '#e0403a', use: (s) => { s.hp = Math.min(s.maxHp, s.hp + 35); } },
  potion_mana:    { name: 'Зелье маны',          icon: '✦', color: '#4c8dfb', use: (s) => { s.mana = Math.min(s.maxMana, s.mana + 40); } },
};

// ---------------------------------------------------------
// Состояние игрока — слоты экипировки
// ---------------------------------------------------------
const equipmentState = {
  hand: null,              // Слот руки (по умолчанию стандартная рука)
  active1: null,           // Активный слот 1 (клавиша Shift)
  active2: null,           // Активный слот 2 (клавиша C)
  passive1: null,          // Пассивный слот 1
  passive2: null,          // Пассивный слот 2
  innate: null,            // Отдельная ячейка врождённой способности (не пассивный слот)
};

// Стандартная рука по умолчанию
const DEFAULT_HAND = {
  id: 'default_hand',
  name: 'Рука',
  icon: '✊',
  damage: 1,
};

// Инициализация руки по умолчанию
equipmentState.hand = DEFAULT_HAND;

// ---------------------------------------------------------
// Получить текущий урон руки
// ---------------------------------------------------------
function getHandDamage() {
  if (equipmentState.hand && typeof equipmentState.hand.damage === 'number') {
    return equipmentState.hand.damage;
  }
  return 1; // Урон по умолчанию
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
const equipmentContainerEl = document.getElementById('equipment-container'); // ФИКС №2
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
const flares = [];
const parkourShots = []; // снаряды двойного прыжка (space)
const targets = []; // Массив мишеней bob/superbob
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
let footstepInterval = 0.5; // Интервал между шагами (будет меняться от скорости)

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
  scene.add(camera); // Добавляем камеру в сцену сразу при инициализации

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
    console.warn('Звуки ходьбы не загружены:', e);
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
  handWrapper.appendChild(createEquipmentSlot('hand', equipmentState.hand, 'Рука'));
  mainRow.appendChild(handWrapper);

  // Активные слоты (Shift и C)
  const activeSlotsContainer = document.createElement('div');
  activeSlotsContainer.className = 'active-slots-container';
  activeSlotsContainer.appendChild(
    createEquipmentSlot('active1', equipmentState.active1, 'Активный 1 (Shift)')
  );
  activeSlotsContainer.appendChild(
    createEquipmentSlot('active2', equipmentState.active2, 'Активный 2 (C)')
  );
  mainRow.appendChild(activeSlotsContainer);

  // Пассивные слоты
  const passiveSlotsContainer = document.createElement('div');
  passiveSlotsContainer.className = 'passive-slots-container';
  passiveSlotsContainer.appendChild(
    createEquipmentSlot('passive1', equipmentState.passive1, 'Пассивный 1')
  );
  passiveSlotsContainer.appendChild(
    createEquipmentSlot('passive2', equipmentState.passive2, 'Пассивный 2')
  );
  mainRow.appendChild(passiveSlotsContainer);

  // Отдельная ячейка врождённой способности (не является пассивным слотом)
  const innateSlotsContainer = document.createElement('div');
  innateSlotsContainer.className = 'innate-slots-container';
  innateSlotsContainer.appendChild(
    createEquipmentSlot('innate', equipmentState.innate, 'Врождённая способность')
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
      const usable = entry.def.use ? ' — исп.' : '';
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
  const punchProgress = Math.sin(t * Math.PI); // Плавное движение туда-обратно
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
  speed: 16,             // скорость падения снаряда (м/с)
  maxAge: 2.5,           // время жизни (сек)
  spawnDrop: CONFIG.eyeHeight * 0.5, // насколько ниже камеры появляется снаряд
  radius: 2.2,           // радиус area-урона
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
const scorchPulses = []; // визуальные импульсы ауры

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
window.gameState = state; // ссылка на состояние для UI-систем (school_select и др.)

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
    pickupPromptEl.textContent = 'E — поднять: ' + nearest.def.name;
    pickupPromptEl.classList.remove('hidden');
  } else {
    pickupPromptEl.classList.add('hidden');
  }
}

// ---------------------------------------------------------
// Игрок: движение, физика, характеристики
// ---------------------------------------------------------
function isActive() {
  // Любое модальное окно с курсором (выбор школы и т.п.) блокирует управление
  if (typeof hasModalOverlayOpen === 'function' && hasModalOverlayOpen()) return false;
  if (typeof schoolSelectIsOpen === 'function' && schoolSelectIsOpen()) return false;
  return state.started && !state.paused && !state.inventoryOpen && !state.dead && !cheatConsoleOpen;
}

// Есть ли открытое модальное окно, требующее видимого курсора
function hasModalOverlayOpen() {
  const ids = [
    'school-select-screen',
    'inventory-screen',
    'pause-screen',
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
  hpRegenEl.textContent = '+' + hpRegenDisplay.toFixed(1) + '/сек';
  manaRegenEl.textContent = '+' + manaRegenDisplay.toFixed(1) + '/сек';
  // Вертикальная физика (гравитация и приземление)
  state.velocityY += CONFIG.gravity * dt;
  let newY = camera.position.y - state.bobOffset + state.velocityY * dt;
  if (newY <= CONFIG.eyeHeight) {
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
        newY = CONFIG.eyeHeight;
      } else {
        newY = CONFIG.eyeHeight;
        state.velocityY = 0;
        state.onGround = true;
      }
      // Приземление — сбрасываем счётчик прыжков в воздухе (Parkour)
      state.airJumpsUsed = 0;
      state.doubleJumpActive = false;
    } else {
      newY = CONFIG.eyeHeight;
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

// Захват курсора для игры. Если указатель уже заблокирован другим элементом
// (или завис после экрана выбора школы), сначала освобождаем его — иначе
// requestPointerLock() молча падает с pointerlockerror и остаётся видимый
// курсор без управления камерой.
let pendingLockRetries = 0;
function requestGamePointerLock() {
  if (!isActive()) return; // открыто модальное окно (выбор школы) — не блокируем
  const pl = document.pointerLockElement;
  if (pl === container) return; // уже захвачено
  if (pl) {
    // был захват на другом элементе — дождёмся pointerlockchange и повторим
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
  // Страховка: если браузер отклонил запрос (например, из-за только что
  // снятого блока или «cooling-off» периода после выхода из блокировки),
  // повторяем несколько раз в течение секунды.
  if (document.pointerLockElement !== container && pendingLockRetries < 5) {
    pendingLockRetries++;
    setTimeout(requestGamePointerLock, 120);
  } else {
    pendingLockRetries = 0;
  }
}

// Доступ из ui-скриптов (school_select и др.)
window.requestGamePointerLock = requestGamePointerLock;

// Фолбэк: если по какой-то причине браузер не дал захватить указатель после
// выбора школы (видимый курсор, камера не крутится), клик по игровому окну
// повторно запрашивает блокировку.
container.addEventListener('click', () => {
  if (isActive() && document.pointerLockElement !== container) {
    pendingLockRetries = 0;
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
  raycaster.far = 2.5; // Ограничиваем дальность проверки луча
  const targetMeshes = targets.map(t => t.mesh);
  const intersects = raycaster.intersectObjects(targetMeshes);
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    const target = targets.find(t => t.mesh === hitMesh);
    if (target) {
      // Получаем урон от текущей руки
      let damage = getHandDamage();
      // Врождённая способность «Ambassador of Luck»: ±10% к любому урону
      if (typeof rollLuckDamage === 'function') damage = rollLuckDamage(damage);
      // Deal damage and show immediately
      applyDamageToTarget(target, damage);
    }
  }
}

// Expose checkTargetHit globally for cheat console access
window.checkTargetHit = checkTargetHit;

function onPointerLockChange() {
  const locked = document.pointerLockElement === container;
  if (locked) {
    pauseScreen.classList.add('hidden');
    state.paused = false;
    // Не вызываем beginGame() здесь, так как игра уже инициализирована через START_GAME
  } else if (state.started && !state.dead && !state.inventoryOpen && !hasModalOverlayOpen()) {
    // Не показываем паузу, пока открыто модальное окно с курсором
    // (например, выбор второй школы на 10 уровне)
    state.paused = true;
    state.keys = {};
    pauseScreen.classList.remove('hidden');
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
    if (state.inventoryOpen) toggleInventory();
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
    state.paused = false;
    requestGamePointerLock();
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
  document.addEventListener('pointerlockerror', () => console.warn('Не удалось захватить курсор'));
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
// Встроенная команда help: список строится автоматически
// из реестра CHEAT_COMMANDS — при добавлении новых команд
// обновлять её НЕ нужно.
// ---------------------------------------------------------
function printHelp() {
  const cmds = (typeof getCheatCommands === 'function') ? getCheatCommands() : [];
  logToConsole('═══ Список доступных команд ═══', 'info');
  // Группировка по категориям (порядок первого появления категории)
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
  logToConsole('Всего команд: ' + cmds.length, 'info');
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
    // Команды из реестра (systems/cheats.js)
    const registered = (typeof findCheatCommand === 'function') ? findCheatCommand(command) : null;
    if (registered && typeof registered.run === 'function') {
      registered.run(args, CHEAT_CTX);
      return;
    }

    // Генераторы вида lvlup_12 (префикс команды + числовой суффикс)
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
        logToConsole(`Неизвестная команда: ${command}. Введите "help" для списка команд.`, 'error');
    }
  } catch (err) {
    logToConsole(`Ошибка: ${err.message}`, 'error');
  }
}

// Контекст, передаваемый обработчикам команд из реестра
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
// Регистрация встроенных чит-команд (реестр — systems/cheats.js)
// help не перечисляется: она печатает актуальный список сама.
// Функция вызывается из init() — после подключения всех data-скриптов.
// ---------------------------------------------------------
function registerBuiltinCheatCommands() {
  if (typeof registerCheatCommand !== 'function') return;
  registerCheatCommand({
    name: 'lvlup',
    usage: 'lvlup [N] / lvlup_N',
    description: 'Повысить уровень (N раз, по умолчанию 1)',
    category: 'Персонаж',
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
      logToConsole(`Повышен уровень на ${levels}. Текущий уровень: ${state.level}`, 'success');
    },
  });

  registerCheatCommand({
    name: 'rhp',
    description: 'Восстановить здоровье до максимума',
    category: 'Персонаж',
    run: () => {
      state.hp = state.maxHp;
      updateHUD();
      logToConsole('Здоровье восстановлено до максимума', 'success');
    },
  });

  registerCheatCommand({
    name: 'rmn',
    description: 'Восстановить ману до максимума',
    category: 'Персонаж',
    run: () => {
      state.mana = state.maxMana;
      updateHUD();
      logToConsole('Мана восстановлена до максимума', 'success');
    },
  });

  registerCheatCommand({
    name: 'rst',
    description: 'Восстановить здоровье и ману до максимума',
    category: 'Персонаж',
    run: () => {
      state.hp = state.maxHp;
      state.mana = state.maxMana;
      updateHUD();
      logToConsole('Здоровье и мана восстановлены до максимума', 'success');
    },
  });

  registerCheatCommand({
    name: 'spawn_bob',
    description: 'Создать мишень Bob (HP: 100, Regen: 2)',
    category: 'Мишени',
    run: () => {
      spawnTarget('bob');
      logToConsole('Создан Bob (HP: 100, Regen: 2, Mana: 100, ManaRegen: 2)', 'success');
    },
  });

  registerCheatCommand({
    name: 'spawn_superbob',
    description: 'Создать бессмертную мишень SuperBob',
    category: 'Мишени',
    run: () => {
      spawnTarget('superbob');
      logToConsole('Создан SuperBob (бессмертный)', 'success');
    },
  });

  registerCheatCommand({
    name: 'delall_bob',
    description: 'Удалить все мишени',
    category: 'Мишени',
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
      logToConsole(`Удалено мишеней: ${count}`, 'success');
    },
  });

  registerCheatCommand({
    name: 'help',
    usage: 'help / ?',
    description: 'Показать весь список команд (список строится автоматически из реестра)',
    category: 'Консоль',
    run: () => printHelp(),
  });

  registerInnateCheatCommands();
}

// Врождённые школы регистрируются динамически из данных INNATE_ABILITIES —
// при добавлении новой школы команда innate_<id> появится в help сама.
// Функция идемпотентна (дубликаты не плодит) и вызывается:
//   1) из registerBuiltinCheatCommands() при init();
//   2) повторно на DOMContentLoaded / коротких интервалах — на случай,
//      если data-скрипты ещё не успели подключиться к моменту init().
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
      description: `Врождённая магия: ${a.name} (${a.description})`,
      category: 'Врождённая магия',
      run: () => {
        applyInnateSchool(schoolId);
        logToConsole(`Врождённая магия: ${a.name}`, 'success');
      },
    });
  }
  return true;
}

// Страховка: если по какой-то причине на момент init() данные школ ещё
// не доступны, регистрация повторяется до появления INNATE_ABILITIES.
// Функция идемпотентна — лишние вызовы безопасны (дубликатов не будет).
function ensureInnateCheatCommandsRegistered() {
  if (registerInnateCheatCommands()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (registerInnateCheatCommands() || tries > 60) clearInterval(timer);
  }, 100);
}

// Дополнительная страховка: перерегистрируем после полной загрузки страницы.
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
