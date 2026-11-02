// systems/spells.js

const learnedSpells = {};   // { spellId: { level, cooldownLeft } }

// Изучить скилл
function learnSpell(spellId) {
  const def = SPELLS_DB[spellId];
  if (!def) return false;

  if (learnedSpells[spellId]) {
    // Уже есть — это апгрейд
    return upgradeSpell(spellId);
  }
  
  learnedSpells[spellId] = { level: 1, cooldownLeft: 0 };
  discoverSpell?.(spellId); // Для кодекса (ui/codex.js)
  recalcStats(); // Если скилл пассивно меняет статы
  return true;
}

// Апгрейд скилла
function upgradeSpell(spellId) {
  const inst = learnedSpells[spellId];
  if (!inst) return false;
  
  const upgrades = SPELL_UPGRADES[spellId] || [];
  if (inst.level >= upgrades.length + 1) return false;  // Достигнут максимум
  
  inst.level++;
  recalcStats();  // Применяем бонусы от onUpgrade
  return true;
}

// Можно ли улучшить скилл
function canUpgrade(spellId) {
  const inst = learnedSpells[spellId];
  if (!inst) return false;
  const upgrades = SPELL_UPGRADES[spellId] || [];
  return inst.level < upgrades.length + 1;
}

// ─────────────────────────────────────────────────────
// Каст скилла
// ─────────────────────────────────────────────────────
function castSpell(spellId) {
  const inst = learnedSpells[spellId];
  if (!inst) return false;
  if (inst.cooldownLeft > 0) return false; // Ещё на кулдауне

  const def = SPELLS_DB[spellId];
  if (!def) return false;
  if (def.manaCost && !spendMana(def.manaCost)) return false;

  // 1. Бонус к урону от врождённой школы
  let damageMultiplier = 1.0;
  if (state.innateSchool === def.school) {
    damageMultiplier = 1.15; // +15% урона скиллам родной школы
  }

  // 2. Вызов логики (снаряды, взрывы и т.д.)
  // onCast возвращает массив целей, в которые попали
  const hitTargets = def.onCast?.(state, camera, { 
    level: inst.level, 
    damageMult: damageMultiplier 
  }) || [];

  // 3. Применение эффектов к целям
  if (def.stats?.applyEffect && hitTargets.length > 0) {
    const e = def.stats.applyEffect;
    
    for (const target of hitTargets) {
      // Пробиваем ли шанс?
      if (chance(e.chance)) {
        // Если цель — игрок (или урон наносит игрок)
        applyStatusEffect(e.id, 'player', e.duration);
      }
    }
  }

  // 4. Установка кулдауна
  inst.cooldownLeft = def.cooldown;
  
  // 5. Визуальный фидбек в HUD (если есть)
  updateSpellbookUI?.();
  
  return true;
}

// ─────────────────────────────────────────────────────
// Тик кулдаунов (вызывается в animate() из game.js)
// ─────────────────────────────────────────────────────
function updateSpellCooldowns(dt) {
  for (const id in learnedSpells) {
    const inst = learnedSpells[id];
    if (inst.cooldownLeft > 0) {
      inst.cooldownLeft = Math.max(0, inst.cooldownLeft - dt);
    }
  }
  
  // Обновляем визуальные таймеры в UI
  if (typeof updateSpellCooldownUI === 'function') updateSpellCooldownUI();
}

// ─────────────────────────────────────────────────────
// Геттеры
// ─────────────────────────────────────────────────────
function getSpellLevel(spellId) {
  return learnedSpells[spellId]?.level || 0;
}

function getSpellCooldown(spellId) {
  return learnedSpells[spellId]?.cooldownLeft || 0;
}

function hasSpell(spellId) { 
  return !!learnedSpells[spellId]; 
}

function getLearnedSpells() { 
  return learnedSpells; 
}

// Экспорт
window.learnSpell = learnSpell;
window.upgradeSpell = upgradeSpell;
window.canUpgrade = canUpgrade;
window.castSpell = castSpell;
window.updateSpellCooldowns = updateSpellCooldowns;
window.getSpellLevel = getSpellLevel;
window.getSpellCooldown = getSpellCooldown;
window.hasSpell = hasSpell;
window.getLearnedSpells = getLearnedSpells;
