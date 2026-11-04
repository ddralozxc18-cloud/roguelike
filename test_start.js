// Headless test: load index.html with jsdom, stub WebGL, click Start Game via postMessage,
// pick a school, and verify the game actually starts (state.started === true).
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = '/workspace';
const errors = [];

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => {
  // Ignore CSS parsing noise etc., capture real script errors
  if (e && e.detail instanceof Error) errors.push('jsdomError: ' + e.detail.message);
  else errors.push('jsdomError: ' + e.message);
});
virtualConsole.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const win = dom.window;

// ---- Stubs ----
win.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') {
    return {
      fillRect(){}, clearRect(){}, fillText(){}, measureText: () => ({width: 10}),
      drawImage(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){},
      createLinearGradient: () => ({addColorStop(){}}), putImageData(){}, getImageData: () => ({data: []}),
      save(){}, restore(){}, set font(v){}, set fillStyle(v){}, set strokeStyle(v){}, scale(){}, translate(){}, rotate(){}, closePath(){}, rect(){},
    };
  }
  return null; // webgl -> three.js will fail to get context; we stub THREE ourselves instead
};
win.Element.prototype.requestPointerLock = function () {};
document_pointer_lock_stub: {
  Object.defineProperty(win.document, 'pointerLockElement', { value: null, writable: true });
}
win.document.exitPointerLock = function () {};
win.HTMLElement.prototype.focus = function () {};
win.HTMLElement.prototype.blur = function () {};
win.addEventListener('error', (e) => errors.push('window error: ' + (e.error && e.error.stack || e.message)));

// Minimal THREE stub sufficient for game.js init — use real three package, patched for headless
const realTHREE = require('three');
win.THREE = new Proxy(realTHREE, {
  get(t, k) {
    if (k === 'WebGLRenderer') {
      return class { constructor(){ this.domElement = win.document.createElement('canvas'); this.shadowMap={enabled:false,type:0}; this.info={render:{}}; } setSize(){} render(){} setPixelRatio(){} setClearColor(){} getContext(){return {};} };
    }
    const v = t[k];
    if (typeof v === 'function' && /^(Plane|Box|Sphere|Cylinder|Torus|Cone|Icosahedron|Tetrahedron|Octahedron|Dodecahedron|Circle|Ring|Tube|Lathe|Extrude|Shape|Buffer)Geometry$/.test(String(k))) {
      return class extends v { constructor(...args){ super(...args); } };
    }
    return v;
  }
});
// Real geometry classes already have rotateX etc. (three r128 works in node without WebGL until rendering).

// Load scripts in order from index.html (skip CDN three)
const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
for (const src of scriptSrcs) {
  if (src.startsWith('http')) continue;
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  try {
    win.eval(code);
  } catch (e) {
    errors.push(`Script ${src} threw: ${e.message}\n${e.stack}`);
    console.log(`FAIL loading ${src}:`, e.message);
  }
}

console.log('--- after load ---');
console.log('state exists:', !!win.gameState, 'started:', win.gameState && win.gameState.started);

// Simulate menu iframe START_GAME message
win.postMessage({ type: 'START_GAME' }, '*');

setTimeout(() => {
  console.log('--- after START_GAME ---');
  const st = win.gameState;
  console.log('menuDismissed:', st.menuDismissed, 'started:', st.started);
  const sel = win.document.getElementById('school-select-screen');
  console.log('school select overlay exists:', !!sel, 'hidden:', sel && sel.classList.contains('hidden'));
  if (sel && !sel.classList.contains('hidden')) {
    const card = sel.querySelector('.school-card');
    console.log('school cards found:', sel.querySelectorAll('.school-card').length);
    if (card) card.click();
  }
  setTimeout(() => {
    console.log('--- after school pick ---');
    console.log('started:', st.started, 'paused:', st.paused, 'innateSchool:', st.innateSchool);
    const hud = win.document.getElementById('hud');
    console.log('hud hidden:', hud.classList.contains('hidden'));
    console.log('menu frame hidden:', win.document.getElementById('menu-frame-container').classList.contains('hidden'));
    if (errors.length) {
      console.log('\nERRORS:\n' + errors.slice(0, 15).join('\n---\n'));
    }
    console.log(st.started ? '\nRESULT: GAME STARTED OK' : '\nRESULT: GAME DID NOT START');
  }, 300);
}, 300);
