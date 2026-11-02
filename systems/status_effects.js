// systems/status_effects.js
const activeEffects = {};  // { effectId: { stacks, remaining, lastTick } }

function applyStatusEffect(effectId, sourceId = 'player', baseDuration) {
  const def = STATUS_EFFECTS[effectId];
  if (!def) return;

  // Сопротивление эффектам (только для дебаффов от врагов)
  if (!def.isBuff && sourceId !== 'player') {
    if (rng() > applyEffectResist(1.0)) {
      showFloatingText?.('Сопротивление!', '#7dd3fc');
      return;
    }
  }

  if (!activeEffects[effectId]) {
    activeEffects[effectId] = {
      stacks: 0,
      remaining: baseDuration || def.duration,
      lastTick: 0,
    };
    // Первое наложение — вешаем модификаторы
    if (def.statModifiers) {
      for (const type in def.statModifiers) {
        addStatModifier(effectId, type, def.statModifiers[type]);
      }
    }
    def.onApply?.(state, sourceId, 1);
  }

  const inst = activeEffects[effectId];
  inst.stacks = Math.min(def.maxStacks, inst.stacks + 1);
  inst.remaining = Math.max(inst.remaining, baseDuration || def.duration);
  updateStatusIcons?.();
}

function updateStatusEffects(dt, elapsed) {
  for (const effectId in activeEffects) {
    const def = STATUS_EFFECTS[effectId];
    const inst = activeEffects[effectId];

    inst.remaining -= dt;

    if (def.tickRate > 0 && elapsed - inst.lastTick >= def.tickRate) {
      inst.lastTick = elapsed;
      def.onTick?.(state, inst.stacks);
    }

    if (inst.remaining <= 0) {
      def.onExpire?.(state);
      removeStatModifier(effectId);
      delete activeEffects[effectId];
    }
  }
  updateStatusIcons?.();
}

function clearAllEffects() {
  for (const effectId in activeEffects) {
    const def = STATUS_EFFECTS[effectId];
    def.onExpire?.(state);
    removeStatModifier(effectId);
  }
  for (const k in activeEffects) delete activeEffects[k];
  updateStatusIcons?.();
}

function getActiveEffects() { return activeEffects; }

window.applyStatusEffect = applyStatusEffect;
window.updateStatusEffects = updateStatusEffects;
window.clearAllEffects = clearAllEffects;
window.getActiveEffects = getActiveEffects;
