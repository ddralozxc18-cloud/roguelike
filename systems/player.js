// systems/player.js

// Получить урон руки (учитывает экипированное оружие)
function getHandDamage() {
  const hand = equipmentState.hand;
  if (hand && typeof hand.stats?.damage === 'number') return hand.stats.damage;
  return 1; // Базовый урон кулака
}

// Нанести урон игроку
function damagePlayer(amount, type = 'physical') {
  if (amount <= 0 || state.dead) return;

  // Ambassador of Luck: входящий урон тоже рандомизирован ±10%
  if (typeof rollLuckDamage === 'function') amount = rollLuckDamage(amount);
  
  // applyArmorMitigation уже внутри использует physicalDamageMult или magicResistMult
  const final = (type === 'true') ? amount : applyArmorMitigation(amount, type);
  
  state.hp = Math.max(0, state.hp - final);
  state.lastDamageTime = clock.getElapsedTime();
  
  flashDamage?.();
  updateHUD?.();
  
  if (state.hp <= 0) killPlayer();
}

function healPlayer(amount) {
  if (state.dead || amount <= 0) return;
  state.hp = Math.min(state.maxHp, state.hp + amount);
  updateHUD?.();
}

function spendMana(amount) {
  if (state.mana < amount) return false;
  state.mana -= amount;
  updateHUD?.();
  return true;
}

function restoreMana(amount) {
  if (amount <= 0) return;
  state.mana = Math.min(state.maxMana, state.mana + amount);
  updateHUD?.();
}

function killPlayer() {
  state.dead = true;
  state.keys = {};
  clearAllEffects(); // Из systems/status_effects.js
  document.exitPointerLock();
  deathScreen?.classList.remove('hidden');
}

function respawnPlayer() {
  state.hp = state.maxHp;
  state.mana = state.maxMana;
  state.lastDamageTime = -999;
  state.dead = false;
  
  clearAllEffects();
  resetPlayerPosition(); // Из game.js
  recalcStats();         // Из systems/stats.js
  
  deathScreen?.classList.add('hidden');
  container.requestPointerLock();
}

// ─────────────────────────────────────────────────────
// Утилиты для UI и внешних систем
// ─────────────────────────────────────────────────────

// Получить коэффициент митигации (0.5 = 50% урона проходит)
function getPlayerMitigation(type = 'physical') {
  if (type === 'magic') {
    return getStat('magicResistMult') ?? 1;
  }
  return getStat('physicalDamageMult') ?? 1;
}

// Наложить эффект на игрока с учётом сопротивления эффектам
function applyPlayerStatusEffect(effectId, baseDuration, sourceId = 'enemy') {
  // applyEffectResist умножает базовую длительность на effectResistMult
  const finalDuration = applyEffectResist(baseDuration);
  applyStatusEffect(effectId, sourceId, finalDuration);
}

// Экспорт в глобал (чтобы старый код и UI видели функции)
window.getHandDamage = getHandDamage;
window.damagePlayer = damagePlayer;
window.healPlayer = healPlayer;
window.spendMana = spendMana;
window.restoreMana = restoreMana;
window.killPlayer = killPlayer;
window.respawnPlayer = respawnPlayer;
window.getPlayerMitigation = getPlayerMitigation;
window.applyPlayerStatusEffect = applyPlayerStatusEffect;
