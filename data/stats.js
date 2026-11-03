// определения статов, капы, формулы
// data/stats.js — ГЛАВНЫЙ ФАЙЛ СТАТОВ ИГРОКА
// Значения «вынуты» из существующего кода:
//   CONFIG (game.js): maxSpeed 4.3, jumpSpeed 9.8, hpRegenRate 1.6, manaRegenRate 4
//   state (game.js):  hp/maxHp 100, mana/maxMana 100
//   systems/stats.js: базовое сопротивление магии 15%, броня/эффекты с нуля
//   физика падения (game.js): g = |gravity| = 22 м/с^2

const STAT_DEFS = {
  armor: {
    id: 'armor',
    name: 'Armor',
    icon: '🛡',
    base: 0,
    min: -20,
    max: 90,
    apply: 'flat',
    format: (v) => v.toFixed(1),
    tooltip: 'Reduces physical damage via the Dota 2 formula: (0.06 × Armor) / (1 + 0.06 × |Armor|)',
  },
  magicResist: {
    id: 'magicResist',
    name: 'Magic Resistance',
    icon: '✴',
    base: 15, // базовые 15% из systems/stats.js (мультипликативный стек)
    min: 0,
    max: 100,
    apply: 'flat',
    unit: '%',
    format: (v) => v.toFixed(1) + '%',
    tooltip: 'Magic damage passes as (1 − R1) × (1 − R2) × ... A base 15% is always present',
  },
  effectResist: {
    id: 'effectResist',
    name: 'Effect Resistance',
    icon: '❖',
    base: 0,
    min: 0,
    max: 100,
    apply: 'flat',
    unit: '%',
    format: (v) => v.toFixed(1) + '%',
    tooltip: 'Debuff duration is reduced multiplicatively',
  },
  moveSpeed: {
    id: 'moveSpeed',
    name: 'Movement Speed',
    icon: '➤',
    base: 4.3, // CONFIG.maxSpeed (game.js)
    min: 0,
    max: 20,
    apply: 'percent',
    unit: 'm/s',
    format: (v) => v.toFixed(2) + ' m/s',
    tooltip: 'Maximum ground speed (sv_maxspeed equivalent)',
  },
  maxHp: {
    id: 'maxHp',
    name: 'Max Health',
    icon: '♥',
    base: 100, // state.maxHp (game.js)
    min: 1,
    max: 100000,
    apply: 'flat',
    format: (v) => String(Math.round(v)),
    tooltip: '+20 per level',
  },
  maxMana: {
    id: 'maxMana',
    name: 'Max Mana',
    icon: '✦',
    base: 100, // state.maxMana (game.js)
    min: 0,
    max: 100000,
    apply: 'flat',
    format: (v) => String(Math.round(v)),
    tooltip: '+15 per level',
  },
  hpRegen: {
    id: 'hpRegen',
    name: 'Health Regeneration',
    icon: '❤',
    base: 1.6, // CONFIG.hpRegenRate (game.js)
    min: 0,
    max: 1000,
    apply: 'flat',
    perSec: true,
    unit: '/s',
    format: (v) => v.toFixed(2) + '/s',
    tooltip: 'Starts 4 s after taking damage (CONFIG.hpRegenDelay), +0.05 per level',
  },
  manaRegen: {
    id: 'manaRegen',
    name: 'Mana Regeneration',
    icon: '💧',
    base: 4, // CONFIG.manaRegenRate (game.js)
    min: 0,
    max: 1000,
    apply: 'flat',
    perSec: true,
    unit: '/s',
    format: (v) => v.toFixed(2) + '/s',
    tooltip: 'Mana regenerates constantly, +0.1 per level',
  },
  jumpHeight: {
    id: 'jumpHeight',
    name: 'Jump Height',
    icon: '⇧',
    base: 2.18, // h = jumpSpeed² / (2g) = 9.8² / (2·22) ≈ 2.18 м (game.js)
    min: 0,
    max: 50,
    apply: 'flat',
    unit: 'm',
    format: (v) => v.toFixed(2) + ' m',
    tooltip: 'Depends on jump speed (CONFIG.jumpSpeed = 9.8) and gravity (−22)',
  },
};

// Порядок вывода статов в окошке инвентаря
const STAT_DISPLAY_ORDER = [
  'armor',
  'magicResist',
  'effectResist',
  'moveSpeed',
  'maxHp',
  'maxMana',
  'hpRegen',
  'manaRegen',
  'jumpHeight',
];

window.STAT_DEFS = STAT_DEFS;
window.STAT_DISPLAY_ORDER = STAT_DISPLAY_ORDER;