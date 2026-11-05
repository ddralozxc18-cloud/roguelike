// systems/chest_entities.js
const activeChests = [];   // массив живых сундуков в сцене

// ─────────────────────────────────────────────────────
// Спавн сундука в мире
// ─────────────────────────────────────────────────────
function spawnChest(chestId, position, targetScene) {
  const def = CHESTS[chestId];
  if (!def) {
    console.warn(`spawnChest: unknown chest ID ${chestId}`);
    return null;
  }

  // Scene: passed explicitly (cheat commands) or global from game.js
  const sc = targetScene || (typeof scene !== 'undefined' ? scene : null);
  if (!sc) {
    console.warn('spawnChest: scene is not ready');
    return null;
  }

  // Проверка на то, что позиция свободна (если функция есть в game.js)
  if (typeof isPositionFree === 'function' && !isPositionFree(position)) {
    return null; 
  }

  // В CHESTS цвет теперь может быть строкой (#7a7a7a) или числом (0x7a7a7a).
  // Three.js MeshStandardMaterial отлично понимает оба варианта.
  const geo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    emissive: def.color,
    emissiveIntensity: def.rarity === 'unemployed' ? 0.8 : 0.15,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  sc.add(mesh);

  const chest = { 
    def, 
    mesh, 
    opened: false, 
    position: position.clone() 
  };
  
  activeChests.push(chest);
  return chest;
}

// ─────────────────────────────────────────────────────
// Открытие сундука
// ─────────────────────────────────────────────────────
function openChest(chest) {
  if (!chest || chest.opened) return [];
  chest.opened = true;

  // 1. Ролл лута по таблице
  const loot = [];
  for (let i = 0; i < chest.def.lootRolls; i++) {
    const entry = weightedPick(chest.def.lootTable, e => e.weight);
    
    let item = null;
    
    // Если в таблице указан конкретный ID (например, для Bookmaker banner)
    if (entry.id && typeof ITEMS_DB !== 'undefined' && ITEMS_DB[entry.id]) {
      item = instantiate(entry.id, 'item');
    } else {
      // Иначе роллим случайный предмет нужной редкости
      item = rollByType(entry.type, entry.rarity, { allowHidden: false });
    }
    
    if (item) loot.push({ ...item, category: entry.type });
  }

  // 2. Выдача лута (выбрасываем на землю!)
  let dropOffset = 0.8; // Чтобы предметы не спавнились прямо в центре сундука
  for (const item of loot) {
    if (item.category === 'spell') {
      // Скиллы изучаются моментально
      if (!hasSpell(item.id)) {
        learnSpell(item.id);
      } else {
        upgradeSpell(item.id);
      }
    } else {
      // Предметы и оружие выбрасываются как физические объекты
      const dropPos = chest.mesh.position.clone();
      dropPos.x += dropOffset;
      dropOffset *= -1; // Чередуем смещение влево/вправо
      
      if (typeof dropItemInWorld === 'function') {
        dropItemInWorld(item, dropPos);
      } else {
        // Фоллбек, если world_items.js не подключен
        addItemToInventory(item);
      }
    }
  }

  // 3. Визуальный эффект открытия (вспышка)
  if (typeof playChestOpenEffect === 'function') {
    playChestOpenEffect(chest.mesh.position, chest.def.color);
  }

  // 4. Удаление из сцены и массива
  (typeof scene !== "undefined" ? scene : chest.mesh.parent).remove(chest.mesh);
  const idx = activeChests.indexOf(chest);
  if (idx > -1) activeChests.splice(idx, 1);

  // 5. Показ UI (если нужно показать всплывашку)
  if (typeof showLootPopup === 'function') {
    showLootPopup(loot);
  }

  return loot;
}

// ─────────────────────────────────────────────────────
// Поиск ближайшего сундука (для подсказки "E — открыть")
// ─────────────────────────────────────────────────────
function getNearestChest(pos, radius = 2.5) {
  let best = null, bestDist = radius;
  for (const c of activeChests) {
    if (c.opened) continue;
    const dx = pos.x - c.position.x;
    const dz = pos.z - c.position.z;
    const d = Math.hypot(dx, dz);
    if (d < bestDist) { 
      bestDist = d; 
      best = c; 
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────
// Спавн сундуков по всему миру
// ─────────────────────────────────────────────────────
function spawnWorldChests() {
  const weights = [
    { id: 'chest_trash',      weight: 50 },
    { id: 'chest_common',     weight: 30 },
    { id: 'chest_rare',       weight: 12 },
    { id: 'chest_mythical',   weight: 3 },
  ];
  
  let spawned = 0;
  let attempts = 0;
  
  while (spawned < 25 && attempts < 100) {
    attempts++;
    const w = weightedPick(weights, c => c.weight);
    const p = randomPointInWorld(15); 
    const success = spawnChest(w.id, new THREE.Vector3(p.x, 0.3, p.z));
    if (success) spawned++;
  }
}

// ─────────────────────────────────────────────────────
// Анимация сундуков (отключена, они статичны)
// ─────────────────────────────────────────────────────
function updateChestsAnim(dt, elapsed) {
  // Сундуки статичны, но вызов в game.js оставлен для совместимости.
}

// Экспорт
window.spawnChest = spawnChest;
window.openChest = openChest;
window.getNearestChest = getNearestChest;
window.spawnWorldChests = spawnWorldChests;
window.updateChestsAnim = updateChestsAnim;
window.activeChests = activeChests;

// ─────────────────────────────────────────────────────
// Чит-команды для спавна сундуков
// ─────────────────────────────────────────────────────
const CHEST_CHEAT_DEFS = [
  ['chest_trash', 'gray'],
  ['chest_common', 'white'],
  ['chest_rare', 'blue'],
  ['chest_mythical', 'purple'],
  ['chest_unemployed', 'black'],
];

function registerChestCheatCommands() {
  if (typeof registerCheatCommand !== 'function') return false;

  for (const [id, colorName] of CHEST_CHEAT_DEFS) {
    registerCheatCommand({
      name: id,
      usage: id,
      description: `Spawn a ${colorName} ${CHESTS[id].name} 3 m ahead of the player`,
      category: 'Chests',
      run: () => {
        const sc = (typeof scene !== 'undefined' && scene) ? scene : window.scene;
        const cam = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
        const log = typeof logToConsole === 'function' ? logToConsole
                  : (typeof window.logToConsole === 'function' ? window.logToConsole : null);
        if (!sc || !cam) {
          if (log) log('Cannot spawn a chest: scene not ready', 'error');
          return;
        }
        
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        dir.y = 0;
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
        dir.normalize();
        const pos = cam.position.clone().addScaledVector(dir, 3);
        pos.y = 0.3;

        const chest = spawnChest(id, pos, sc);
        if (chest && log) {
          log(`${CHESTS[id].name} spawned (${colorName})`, 'success');
        } else if (!chest && log) {
          log(`Cannot spawn ${id}`, 'error');
        }
      },
    });
  }
  return true;
}

window.registerChestCheatCommands = registerChestCheatCommands;