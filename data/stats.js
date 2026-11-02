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
    name: 'Броня',
    icon: '🛡',
    base: 0,
    min: -20,
    max: 90,
    apply: 'flat',
    format: (v) => v.toFixed(1),
    tooltip: 'Снижает физический урон по формуле Dota 2: (0.06 × Броня) / (1 + 0.06 × |Броня|)',
  },
  magicResist: {
    id: 'magicResist',
    name: 'Сопротивление магии',
    icon: '✴',
    base: 15, // базовые 15% из systems/stats.js (мультипликативный стек)
    min: 0,
    max: 100,
    apply: 'flat',
    unit: '%',
    format: (v) => v.toFixed(1) + '%',
    tooltip: 'Магический урон проходит как (1 − R1) × (1 − R2) × ... Базовые 15% есть всегда',
  },
  effectResist: {
    id: 'effectResist',
    name: 'Сопротивление эффектам',
    icon: '❖',
    base: 0,
    min: 0,
    max: 100,
    apply: 'flat',
    unit: '%',
    format: (v) => v.toFixed(1) + '%',
    tooltip: 'Длительность дебаффов сокращается мультипликативно',
  },
  moveSpeed: {
    id: 'moveSpeed',
    name: 'Скорость передвижения',
    icon: '➤',
    base: 4.3, // CONFIG.maxSpeed (game.js)
    min: 0,
    max: 20,
    apply: 'percent',
    unit: 'м/с',
    format: (v) => v.toFixed(2) + ' м/с',
    tooltip: 'Максимальная скорость на земле (аналог sv_maxspeed)',
  },
  maxHp: {
    id: 'maxHp',
    name: 'Максимум здоровья',
    icon: '♥',
    base: 100, // state.maxHp (game.js)
    min: 1,
    max: 100000,
    apply: 'flat',
    format: (v) => String(Math.round(v)),
    tooltip: '+20 за каждый уровень',
  },
  maxMana: {
    id: 'maxMana',
    name: 'Максимум маны',
    icon: '✦',
    base: 100, // state.maxMana (game.js)
    min: 0,
    max: 100000,
    apply: 'flat',
    format: (v) => String(Math.round(v)),
    tooltip: '+15 за каждый уровень',
  },
  hpRegen: {
    id: 'hpRegen',
    name: 'Регенерация здоровья',
    icon: '❤',
    base: 1.6, // CONFIG.hpRegenRate (game.js)
    min: 0,
    max: 1000,
    apply: 'flat',
    perSec: true,
    unit: 'ед/сек',
    format: (v) => v.toFixed(2) + ' ед/сек',
    tooltip: 'Работает через 4 сек после получения урона (CONFIG.hpRegenDelay), +0.05 за уровень',
  },
  manaRegen: {
    id: 'manaRegen',
    name: 'Регенерация маны',
    icon: '💧',
    base: 4, // CONFIG.manaRegenRate (game.js)
    min: 0,
    max: 1000,
    apply: 'flat',
    perSec: true,
    unit: 'ед/сек',
    format: (v) => v.toFixed(2) + ' ед/сек',
    tooltip: 'Мана восстанавливается постоянно, +0.1 за уровень',
  },
  jumpHeight: {
    id: 'jumpHeight',
    name: 'Высота прыжка',
    icon: '⇧',
    base: 2.18, // h = jumpSpeed² / (2g) = 9.8² / (2·22) ≈ 2.18 м (game.js)
    min: 0,
    max: 50,
    apply: 'flat',
    unit: 'м',
    format: (v) => v.toFixed(2) + ' м',
    tooltip: 'Зависит от скорости прыжка (CONFIG.jumpSpeed = 9.8) и гравитации (−22)',
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