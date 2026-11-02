// systems/weapons.js

let currentWeapon = null;
let attackCooldown = 0;
let isAttacking = false;
let attackStartTime = 0;
let attackAnimDuration = 0.25;
let currentAmmo = 0; // Для огнестрела

// ─────────────────────────────────────────────────────
// Экипировка оружия
// ─────────────────────────────────────────────────────
function equipWeapon(weapon) {
  if (!weapon || weapon.type !== 'weapon') return false;
  
  // Если у оружия есть патроны, инициализируем текущий запас
  if (weapon.subtype === 'firearm') {
    currentAmmo = weapon.stats.ammo || 0;
  }

  equipmentState.hand = weapon;
  currentWeapon = weapon;
  
  recalcStats(); // Пересчитываем статы (например, если оружие дает +к броне)
  updateWeaponsHUD?.(); // Обновляем слоты в интерфейсе
  return true;
}

// ─────────────────────────────────────────────────────
// Основная атака (ЛКМ)
// ─────────────────────────────────────────────────────
function tryAttack(targets = []) {
  if (attackCooldown > 0) return false;
  
  const w = equipmentState.hand;
  
  // 1. Кулак (базовая атака без оружия)
  if (!w || w.id === 'default_hand') {
    attackCooldown = 0.3;
    startAttackAnim(0.25);
    const hit = checkMeleeHit(targets, 2.0);
    if (hit) dealDamageToTarget(hit, 1, 'physical');
    return true;
  }

  // 2. Проверка затрат (мана / патроны)
  if (w.manaCost && !spendMana(w.manaCost)) return false;
  
  if (w.subtype === 'firearm') {
    if (currentAmmo <= 0) {
      // В будущем тут можно вызывать звук "клик" и анимацию перезарядки
      return false; 
    }
    currentAmmo--;
    // Обновляем HUD патронов, если есть функция
    updateWeaponsHUD?.(); 
  }

  // 3. Установка кулдауна и начало анимации
  const speed = w.stats?.attackSpeed || 1;
  attackCooldown = 1 / speed;
  startAttackAnim((1 / speed) * 0.6); // Анимация занимает 60% времени кулдауна

  // 4. Логика атаки в зависимости от типа
  if (w.subtype === 'melee') {
    const hit = checkMeleeHit(targets, w.stats.range || 2.2);
    if (hit) {
      dealDamageToTarget(hit, w.stats.damage, w.damageType || 'physical');
      if (w.onHit) w.onHit(state, hit); // Доп. эффект оружия (например, вампиризм)
    }
    spawnMeleeSwingEffect(); // Визуальный эффект замаха
  } 
  else if (w.subtype === 'firearm') {
    fireProjectile(w, targets);
  } 
  else if (w.subtype === 'staff') {
    castStaffSpell(w, targets); // Стреляет снарядом (визуал)
  } 
  else if (w.subtype === 'thrown') {
    throwProjectile(w); // Создает физический меш, который летит
  }
  
  return true;
}

// ─────────────────────────────────────────────────────
// Проверка попадания в ближнем бою (Raycast)
// ─────────────────────────────────────────────────────
function checkMeleeHit(targets, range) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  ray.far = range;
  
  const meshes = targets.map(t => t.mesh);
  const hits = ray.intersectObjects(meshes);
  
  if (hits.length === 0) return null;
  return targets.find(t => t.mesh === hits[0].object) || null;
}

// ─────────────────────────────────────────────────────
// Стрельба (Hitscan)
// ─────────────────────────────────────────────────────
function fireProjectile(weapon, targets) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  
  const meshes = targets.map(t => t.mesh);
  const hits = ray.intersectObjects(meshes);
  
  let hitPoint = ray.ray.at(50, new THREE.Vector3()); // Если промах — летим вдаль
  
  if (hits.length > 0) {
    const target = targets.find(t => t.mesh === hits[0].object);
    hitPoint = hits[0].point;
    dealDamageToTarget(target, weapon.stats.damage, weapon.damageType || 'physical');
  }
  
  // Визуал трассера (линия от камеры до точки попадания)
  spawnTracer(camera.position.clone(), hitPoint);
}

// ─────────────────────────────────────────────────────
// Нанесение урона цели
// ─────────────────────────────────────────────────────
function dealDamageToTarget(target, raw, type = 'physical') {
  if (!target) return;
  
  // Крит (берем из статов игрока)
  const critChance = getStat('critChance') || 0.05; // 5% по умолчанию
  const isCrit = rng() < critChance;
  const dmg = isCrit ? raw * 2 : raw;
  
  // Митигация броней/сопротивлением (из systems/stats.js)
  const final = applyArmorMitigation(dmg, type);
  
  // Показываем цифру урона (из твоего старого кода)
  showDamageNumber?.(target, Math.round(final));
  
  if (target.isImmortal) return;
  
  target.hp = Math.max(0, target.hp - final);
  
  // Если цель умерла
  if (target.hp <= 0) {
    killTarget(target);
  }
}

function killTarget(target) {
  // Тут можно начислить XP через gainXp() из leveling.js
  if (typeof gainXp === 'function') gainXp(target.xpReward || 10);
  
  // Удаляем из сцены
  if (target.mesh) scene.remove(target.mesh);
  if (target.hpTextMesh) scene.remove(target.hpTextMesh);
  
  // Очищаем эффекты на цели
  // (если у цели есть свои activeEffects)
}

// ─────────────────────────────────────────────────────
// Анимация и кулдауны
// ─────────────────────────────────────────────────────
function startAttackAnim(duration) {
  isAttacking = true;
  attackStartTime = clock.getElapsedTime();
  attackAnimDuration = duration;
}

function updateAttackCooldown(dt) {
  if (attackCooldown > 0) attackCooldown -= dt;
  
  if (isAttacking) {
    const elapsed = clock.getElapsedTime() - attackStartTime;
    
    if (elapsed >= attackAnimDuration) {
      isAttacking = false;
      resetHandPosition?.(); // Возврат руки в исходное (из game.js)
    } else {
      // Плавная анимация замаха (0..1)
      const progress = elapsed / attackAnimDuration;
      animateHandSwing?.(progress); 
    }
  }
}

// ─────────────────────────────────────────────────────
// Заглушки для визуальных эффектов (чтобы не крашилось)
// ─────────────────────────────────────────────────────
function spawnTracer(start, end) {
  if (typeof createTracer === 'function') createTracer(start, end);
}

function spawnMeleeSwingEffect() {
  if (typeof createSwingEffect === 'function') createSwingEffect();
}

// Экспорт
window.equipWeapon = equipWeapon;
window.tryAttack = tryAttack;
window.dealDamageToTarget = dealDamageToTarget;
window.updateAttackCooldown = updateAttackCooldown;
