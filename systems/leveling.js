// systems/leveling.js

function gainXp(amount) {
  if (amount <= 0 || state.dead) return;

  state.xp += amount;
  let leveledUp = false;
  let levelsGained = 0;

  // Проверяем, сколько уровней мы апнули (может быть сразу несколько)
  while (state.xp >= state.xpToNextLevel) {
    state.xp -= state.xpToNextLevel;
    state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.5);
    state.level++;
    leveledUp = true;
    levelsGained++;
  }

  if (!leveledUp) {
    updateHUD?.();
    return;
  }

  // 1. Восстанавливаем здоровье и ману (рекалк сделает это автоматически, 
  // но мы хотим, чтобы после левелапа они были полными)
  recalcStats(); // Это обновит state.maxHp и state.maxMana на основе нового уровня
  state.hp = state.maxHp;
  state.mana = state.maxMana;

  // 2. Открываем выбор скиллов или второй школы
  // Мы делаем это ПОСЛЕ рекалка, чтобы UI видел новые статы.
  
  if (state.level >= 10 && !state.innateSchool2 && !state.secondSchoolOffered) {
    // Открываем выбор второй школы (только 1 раз)
    state.secondSchoolOffered = true;
    if (typeof openSchoolSelectSecond === 'function') {
      openSchoolSelectSecond();
      state.paused = true; // Пауза до выбора
    }
  } else {
    // Открываем выбор обычных карточек
    if (typeof openSpellChoice === 'function') {
      // Передаем количество уровней, чтобы UI знал, сколько раз игрок должен выбрать
      // (Если ты хочешь по 5 карточек за каждый уровень — можно вызвать в цикле, 
      // но проще дать игроку выбрать один раз и обновить карточки, если уровней много)
      openSpellChoice(levelsGained); 
      state.paused = true;
    }
  }

  updateHUD?.();
}

function grantXpFromKill(target) {
  // Базовый опыт за убийство
  let base = target.xpReward ?? 5;
  
  // Бонус к опыту за уровень врага (если у цели есть уровень)
  if (target.level && target.level > 0) {
    base += target.level * 2;
  }
  
  gainXp(base);
}

window.gainXp = gainXp;
window.grantXpFromKill = grantXpFromKill;
