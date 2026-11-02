// врождённые магии: fire, space, luck
// Огонь // Пространство // Удача (казино)

const SCHOOLS = {
  fire: {
    id: 'fire',
    name: 'Огонь',
    icon: '🔥',
    color: '#ff7a2a',
    image: 'img/schools/fire!webp',
    description: 'Разрушительная стихия. Наносит урон по площади и сжигает врагов.',
  },
  space: {
    id: 'space',
    name: 'Пространство',
    icon: '🌀',
    color: '#8f6bff',
    image: null,
    description: 'Искажение пространства. Мобильность, рывки и двойные прыжки.',
  },
  luck: {
    id: 'luck',
    name: 'Удача',
    icon: '🎲',
    color: '#e8c96b',
    image: null,
    description: 'Казино и случайность. Ни один удар не бывает одинаковым.',
  },
};

// ─────────────────────────────────────────────────────
// ВРОЖДЁННЫЕ СПОСОБНОСТИ (выдаются на старте за выбранную школу)
// ─────────────────────────────────────────────────────
const INNATE_ABILITIES = {
  fire: {
    id: 'scorching_flame',
    school: 'fire',
    name: 'Scorching Flame',
    icon: '🔥',
    color: '#ff7a2a',
    // Аналог Radiance из Dota 2: постоянная аура ожога вокруг игрока
    kind: 'passive_aura',
    radius: 7,               // радиус ауры (юниты)
    damagePerTick: 3,        // базовый урон за тик
    tickInterval: 0.55,      // секунд между тиками
    description: 'Постоянная аура пламени: выжигает всех врагов рядом (аналог Radiance).',
  },
  space: {
    id: 'parkour',
    school: 'space',
    name: 'Parkour',
    icon: '🌀',
    color: '#8f6bff',
    kind: 'passive_mobility',
    description: 'Двойной прыжок. На втором прыжке вниз вылетает снаряд с уроном = урон руки ×2.',
  },
  luck: {
    id: 'ambassador_of_luck',
    school: 'luck',
    name: 'Ambassador of Luck',
    icon: '🎲',
    color: '#e8c96b',
    kind: 'passive_modifier',
    variance: 0.10,          // ±10% к любому урону
    description: 'Весь твой урон (и входящий) не фиксирован: каждый раз от −10% до +10% от базового значения.',
  },
};

window.SCHOOLS = SCHOOLS;
window.INNATE_ABILITIES = INNATE_ABILITIES;
