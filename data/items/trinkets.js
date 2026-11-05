// data/items/trinkets.js
const ITEMS_TRINKETS = [
  {
    id: 'bookmaker_banner',
    name: 'Bookmaker banner',
    type: 'trinket',       // <-- Важно для логики экипировки
    slot: 'passive',       // <-- Указывает, что он надевается в пассивку
    rarity: 'trash',
    stats: { 
      crystalsPerMinute: 20 
    },
    icon: '◆',             // Если нет картинки, можно поставить символ
    description: 'Crystals per minute: 20. "They don\'t care where they buy ads."',
  }
];
window.ITEMS_TRINKETS = ITEMS_TRINKETS;