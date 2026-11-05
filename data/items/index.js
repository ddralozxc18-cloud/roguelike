// data/items/index.js
const ITEMS_DB = {};

function registerItems(list) {
  if (!list) return;
  for (const item of list) {
    if (ITEMS_DB[item.id]) {
      console.warn('Дубликат предмета:', item.id);
      continue;
    }
    ITEMS_DB[item.id] = item;
  }
}

// Регистрируем все категории предметов
registerItems(window.ITEMS_TRASH);
registerItems(window.ITEMS_COMMON);
registerItems(window.ITEMS_RARE);
registerItems(window.ITEMS_MYTHICAL);
registerItems(window.ITEMS_UNEMPLOYED);

// А вот эти три строчки очень важны!
registerItems(window.ITEMS_CONSUMABLES);
registerItems(window.ITEMS_ARMOR);
registerItems(window.ITEMS_TRINKETS); // <-- Именно тут лежит Bookmaker banner

// Быстрые индексы для ролла по редкости
const ITEMS_BY_RARITY = {};
for (const id in ITEMS_DB) {
  const r = ITEMS_DB[id].rarity;
  if (!ITEMS_BY_RARITY[r]) ITEMS_BY_RARITY[r] = [];
  ITEMS_BY_RARITY[r].push(id);
}

window.ITEMS_DB = ITEMS_DB;
window.ITEMS_BY_RARITY = ITEMS_BY_RARITY;