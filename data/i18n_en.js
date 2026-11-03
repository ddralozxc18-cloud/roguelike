// data/i18n_en.js — ГЛАВНЫЙ ФАЙЛ АНГЛИЙСКОЙ ЛОКАЛИЗАЦИИ
// Игра пока только на английском: этот файл переопределяет пользовательские
// тексты (названия школ, врождёнок, статов, предметов) поверх ru-дефолтов
// из data/schools.js и data/stats.js. Подключается в index.html ПОСЛЕ них.

(function () {
  const SCHOOLS_RU = window.SCHOOLS || {};
  const ABILITIES_RU = window.INNATE_ABILITIES || {};
  const STATS_RU = window.STAT_DEFS || {};

  // ── Школы (названия не показываются в UI, но переводим на всякий случай) ──
  const SCHOOLS_EN = {
    fire: { name: 'Fire', description: 'A devastating element. Deals area damage and burns enemies.' },
    space: { name: 'Space', description: 'Spatial distortion. Mobility, dashes and double jumps.' },
    luck: { name: 'Luck', description: 'Casino and randomness. No two strikes are ever alike.' },
  };

  // ── Врождённые способности (показываются в выборе школы и инвентаре) ──
  const ABILITIES_EN = {
    fire: {
      description: 'Constant flame aura: scorches every enemy nearby.',
    },
    space: {
      description: 'Double jump. On the downward second jump a projectile fires dealing hand damage ×2.',
    },
    luck: {
      description: 'All your damage (and incoming damage) is never fixed: each hit lands between −10% and +10% of the base value.',
    },
  };

  // ── Статы (окошко характеристик в инвентаре) ──
  const STATS_EN = {
    armor: {
      name: 'Armor',
      tooltip: 'Reduces physical damage with the Dota 2 formula: (0.06 × Armor) / (1 + 0.06 × |Armor|)',
    },
    magicResist: {
      name: 'Magic Resistance',
      tooltip: 'Magic damage passes through as (1 − R1) × (1 − R2) × ... The base 15% is always present',
    },
    effectResist: {
      name: 'Effect Resistance',
      tooltip: 'Debuff durations are reduced multiplicatively',
    },
    moveSpeed: {
      name: 'Movement Speed',
      unit: 'm/s',
      tooltip: 'Maximum ground speed (sv_maxspeed analog)',
    },
    maxHp: {
      name: 'Max Health',
      tooltip: '+20 per level',
    },
    maxMana: {
      name: 'Max Mana',
      tooltip: '+15 per level',
    },
    hpRegen: {
      name: 'Health Regeneration',
      unit: 'per sec',
      tooltip: 'Starts 4 seconds after taking damage (CONFIG.hpRegenDelay), +0.05 per level',
    },
    manaRegen: {
      name: 'Mana Regeneration',
      unit: 'per sec',
      tooltip: 'Mana regenerates constantly, +0.1 per level',
    },
    jumpHeight: {
      name: 'Jump Height',
      unit: 'm',
      tooltip: 'Depends on jump speed (CONFIG.jumpSpeed = 9.8) and gravity (−22)',
    },
  };

  // Форматтеры с английскими единицами измерения
  const FORMATTERS_EN = {
    magicResist: (v) => v.toFixed(1) + '%',
    effectResist: (v) => v.toFixed(1) + '%',
    moveSpeed: (v) => v.toFixed(2) + ' m/s',
    hpRegen: (v) => v.toFixed(2) + ' /s',
    manaRegen: (v) => v.toFixed(2) + ' /s',
    jumpHeight: (v) => v.toFixed(2) + ' m',
  };

  for (const id in SCHOOLS_EN) {
    if (SCHOOLS_RU[id]) Object.assign(SCHOOLS_RU[id], SCHOOLS_EN[id]);
  }
  for (const id in ABILITIES_EN) {
    if (ABILITIES_RU[id]) Object.assign(ABILITIES_RU[id], ABILITIES_EN[id]);
  }
  for (const id in STATS_EN) {
    if (STATS_RU[id]) Object.assign(STATS_RU[id], STATS_EN[id]);
  }
  for (const id in FORMATTERS_EN) {
    if (STATS_RU[id]) STATS_RU[id].format = FORMATTERS_EN[id];
  }

  // ── Предметы инвентаря (ITEM_DEFS объявлены в game.js через const) ──
  const ITEMS_EN = {
    gem: 'Crystal',
    potion_hp: 'Health Potion',
    potion_mana: 'Mana Potion',
  };
  function localizeItemDefs() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof ITEM_DEFS !== 'undefined' && ITEM_DEFS) {
        for (const k in ITEMS_EN) {
          // eslint-disable-next-line no-undef
          if (ITEM_DEFS[k]) ITEM_DEFS[k].name = ITEMS_EN[k];
        }
        return true;
      }
    } catch (e) { /* данные ещё не загружены */ }
    return false;
  }
  if (!localizeItemDefs()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (localizeItemDefs() || tries > 100) clearInterval(timer);
    }, 50);
    window.addEventListener('load', localizeItemDefs);
  }

  // Экранирование для вставки в HTML (текст идёт из данных)
  window.escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
})();
