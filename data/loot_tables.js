// data/loot_tables.js — chest types + loot tables

// ─────────────────────────────────────────────────────
// CHESTS — определения сундуков, их цвета, редкость и таблицы лута.
// ─────────────────────────────────────────────────────
const CHESTS = {
  chest_trash: { 
    id: 'chest_trash', 
    name: 'Trash Chest', 
    color: '#7a7a7a',      // серый
    rarity: 'trash',
    lootRolls: 1,          // Сколько предметов выпадает
    lootTable: [
      // 100% шанс выпадения конкретного предмета (по id)
      { type: 'item', id: 'bookmaker_banner', weight: 100 }
    ]
  },
  
  chest_common: { 
    id: 'chest_common', 
    name: 'Common Chest', 
    color: '#f2f2f2',      // белый
    rarity: 'common',
    lootRolls: 2,
    lootTable: [
      { type: 'item',   rarity: 'trash',  weight: 40 },
      { type: 'item',   rarity: 'common', weight: 60 }
    ]
  },
  
  chest_rare: { 
    id: 'chest_rare', 
    name: 'Rare Chest', 
    color: '#3b6fe0',      // синий
    rarity: 'rare',
    lootRolls: 2,
    lootTable: [
      { type: 'item',   rarity: 'common', weight: 60 },
      { type: 'item',   rarity: 'rare',   weight: 40 }
    ]
  },
  
  chest_mythical: { 
    id: 'chest_mythical', 
    name: 'Mythical Chest', 
    color: '#9d4dff',      // фиолетовый
    rarity: 'mythical',
    lootRolls: 3,
    lootTable: [
      { type: 'item',   rarity: 'rare',     weight: 70 },
      { type: 'item',   rarity: 'mythical', weight: 30 }
    ]
  },
  
  chest_unemployed: { 
    id: 'chest_unemployed', 
    name: 'Unemployed Chest', 
    color: '#141414',      // чёрный
    rarity: 'unemployed',
    lootRolls: 1,
    lootTable: [
      { type: 'item',   rarity: 'unemployed', weight: 100 }
    ]
  },
};

window.CHESTS = CHESTS;