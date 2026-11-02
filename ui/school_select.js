// ui/school_select.js
// экран выбора врождённой магии на старте игры
// врождённые магии: fire, space, luck
// После выбора -> applyInnateSchool() -> beginGame() (игра стартует)

(function () {
  'use strict';

  let overlayEl = null;
  let isSecondSchoolMode = false;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'school-select-screen';
    overlayEl.className = 'screen hidden school-select-screen';
    overlayEl.innerHTML = `
      <div class="school-select-card">
        <h2 class="school-select-title" id="school-select-title">Выберите врождённую магию</h2>
        <p class="school-select-subtitle" id="school-select-subtitle">
          Стихия определит вашу врождённую способность — она появится в инвентаре.
        </p>
        <div class="school-cards-row" id="school-cards-row"></div>
      </div>`;
    document.body.appendChild(overlayEl);
    overlayEl.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') e.stopPropagation(); // выбор обязателен
    });
    return overlayEl;
  }

  function buildCard(schoolId, onSelect) {
    const school = SCHOOLS[schoolId];
    const ability = INNATE_ABILITIES[schoolId];
    if (!school || !ability) return null;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'school-card';
    card.style.setProperty('--school-color', school.color);

    const imgHtml = school.image
      ? `<img class="school-card-img" src="${school.image}" alt="${school.name}">`
      : `<div class="school-card-icon">${school.icon}</div>`;

    card.innerHTML = `
      ${imgHtml}
      <div class="school-card-body">
        <div class="school-card-name">${school.name}</div>
        <div class="school-card-ability">${ability.icon} ${ability.name}</div>
        <div class="school-card-desc">${ability.description}</div>
      </div>`;

    card.addEventListener('click', () => onSelect(schoolId));
    return card;
  }

  // mode: 'innate' (старт игры) | 'second' (вторая школа на 10 уровне)
  function open(mode) {
    isSecondSchoolMode = mode === 'second';
    const overlay = ensureOverlay();
    const row = overlay.querySelector('#school-cards-row');
    const title = overlay.querySelector('#school-select-title');
    const subtitle = overlay.querySelector('#school-select-subtitle');

    row.innerHTML = '';
    const available = Object.keys(SCHOOLS).filter((id) => {
      if (!isSecondSchoolMode) return true;
      return id !== gameState.innateSchool; // вторую школу нельзя совпадать с первой
    });

    if (isSecondSchoolMode) {
      title.textContent = 'Выберите вторую школу';
      subtitle.textContent = 'На 10 уровне открывается вторая врождённая магия.';
    } else {
      title.textContent = 'Выберите врождённую магию';
      subtitle.textContent = 'Стихия определит вашу врождённую способность — она появится в инвентаре.';
    }

    for (const id of available) {
      const card = buildCard(id, onPicked);
      if (card) row.appendChild(card);
    }

    overlay.classList.remove('hidden');
  }

  function onPicked(schoolId) {
    // Защита от повторного выбора после старта игры
    if (!isSecondSchoolMode && gameState.started) { close(); return; }
    close();
    if (isSecondSchoolMode) {
      // Вторая школа: просто запоминаем (способности не дублируем в слот)
      gameState.innateSchool2 = schoolId;
      window.updateHUD?.();
      gameState.paused = false;
      document.getElementById('game-container').requestPointerLock();
      return;
    }
    // Выбор врождённой магии на старте: применяем и запускаем игру
    applyInnateSchool(schoolId);
    if (typeof beginGame === 'function') beginGame();
  }

  function close() {
    if (overlayEl) overlayEl.classList.add('hidden');
  }

  function isOpen() {
    return !!overlayEl && !overlayEl.classList.contains('hidden');
  }

  window.openSchoolSelect = () => open('innate');
  window.openSchoolSelectSecond = () => open('second');
  window.closeSchoolSelect = close;
  window.schoolSelectIsOpen = isOpen;
})();
