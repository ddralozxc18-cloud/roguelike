// data/loot_tables.js — chest types + loot tables

// ─────────────────────────────────────────────────────
// CHESTS — определения сундуков (пока только цвет/название).
// Таблицы лута будут добавлены позже.
// ─────────────────────────────────────────────────────
const CHESTS = {
  chest_trash:      { id: 'chest_trash',      name: 'Trash Chest',      color: 0x7a7a7a, rarity: 'trash' },      // серый
  chest_common:     { id: 'chest_common',     name: 'Common Chest',     color: 0xf2f2f2, rarity: 'common' },      // белый
  chest_rare:       { id: 'chest_rare',       name: 'Rare Chest',       color: 0x3b6fe0, rarity: 'rare' },        // синий
  chest_mythical:   { id: 'chest_mythical',   name: 'Mythical Chest',   color: 0x9d4dff, rarity: 'mythical' },    // фиолетовый
  chest_unemployed: { id: 'chest_unemployed', name: 'Unemployed Chest', color: 0x141414, rarity: 'unemployed' },  // чёрный
};

window.CHESTS = CHESTS;