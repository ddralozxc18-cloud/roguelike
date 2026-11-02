// systems/items.js

// Инвентарь: { uid: { item, count } }. Стаки для consumable.
const inventory = {};   // uid → { item, count }

function addItemToInventory(item, count = 1) {
  if (item.stackable) {
    // Ищем существующий стак того же id
    for (const uid in inventory) {
      const slot = inventory[uid];
      if (slot.item.id === item.id && slot.count < (item.maxStack || 1)) {
        const space = (item.maxStack || 1) - slot.count;
        const toAdd = Math.min(space, count);
        slot.count += toAdd;
        count -= toAdd;
        if (count <= 0) { updateInventoryUI?.(); return uid; }
      }
    }
  }
  // Новый слот
  const uid = item.uid || (item.id + '_' + Math.floor(rng() * 1e9));
  inventory[uid] = { item, count };
  discoverItem?.(item.id);
  updateInventoryUI?.();
  return uid;
}

function removeItemByUid(uid, count = 1) {
  const slot = inventory[uid];
  if (!slot) return false;
  slot.count -= count;
  if (slot.count <= 0) delete inventory[uid];
  updateInventoryUI?.();
  return true;
}

function findItemByUid(uid) { return inventory[uid]?.item || null; }

// Экипировка
function equipItem(item, slot) {
  if (!item.slot || item.slot !== slot) {
    console.warn('Нельзя экипировать', item.id, 'в слот', slot);
    return false;
  }
  const old = equipmentState[slot];
  if (old && old.onUnequip) old.onUnequip(state);
  equipmentState[slot] = item;
  if (item.onEquip) item.onEquip(state);
  recalcStats();
  updateActiveSlotsHUD?.();
  return true;
}

function unequipItem(slot) {
  const item = equipmentState[slot];
  if (!item || item === DEFAULT_HAND) return;
  if (item.onUnequip) item.onUnequip(state);
  equipmentState[slot] = (slot === 'hand') ? DEFAULT_HAND : null;
  recalcStats();
  updateActiveSlotsHUD?.();
}

// Использование расходника
function useConsumable(uid) {
  const item = findItemByUid(uid);
  if (!item || item.type !== 'consumable') return false;
  if (item.onUse) item.onUse(state);
  removeItemByUid(uid, 1);
  return true;
}

// Использование активного слота (Shift / C)
function useActiveSlot(slotKey) {
  const item = equipmentState[slotKey];
  if (!item || !item.onUse) return false;
  if (item.cooldown && state.cooldowns?.[slotKey] > 0) return false;
  if (item.manaCost && !spendMana(item.manaCost)) return false;
  item.onUse(state);
  if (item.cooldown) {
    state.cooldowns = state.cooldowns || {};
    state.cooldowns[slotKey] = item.cooldown;
  }
  updateActiveSlotsHUD?.();
  return true;
}

function getInventory() { return inventory; }

window.addItemToInventory = addItemToInventory;
window.removeItemByUid = removeItemByUid;
window.findItemByUid = findItemByUid;
window.equipItem = equipItem;
window.unequipItem = unequipItem;
window.useConsumable = useConsumable;
window.useActiveSlot = useActiveSlot;
window.getInventory = getInventory;
