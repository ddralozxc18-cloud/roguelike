// перемести сюда отрисовку инвентара
// ui/inventory.js — ГЛАВНЫЙ КОД ОКОШКА СТАТОВ В ИНВЕНТАРЕ
// Рисует отдельное окошко слева от карточки инвентаря со статами:
// Броня, Сопротивление магии, Сопротивление эффектам, Скорость передвижения,
// Максимум здоровья, Максимум маны, Регенерация здоровья, Регенерация маны,
// Высота прыжка.
// Определения статов — data/stats.js (STAT_DEFS), значения — systems/stats.js
// (computedStats через getAllStats()), текущие HP/MP — window.gameState (game.js).

(function () {
  'use strict';

  let panelEl = null;
  let refreshTimer = null;

  // ---------------------------------------------------------
  // Актуальные значения статов (из файлов системы статов)
  // ---------------------------------------------------------
  function getDisplayStats() {
    const out = {};
    // computedStats + recalcStats — из systems/stats.js
    if (typeof getAllStats === 'function') Object.assign(out, getAllStats());

    // Если рекалк ещё не выполнялся — берём базу прямо из STAT_DEFS (data/stats.js)
    if (typeof STAT_DEFS !== 'undefined') {
      for (const id in STAT_DEFS) {
        if (out[id] === undefined) out[id] = STAT_DEFS[id].base;
      }
    }

    // Точные текущие максимумы из состояния игры (game.js)
    const s = window.gameState;
    if (s) {
      out.maxHp = s.maxHp;
      out.maxMana = s.maxMana;
    }

    // Резервные значения — достаем прямо из CONFIG в game.js
    const cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
    if (out.moveSpeed === undefined) out.moveSpeed = cfg.maxSpeed ?? 4.3;
    if (out.hpRegen === undefined)   out.hpRegen = cfg.hpRegenRate ?? 1.6;
    if (out.manaRegen === undefined) out.manaRegen = cfg.manaRegenRate ?? 4;
    if (out.jumpHeight === undefined && cfg.jumpSpeed && cfg.gravity) {
      out.jumpHeight = (cfg.jumpSpeed * cfg.jumpSpeed) / (2 * Math.abs(cfg.gravity));
    }

    // Магический резист: в computedStats лежит итоговый процент magicResistPercent
    if (out.magicResistPercent === undefined) {
      out.magicResistPercent = out.magicResist ?? 15;
    }
    return out;
  }

  function formatStat(id, def, stats) {
    if (id === 'magicResist') return def.format(stats.magicResistPercent);
    if (id === 'effectResist' && stats.effectResistPercent !== undefined) {
      return def.format(stats.effectResistPercent);
    }
    return def.format(stats[id] ?? def.base);
  }

  // ---------------------------------------------------------
  // Построение/обновление окошка
  // ---------------------------------------------------------
  function ensurePanel() {
    if (panelEl && document.body.contains(panelEl)) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'stats-inventory-panel';
    panelEl.className = 'stats-inventory-panel hidden';
    panelEl.innerHTML = '<h3 class="stats-panel-title">Характеристики</h3><div class="stats-list" id="stats-list"></div>';
    document.body.appendChild(panelEl);
    return panelEl;
  }

  function renderStatsPanel() {
    const panel = ensurePanel();
    const list = panel.querySelector('.stats-list');
    if (!list || typeof STAT_DEFS === 'undefined') return;
    const stats = getDisplayStats();
    list.innerHTML = '';
    for (const id of STAT_DISPLAY_ORDER) {
      const def = STAT_DEFS[id];
      if (!def) continue;
      const row = document.createElement('div');
      row.className = 'stat-row';
      if (def.tooltip) row.title = def.tooltip;
      row.innerHTML =
        '<span class="stat-name"><span class="stat-icon">' + def.icon + '</span>' + def.name + '</span>' +
        '<span class="stat-value">' + formatStat(id, def, stats) + '</span>';
      list.appendChild(row);
    }
  }

  function positionPanel() {
    if (!panelEl) return;
    const invScreen = document.getElementById('inventory-screen');
    const card = invScreen ? invScreen.querySelector('.inventory-card') : null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const pw = panelEl.offsetWidth;
    let left = r.left - pw - 24; // слева от карточки инвентаря
    if (left < 8) left = 8;      // если тесно — прижимаем к краю экрана
    panelEl.style.left = left + 'px';
    panelEl.style.top = Math.max(8, r.top) + 'px';
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function showStatsPanel() {
    const panel = ensurePanel();
    renderStatsPanel();
    panel.classList.remove('hidden');
    requestAnimationFrame(positionPanel);
    stopAutoRefresh();
    refreshTimer = setInterval(renderStatsPanel, 500); // регены и уровни обновляются на лету
  }

  function hideStatsPanel() {
    if (panelEl) panelEl.classList.add('hidden');
    stopAutoRefresh();
  }

  // Синхронизация с состоянием инвентаря — вызывается из toggleInventory (game.js)
  function syncWithInventory() {
    const s = window.gameState;
    if (s && s.inventoryOpen) showStatsPanel();
    else hideStatsPanel();
  }

  window.addEventListener('resize', () => {
    const s = window.gameState;
    if (s && s.inventoryOpen) positionPanel();
  });

  window.showStatsInventoryPanel = showStatsPanel;
  window.hideStatsInventoryPanel = hideStatsPanel;
  window.renderStatsInventoryPanel = renderStatsPanel;
  window.syncStatsInventoryPanel = syncWithInventory;
})();
