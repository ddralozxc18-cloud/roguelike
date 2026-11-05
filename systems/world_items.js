// systems/world_items.js

const droppedItems = []; // Массив предметов, лежащих на земле

// Выбросить предмет в мир
function dropItemInWorld(item, position) {
  // Безопасно получаем сцену (так как game.js прячет её внутри себя)
  const sc = window.scene || (typeof scene !== 'undefined' ? scene : null);
  
  if (!sc) {
    console.error("dropItemInWorld: Сцена (scene) не найдена! Предмет улетел в инвентарь.");
    if (typeof window.addItemToInventory === 'function') window.addItemToInventory(item);
    return;
  }

  // Получаем цвет редкости (если RARITIES не найдено, используем белый)
  let color = '#ffffff';
  if (typeof window.RARITIES !== 'undefined' && window.RARITIES[item.rarity]) {
    color = window.RARITIES[item.rarity].color;
  }

  // Создаём визуальный меш
  const geo = new THREE.OctahedronGeometry(0.35, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.position.y = 1.0; // Парит на высоте 1 метр
  
  sc.add(mesh);

  const dropped = {
    item: item,
    mesh: mesh,
    baseY: 1.0,
    phase: Math.random() * Math.PI * 2
  };
  
  droppedItems.push(dropped);
  
  // Выводим в консоль для проверки
  console.log(`[Мир] Предмет успешно выброшен: ${item.name}`);
}

// Анимация парения (вызывать в animate)
function updateDroppedItems(dt, elapsed) {
  for (const d of droppedItems) {
    d.mesh.rotation.y += dt * 2;
    d.mesh.position.y = d.baseY + Math.sin(elapsed * 2 + d.phase) * 0.1;
  }
}

// Найти ближайший предмет на земле
function getNearestDroppedItem(pos, radius = 2.5) {
  let best = null, bestDist = radius;
  for (const d of droppedItems) {
    const dx = pos.x - d.mesh.position.x;
    const dz = pos.z - d.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

// Подобрать предмет
function pickupDroppedItem(dropped) {
  if (!dropped) return;
  
  if (typeof window.addItemToInventory === 'function') {
    window.addItemToInventory(dropped.item);
  }
  
  const sc = window.scene || (typeof scene !== 'undefined' ? scene : null);
  if (sc) sc.remove(dropped.mesh);
  
  const idx = droppedItems.indexOf(dropped);
  if (idx > -1) droppedItems.splice(idx, 1);
  
  console.log(`[Мир] Предмет подобран: ${dropped.item.name}`);
}

window.dropItemInWorld = dropItemInWorld;
window.updateDroppedItems = updateDroppedItems;
window.getNearestDroppedItem = getNearestDroppedItem;
window.pickupDroppedItem = pickupDroppedItem;