// systems/innate.js
// Логика врождённых способностей: fire / space / luck

// ─────────────────────────────────────────────────────
// Ambassador of Luck (luck): любой урон становится случайным
// в диапазоне ±10% от базового значения.
// ─────────────────────────────────────────────────────
function rollLuckDamage(baseAmount) {
  const gs = (typeof state !== 'undefined') ? state : window.gameState;
  if (!gs || gs.innateAbilityId !== 'ambassador_of_luck') return baseAmount;
  const ability = INNATE_ABILITIES.luck;
  const v = ability?.variance ?? 0.10;
  const mult = 1 + (Math.random() * 2 - 1) * v; // от 0.9 до 1.1
  return Math.max(1, Math.round(baseAmount * mult));
}

// Экспорт
window.rollLuckDamage = rollLuckDamage;
