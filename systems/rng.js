// systems/rng.js Тестовый код
// Seeded PRNG на основе mulberry32. Глобальный rng() + хелперы.

let worldSeed = Date.now() % 1000000;
let _rng = mulberry32(worldSeed);

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Базовые функции
function rng() { return _rng(); }
function rand(min, max) { return min + _rng() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[Math.floor(_rng() * arr.length)]; }
function chance(p) { return _rng() < p; }

// Взвешенный выбор: items — массив объектов, getWeight — fn(item) => number
function weightedPick(items, getWeight) {
  const total = items.reduce((s, it) => s + getWeight(it), 0);
  let roll = _rng() * total;
  for (const it of items) {
    roll -= getWeight(it);
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

// Пересоздать генератор (например, при старте нового рана)
function setSeed(seed) {
  worldSeed = seed >>> 0;
  _rng = mulberry32(worldSeed);
}

function getSeed() { return worldSeed; }

// Перемешать массив (Fisher-Yates на нашем rng)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(_rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

window.rng = rng;
window.rand = rand;
window.randInt = randInt;
window.pick = pick;
window.chance = chance;
window.weightedPick = weightedPick;
window.shuffle = shuffle;
window.setSeed = setSeed;
window.getSeed = getSeed;
window.mulberry32 = mulberry32;
