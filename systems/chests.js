// systems/chests.js
const activeChests = [];   // массив живых сундуков в сцене

// ─────────────────────────────────────────────────────
// Спавн сундука в мире
// ─────────────────────────────────────────────────────
function spawnChest(chestId, position) {
  const def = CHESTS[chestId];
  if (!def) {
    console.warn(`spawnChest: неизвестный ID сундука ${chestId}`);
    return null;
  }

  // Проверка на то, что позиция свободна (если функция есть в game.js)
  if (typeof isPositionFree === 'function' && !isPositionFree(position)) {
    return null; 
  }

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
  scene.add(mesh);

  // Добавляем легкое парение, как у предметов
  const baseY = position.y;
  
  const chest = { 
    def, 
    mesh, 
    opened: false, 
    baseY: baseY,
    phase: Math.random() * Math.PI * 2, // для анимации парения
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
    const item = rollByType(entry.type, entry.rarity, { allowHidden: false });
    if (item) loot.push({ ...item, category: entry.type });
  }

  // 2. Выдача игроку
  for (const item of loot) {
    if (item.category === 'spell') {
      // Скиллы изучаются моментально (в отличие от левелапа, где предлагается выбор)
      if (!hasSpell(item.id)) {
        learnSpell(item.id);
      } else {
        upgradeSpell(item.id); // Если уже есть — апгрейд
      }
    } else {
      // Предметы и оружие идут в инвентарь
      addItemToInventory(item);
    }
  }

  // 3. Визуальный эффект открытия (вспышка)
  if (typeof playChestOpenEffect === 'function') {
    playChestOpenEffect(chest.mesh.position, chest.def.color);
  }

  // 4. Удаление из сцены и массива
  scene.remove(chest.mesh);
  const idx = activeChests.indexOf(chest);
  if (idx > -1) activeChests.splice(idx, 1);

  // 5. Показ UI с выпавшим лутом
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
  // Веса выпадения. Секретный chest_unemployed спавнится ТОЛЬКО вручную.
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
    // Ищем свободное место (радиус 15 — чтобы не спавнить прямо под носом)
    const p = randomPointInWorld(15); 
    
    // Высота 0.3, чтобы сундук стоял на земле
    const success = spawnChest(w.id, new THREE.Vector3(p.x, 0.3, p.z));
    if (success) spawned++;
  }
}

// ─────────────────────────────────────────────────────
// Анимация сундуков (вызывается в animate() из game.js)
// ─────────────────────────────────────────────────────
function updateChestsAnim(dt, elapsed) {
  for (const chest of activeChests) {
    if (chest.opened) continue;
    
    // Мягкое парение (как у кристаллов)
    chest.mesh.position.y = chest.baseY + Math.sin(elapsed * 2 + chest.phase) * 0.05;
    
    // Медленное вращение
    chest.mesh.rotation.y += dt * 0.5;
  }
}

window.spawnChest = spawnChest;
window.openChest = openChest;
window.getNearestChest = getNearestChest;
window.spawnWorldChests = spawnWorldChests;
window.updateChestsAnim = updateChestsAnim;
window.activeChests = activeChests;
