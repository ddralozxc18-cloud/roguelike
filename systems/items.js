// systems/items.js

// ─────────────────────────────────────────────────────
// Доступ к глобальным объектам игры
// (они экспортируются из game.js: window.state, window.equipmentState)
// ─────────────────────────────────────────────────────
function getInventory() {
  return window.state ? window.state.inventory : {};
}

function addItemToInventory(item, count = 1) {
  const inventory = getInventory();
  
  if (item.stackable) {
    // Ищем существующий стак того же id
    for (const uid in inventory) {
      const slot = inventory[uid];
      // Проверка, что item не null (защита от пустых ячеек)
      if (slot && slot.item && slot.item.id === item.id && slot.count < (item.maxStack || 1)) {
        const space = (item.maxStack || 1) - slot.count;
        const toAdd = Math.min(space, count);
        slot.count += toAdd;
        count -= toAdd;
        if (count <= 0) { 
          window.updateInventoryUI?.(); 
          return uid; 
        }
      }
    }
  }
  
  // Новый слот
  const uid = item.uid || (item.id + '_' + Math.floor(Math.random() * 1e9));
  inventory[uid] = { item, count };
  
  window.discoverItem?.(item.id);
  window.updateInventoryUI?.(); // Обновляем UI (вызывает renderInventoryGrid)
  return uid;
}

function removeItemByUid(uid, count = 1) {
  const inventory = getInventory();
  const slot = inventory[uid];
  if (!slot) return false;
  
  slot.count -= count;
  if (slot.count <= 0) {
    delete inventory[uid];
  }
  
  window.updateInventoryUI?.();
  return true;
}

function findItemByUid(uid) {
  const inventory = getInventory();
  return inventory[uid]?.item || null;
}

// ─────────────────────────────────────────────────────
// Экипировка (добавлена умная логика для 'passive')
// ─────────────────────────────────────────────────────
function equipItem(item, slot) {
  if (!window.equipmentState) return false;

  // Если предмет пассивный, а конкретный слот не указан, ищем свободный
  if (item.slot === 'passive' && !slot) {
    if (!window.equipmentState.passive1) slot = 'passive1';
    else if (!window.equipmentState.passive2) slot = 'passive2';
    else slot = 'passive1'; // Если оба заняты, заменяем первый
  }

  // Проверка совместимости слота
  if (!item.slot || (item.slot !== slot && item.slot !== 'passive')) {
    console.warn('Cannot equip', item.id, 'into slot', slot);
    return false;
  }
  
  const old = window.equipmentState[slot];
  if (old && old.onUnequip) old.onUnequip(window.state);
  
  window.equipmentState[slot] = item;
  if (item.onEquip) item.onEquip(window.state);
  
  if (typeof window.recalcStats === 'function') window.recalcStats();
  if (typeof window.updateActiveSlotsHUD === 'function') window.updateActiveSlotsHUD();

  return true;
}

function unequipItem(slot) {
  if (!window.equipmentState) return;
  const item = window.equipmentState[slot];
  if (!item || item === window.DEFAULT_HAND) return;
  
  if (item.onUnequip) item.onUnequip(window.state);
  window.equipmentState[slot] = (slot === 'hand') ? window.DEFAULT_HAND : null;
  
  if (typeof window.recalcStats === 'function') window.recalcStats();
  if (typeof window.updateActiveSlotsHUD === 'function') window.updateActiveSlotsHUD();
}

// ─────────────────────────────────────────────────────
// Использование расходников и активных слотов
// ─────────────────────────────────────────────────────
function useConsumable(uid) {
  const item = findItemByUid(uid);
  if (!item || item.type !== 'consumable') return false;
  
  if (item.onUse) item.onUse(window.state);
  removeItemByUid(uid, 1);
  return true;
}

function useActiveSlot(slotKey) {
  if (!window.equipmentState) return false;
  const item = window.equipmentState[slotKey];
  if (!item || !item.onUse) return false;
  
  if (item.cooldown && window.state.cooldowns?.[slotKey] > 0) return false;
  if (item.manaCost && typeof window.spendMana === 'function' && !window.spendMana(item.manaCost)) return false;
  
  item.onUse(window.state);
  
  if (item.cooldown) {
    window.state.cooldowns = window.state.cooldowns || {};
    window.state.cooldowns[slotKey] = item.cooldown;
  }
  
  if (typeof window.updateActiveSlotsHUD === 'function') window.updateActiveSlotsHUD();
  return true;
}

// ─────────────────────────────────────────────────────
// Тик пассивных предметов (вызывается в animate() из game.js)
// ─────────────────────────────────────────────────────
let passiveItemTimer = 0;

function tickPassiveItems(dt) {
  if (!window.equipmentState || !window.state) return;

  let crystalsPerMinute = 0;

  // Суммируем бонусы со всех пассивных слотов
  const p1 = window.equipmentState.passive1;
  const p2 = window.equipmentState.passive2;

  if (p1 && p1.stats?.crystalsPerMinute) crystalsPerMinute += p1.stats.crystalsPerMinute;
  if (p2 && p2.stats?.crystalsPerMinute) crystalsPerMinute += p2.stats.crystalsPerMinute;

  if (crystalsPerMinute > 0) {
    passiveItemTimer += dt;
    
    // 60 секунд = 1 минута
    if (passiveItemTimer >= 60) {
      passiveItemTimer -= 60;
      window.state.gems += crystalsPerMinute;
      
      if (typeof window.updateHUD === 'function') window.updateHUD();
      
      // Подсвечиваем счётчик кристаллов в HUD,
      // чтобы начисление было видно игроку.
      const gemEl = document.getElementById('gem-counter');
      if (gemEl) {
        gemEl.classList.remove('gem-flash');
        void gemEl.offsetWidth; // перезапуск анимации
        gemEl.classList.add('gem-flash');
      }

      if (typeof window.showFloatingText === 'function') {
        window.showFloatingText(`+${crystalsPerMinute} Crystals`, '#7dd3fc');
      } else {
        console.log(`[Passive] +${crystalsPerMinute} Crystals`);
      }
    }
  }
}

// Экспорт
window.addItemToInventory = addItemToInventory;
window.removeItemByUid = removeItemByUid;
window.findItemByUid = findItemByUid;
window.equipItem = equipItem;
window.unequipItem = unequipItem;
window.useConsumable = useConsumable;
window.useActiveSlot = useActiveSlot;
window.getInventory = getInventory;
window.tickPassiveItems = tickPassiveItems;