// systems/stats.js
// Рекалк всех статов игрока. НЕ трогает передвижение (это в player.js).

let computedStats = {};

// Модификаторы (баффы, дебаффы, ауры)
const statModifiers = {
  flat: {},      // { sourceId: { armor: +10 } }
  percent: {},   // { sourceId: { maxHp: 0.2 } }
  override: {},  // { sourceId: { moveSpeed: 0 } }
};

// Специфичные списки для мультипликативной математики (Dota-style)
const magicResistSources = new Set();  // ['base', 'item1', 'spell2']
const effectResistSources = new Set(); // ['item1', 'buff3']

function addStatModifier(sourceId, type, stats) {
  statModifiers[type][sourceId] = stats;
  
  // Если модификатор добавляет магический резист — запоминаем источник
  if (type === 'flat' && stats.magicResist !== undefined) {
    magicResistSources.add(sourceId);
  }
  if (type === 'flat' && stats.effectResist !== undefined) {
    effectResistSources.add(sourceId);
  }

  recalcStats();
}

function removeStatModifier(sourceId) {
  delete statModifiers.flat[sourceId];
  delete statModifiers.percent[sourceId];
  delete statModifiers.override[sourceId];
  
  magicResistSources.delete(sourceId);
  effectResistSources.delete(sourceId);

  recalcStats();
}

function recalcStats() {
  const out = {};

  // 1. База (из data/stats.js)
  for (const id in STAT_DEFS) out[id] = STAT_DEFS[id].base;

  // 2. Вклад уровня
  const lvl = state.level - 1;
  out.maxHp     += lvl * 20;
  out.maxMana   += lvl * 15;
  out.hpRegen   += lvl * 0.05;
  out.manaRegen += lvl * 0.1;

  // 3. Вклад экипировки
  for (const slotId in equipmentState) {
    const item = equipmentState[slotId];
    if (!item || !item.stats) continue;
    for (const statId in item.stats) {
      if (out[statId] === undefined) continue;
      const def = STAT_DEFS[statId];
      // Если стат процентный (например, moveSpeed), умножаем
      if (def.apply === 'percent') {
        out[statId] *= (1 + item.stats[statId]);
      } else {
        out[statId] += item.stats[statId];
      }
    }
  }

  // 4. Flat модификаторы
  for (const src in statModifiers.flat) {
    for (const statId in statModifiers.flat[src]) {
      if (out[statId] !== undefined) out[statId] += statModifiers.flat[src][statId];
    }
  }

  // 5. Percent модификаторы
  for (const src in statModifiers.percent) {
    for (const statId in statModifiers.percent[src]) {
      if (out[statId] !== undefined) out[statId] *= (1 + statModifiers.percent[src][statId]);
    }
  }

  // 6. Override
  for (const src in statModifiers.override) {
    for (const statId in statModifiers.override[src]) {
      if (out[statId] !== undefined) out[statId] = statModifiers.override[src][statId];
    }
  }

  // 7. Капы (только для базовых статов)
  for (const id in STAT_DEFS) {
    const def = STAT_DEFS[id];
    if (def.min !== undefined) out[id] = Math.max(def.min, out[id]);
    if (def.max !== undefined) out[id] = Math.min(def.max, out[id]);
  }

  // ★★★ СОПРОТИВЛЕНИЕ МАГИИ (Мультипликативное) ★★★
  // Врожденное 15% берем из базы, всё остальное — из модификаторов и предметов
  let magicSources = [0.15]; // базовое 15%
  
  // Собираем все проценты магического резиста (из экипировки и модификаторов)
  for (const slotId in equipmentState) {
    const item = equipmentState[slotId];
    if (item?.stats?.magicResist) magicSources.push(item.stats.magicResist / 100); // переводим 15 в 0.15
  }
  for (const src in statModifiers.flat) {
    if (statModifiers.flat[src].magicResist) magicSources.push(statModifiers.flat[src].magicResist / 100);
  }

  // Формула: Урон = Урон * (1-R1) * (1-R2)...
  // Итоговый резист = 1 - (1-R1)*(1-R2)*...
  let remainingDmgMult = 1;
  for (const r of magicSources) {
    remainingDmgMult *= (1 - r);
  }
  out.magicResistPercent = (1 - remainingDmgMult) * 100; // сохраняем итоговый % для UI
  out.magicResistMult = remainingDmgMult; // множитель для быстрого расчета

  // ★★★ СОПРОТИВЛЕНИЕ ЭФФЕКТАМ (Мультипликативное) ★★★
  let effectSources = [];
  for (const slotId in equipmentState) {
    const item = equipmentState[slotId];
    if (item?.stats?.effectResist) effectSources.push(item.stats.effectResist / 100);
  }
  for (const src in statModifiers.flat) {
    if (statModifiers.flat[src].effectResist) effectSources.push(statModifiers.flat[src].effectResist / 100);
  }

  let remainingDurMult = 1;
  for (const s of effectSources) {
    remainingDurMult *= (1 - s);
  }
  out.effectResistPercent = (1 - remainingDurMult) * 100; // для UI
  out.effectResistMult = remainingDurMult; // множитель длительности

  // ★★★ БРОНЯ (Формула Dota 2) ★★★
  // out.armor уже собран выше (база + экипировка + модификаторы).
  // Формула снижения урона: (0.06 * armor) / (1 + 0.06 * |armor|)
  const armor = out.armor;
  if (armor >= 0) {
    out.physicalDamageMult = 1 - ((0.06 * armor) / (1 + 0.06 * armor));
  } else {
    // Отрицательная броня: урон увеличивается
    // Формула: 2 - (1 - 0.06 * |armor| / (1 + 0.06 * |armor|))
    const absArmor = Math.abs(armor);
    const reduction = (0.06 * absArmor) / (1 + 0.06 * absArmor);
    out.physicalDamageMult = 1 + reduction; 
  }

  computedStats = out;

  // 8. Синхронизация со state (HP/MP)
  state.maxHp        = Math.round(out.maxHp);
  state.maxMana      = Math.round(out.maxMana);
  state.hp           = Math.min(state.hp, state.maxHp);
  state.mana         = Math.min(state.mana, state.maxMana);

  // 9. Передвижение НЕ ТРОГАЕМ (это в systems/player.js)
  // CONFIG.walkSpeed = out.moveSpeed;  <-- удалено

  if (typeof updateHUD === 'function') updateHUD();
}

// Применение физического урона с учетом брони
function applyArmorMitigation(incoming, type = 'physical') {
  if (type === 'magic') {
    return incoming * computedStats.magicResistMult;
  }
  return incoming * computedStats.physicalDamageMult;
}

// Применение сопротивления эффектам (возвращает новую длительность)
function applyEffectResist(baseDuration) {
  return baseDuration * computedStats.effectResistMult;
}

function getStat(id) { return computedStats[id] ?? 0; }
function getAllStats() { return { ...computedStats }; }

window.recalcStats = recalcStats;
window.getStat = getStat;
window.getAllStats = getAllStats;
window.addStatModifier = addStatModifier;
window.removeStatModifier = removeStatModifier;
window.applyArmorMitigation = applyArmorMitigation;
window.applyEffectResist = applyEffectResist;
