import { newGame, stepMonth, recompute } from '../src/sim/index';
const s = newGame();
let t = performance.now(); recompute(s); console.log('recompute', (performance.now() - t).toFixed(0));
t = performance.now(); stepMonth(s, { forecast: true }); console.log('step', (performance.now() - t).toFixed(0));
t = performance.now(); for (let i = 0; i < 3; i++) stepMonth(s, { forecast: true }); console.log('step avg', ((performance.now() - t) / 3).toFixed(0));
