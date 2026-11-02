// systems/spell_loot.js

// ─────────────────────────────────────────────────────
// Ролл 5 карточек на левелапе
// ─────────────────────────────────────────────────────
function rollSpellChoices(player, options = {}) {
  const total = options.total ?? 5;
  const innateCount = options.innateCount ?? 2;

  // 1. Собираем пул врождённых школ (например, ['fire'] или ['fire', 'space'])
  const innateSchools = [player.innateSchool, player.innateSchool2].filter(Boolean);
  
  // Превращаем ID скиллов в объекты
  const innatePool = [];
  for (const schoolId of innateSchools) {
    const spellIds = SPELLS_BY_SCHOOL[schoolId] || [];
    for (const id of spellIds) {
      const spell = SPELLS_DB[id];
      if (spell) innatePool.push(spell);
    }
  }

  // Исключаем уже изученные скиллы и слишком высокоуровневые
  // (например, на 1 уровне мы не даем mythical скиллы)
  const playerLevel = player.level || state.level || 1;
  const maxAllowedTier = getMaxAllowedTier(playerLevel);

  const validInnate = innatePool.filter(spell => {
    if (player.learnedSpells?.[spell.id]) return false; // Уже есть
    if (!isTierAllowed(spell.tier, maxAllowedTier)) return false; // Слишком сильный
    return true;
  });

  const choices = [];
  const usedIds = new Set();

  // 2. Гарантированные карточки из врождённой школы
  const shuffledInnate = shuffle(validInnate);
  for (const spell of shuffledInnate) {
    if (choices.length >= innateCount) break;
    if (usedIds.has(spell.id)) continue;
    usedIds.add(spell.id);
    choices.push({ kind: 'new', spell });
  }

  // Если врождённых скиллов не хватило (все изучены), добиваем из общей базы
  // ...

  // 3. Добиваем остальные карточки из всех школ
  const allSpells = Object.values(SPELLS_DB);
  const validAll = allSpells.filter(spell => {
    if (player.learnedSpells?.[spell.id]) return false;
    if (!isTierAllowed(spell.tier, maxAllowedTier)) return false;
    return true;
  });

  const shuffledAll = shuffle(validAll);
  for (const spell of shuffledAll) {
    if (choices.length >= total) break;
    if (usedIds.has(spell.id)) continue;
    usedIds.add(spell.id);
    choices.push({ kind: 'new', spell });
  }

  // 4. Собираем доступные апгрейды для уже изученных скиллов
  const upgrades = [];
  for (const spellId in (player.learnedSpells || {})) {
    if (canUpgrade(spellId)) {
      upgrades.push({ kind: 'upgrade', spell: SPELLS_DB[spellId] });
    }
  }

  // Возвращаем перемешанные карточки и список апгрейдов
  return { 
    choices: shuffle(choices), 
    upgrades 
  };
}

// ─────────────────────────────────────────────────────
// Вспомогательные функции для фильтрации по тирам (редкости)
// ─────────────────────────────────────────────────────

// Определяет, какие тиры (редкости) скиллов могут выпасть на этом уровне
function getMaxAllowedTier(level) {
  if (level >= 15) return 5; // Unemployed (секретные)
  if (level >= 10) return 4; // Mythical
  if (level >= 5)  return 3; // Rare
  if (level >= 2)  return 2; // Common
  return 1;                  // Trash (1 уровень)
}

// Проверяет, подходит ли редкость скилла под текущий уровень
function isTierAllowed(spellTier, maxTier) {
  const rarityDef = RARITIES[spellTier];
  if (!rarityDef) return true; // Если редкость не указана, разрешаем
  return rarityDef.tier <= maxTier;
}

// Экспорт
window.rollSpellChoices = rollSpellChoices;
window.getMaxAllowedTier = getMaxAllowedTier;
window.isTierAllowed = isTierAllowed;
