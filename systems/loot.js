// systems/loot.js

// ─────────────────────────────────────────────────────
// Универсальный ролл по редкости
// ─────────────────────────────────────────────────────

function rollItemOfRarity(rarityId, options = {}) {
  const pool = ITEMS_BY_RARITY[rarityId] || [];
  if (pool.length === 0) return null;

  const filtered = pool.filter(id => {
    const it = ITEMS_DB[id];
    return options.allowHidden || !it.hidden;
  });
  if (filtered.length === 0) return null;

  return instantiate(pick(filtered), 'item', options);
}

function rollWeaponOfRarity(rarityId, options = {}) {
  const pool = WEAPONS_BY_RARITY[rarityId] || [];
  if (pool.length === 0) return null;

  const filtered = pool.filter(id => {
    const w = WEAPONS_DB[id];
    return options.allowHidden || !w.hidden;
  });
  if (filtered.length === 0) return null;

  return instantiate(pick(filtered), 'weapon', options);
}

function rollSpellOfRarity(rarityId, options = {}) {
  // Предполагается, что SPELLS_BY_RARITY есть в data/spells/index.js
  const pool = SPELLS_BY_RARITY[rarityId] || [];
  if (pool.length === 0) return null;

  const filtered = pool.filter(id => {
    const s = SPELLS_DB[id];
    return options.allowHidden || !s.hidden;
  });
  if (filtered.length === 0) return null;

  return instantiate(pick(filtered), 'spell', options);
}

function rollByType(type, rarity, options = {}) {
  if (type === 'item')   return rollItemOfRarity(rarity, options);
  if (type === 'weapon') return rollWeaponOfRarity(rarity, options);
  if (type === 'spell')  return rollSpellOfRarity(rarity, options);
  return null;
}

// ─────────────────────────────────────────────────────
// Универсальный instantiate (создание экземпляра)
// ─────────────────────────────────────────────────────

function instantiate(baseId, type = 'item', options = {}) {
  let base = null;
  if (type === 'item')   base = ITEMS_DB[baseId];
  if (type === 'weapon') base = WEAPONS_DB[baseId];
  if (type === 'spell')  base = SPELLS_DB[baseId];

  if (!base) {
    console.warn(`instantiate: не найден ${type} с id ${baseId}`);
    return null;
  }

  // Для скиллов множители редкости не применяются к базовым статам,
  // так как они качаются через уровни (upgrades). Но мы можем дать им UID.
  if (type === 'spell') {
    return {
      ...base,
      uid: baseId + '_spell_' + Math.floor(rng() * 1e9),
      type: 'spell'
    };
  }

  const rarity = RARITIES[base.rarity] || { statMultiplier: 1, affixCount: 0 };
  const finalStats = {};

  // 1. Применяем множитель редкости к базовым статам
  for (const key in base.stats) {
    finalStats[key] = base.stats[key] * rarity.statMultiplier;
    // ±10% разброс, чтобы два меча не были одинаковыми
    finalStats[key] *= 0.9 + rng() * 0.2; 
  }

  // 2. Роллим аффиксы
  const affixes = rollAffixes(rarity.affixCount, base.type || type);
  
  // 3. Применяем аффиксы
  for (const af of affixes) {
    for (const stat in af.stats) {
      const val = af.stats[stat];
      
      // Если аффикс процентный (например, +10% к скорости)
      if (af.apply === 'percent' || STAT_DEFS[stat]?.apply === 'percent') {
        // Если базового стата нет, берем 1 (базу), чтобы не было NaN
        const currentBase = finalStats[stat] !== undefined ? finalStats[stat] : 1;
        finalStats[stat] = currentBase * (1 + val);
      } else {
        // Обычное сложение
        finalStats[stat] = (finalStats[stat] || 0) + val;
      }
    }
  }

  // Возвращаем готовый объект
  return {
    ...base,
    stats: finalStats,
    affixes,
    uid: baseId + '_' + Math.floor(rng() * 1e9),
    rarity: base.rarity, // сохраняем строковое значение для UI
  };
}

// ─────────────────────────────────────────────────────
// Аффиксы
// ─────────────────────────────────────────────────────

function rollAffixes(count, itemType) {
  if (count <= 0) return [];
  
  // Фильтруем пул по типу предмета (weapon, armor, trinket и т.д.)
  const pool = AFFIX_POOL.filter(a => !a.types || a.types.includes(itemType));
  if (pool.length === 0) return [];

  const picked = [];
  const used = new Set();
  let attempts = 0;
  
  // Пытаемся набрать нужное количество уникальных аффиксов
  while (picked.length < count && attempts < 100) {
    attempts++;
    const a = pick(pool);
    if (used.has(a.id)) continue;
    used.add(a.id);
    picked.push(a);
  }
  
  return picked;
}

// Экспорт
window.rollItemOfRarity = rollItemOfRarity;
window.rollWeaponOfRarity = rollWeaponOfRarity;
window.rollSpellOfRarity = rollSpellOfRarity;
window.rollByType = rollByType;
window.instantiate = instantiate;
window.rollAffixes = rollAffixes;

// Оставляем старые названия для обратной совместимости с другими файлами
window.instantiateItem = (id, opt) => instantiate(id, 'item', opt);
window.instantiateWeapon = (id, opt) => instantiate(id, 'weapon', opt);
