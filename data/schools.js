// врождённые магии: fire, space, luck
// Огонь // Пространство // Удача (казино)

const SCHOOLS = {
  fire: {
    id: 'fire',
    name: 'Fire',
    icon: '🔥',
    color: '#ff7a2a',
    image: 'img/schools/fire!webp',
    description: 'A destructive element. Deals area damage and burns enemies.',
  },
  space: {
    id: 'space',
    name: 'Space',
    icon: '🌀',
    color: '#8f6bff',
    image: null,
    description: 'Spatial distortion. Mobility, dashes and double jumps.',
  },
  luck: {
    id: 'luck',
    name: 'Luck',
    icon: '🎲',
    color: '#e8c96b',
    image: null,
    description: 'Casino and randomness. No two hits are ever the same.',
  },
};

// ─────────────────────────────────────────────────────
// ВРОЖДЁННЫЕ СПОСОБНОСТИ (выдаются на старте за выбранную школу)
// ─────────────────────────────────────────────────────
const INNATE_ABILITIES = {
  fire: {
    id: 'scorching_flame',
    school: 'fire',
    name: 'Scorching Flame',
    icon: '🔥',
    color: '#ff7a2a',
    // Постоянная аура ожога вокруг игрока
    kind: 'passive_aura',
    radius: 7,               // радиус ауры (юниты)
    damagePerTick: 3,        // базовый урон за тик
    tickInterval: 0.55,      // секунд между тиками
    description: 'Constant flame aura: scorches every nearby enemy.',
  },
  space: {
    id: 'parkour',
    school: 'space',
    name: 'Parkour',
    icon: '🌀',
    color: '#8f6bff',
    kind: 'passive_mobility',
    description: 'Double jump. The second jump fires a downward projectile dealing hand damage ×2.',
  },
  luck: {
    id: 'ambassador_of_luck',
    school: 'luck',
    name: 'Ambassador of Luck',
    icon: '🎲',
    color: '#e8c96b',
    kind: 'passive_modifier',
    variance: 0.10,          // ±10% к любому урону
    description: 'All damage you deal (and receive) is not fixed: each hit ranges from −10% to +10% of the base value.',
  },
};

window.SCHOOLS = SCHOOLS;
window.INNATE_ABILITIES = INNATE_ABILITIES;
