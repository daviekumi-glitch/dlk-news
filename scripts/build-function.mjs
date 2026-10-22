// Backend functions are single-file Deno modules. `agentChat.ts` is committed as
// the source of truth; `agentTools.ts` is generated so the calculator is shared
// with the frontend (src/lib/tools/calculator.ts) instead of being copy-pasted.
//   node scripts/build-function.mjs
import fs from 'node:fs';
const src = fs.readFileSync('base44/functions/_src/agentTools.src.ts', 'utf8');
const calc = fs.readFileSync('src/lib/tools/calculator.ts', 'utf8').replace(/^export\s+/gm, '');
const start = src.indexOf('// ===== calculator');
const end = src.indexOf('function truncate');
const out = src.slice(0, start) + '// ===== calculator (embedded from src/lib/tools/calculator.ts) =====\n' + calc + '\n' + src.slice(end);
fs.writeFileSync('base44/functions/agentTools.ts', out);
console.log('wrote base44/functions/agentTools.ts', out.length, 'chars');
