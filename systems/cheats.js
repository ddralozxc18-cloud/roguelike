// systems/cheats.js
// Реестр чит-команд. Каждая команда регистрируется через registerCheatCommand(...)
// в том модуле, который её реализует. Команда "help" строится автоматически
// из реестра — обновлять её при добавлении новых команд НЕ нужно.

const CHEAT_COMMANDS = [];

// kind: 'action' | 'generator' (генераторы вида lvlup_12)
function registerCheatCommand(def) {
  if (!def || !def.name || !def.description) return;
  // защита от дубликатов
  const existing = CHEAT_COMMANDS.find((c) => c.name === def.name);
  if (existing) {
    Object.assign(existing, def);
    return;
  }
  CHEAT_COMMANDS.push({
    name: def.name,
    description: def.description,
    usage: def.usage || def.name,
    category: def.category || 'Прочее',
    kind: def.kind || 'action',
    run: def.run || null, // (args, ctx) => void; ctx = { game } — доступ к внутренностям игры
  });
}

function findCheatCommand(name) {
  return CHEAT_COMMANDS.find((c) => c.name === name) || null;
}

function getCheatCommands() {
  return CHEAT_COMMANDS.slice();
}

window.CHEAT_COMMANDS = CHEAT_COMMANDS;
window.registerCheatCommand = registerCheatCommand;
window.findCheatCommand = findCheatCommand;
window.getCheatCommands = getCheatCommands;
