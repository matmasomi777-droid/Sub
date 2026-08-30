// Turn ../worker.js into an importable test module:
//  - redirect `cloudflare:sockets` to a local stub (cf-sockets.mjs)
//  - re-export the internal functions under test
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = process.argv[2] || new URL('../worker.js', import.meta.url).pathname;
const OUT = process.argv[3] || new URL('./worker.test.mjs', import.meta.url).pathname;

let src = readFileSync(SRC, 'utf8');
src = src.replace(/import\s*\{[^}]*\}\s*from\s*['"]cloudflare:sockets['"];?/,
  "import { connect } from './cf-sockets.mjs';");

src += `\nexport { vlessHeader, usageInit, usageDelta, usageReset, usageRead, usageOf, usageFresh,
  connAcquire, connRelease, connRefresh, sessionTouch, sessionsOf,
  liveEnsure, liveSweep, liveIps, liveIpsOrdered, d1Acquire, d1Release, d1Touch,
  connReset, liveRowsOf, limiterRpc, limiterBackend, admitDecision, backendOf,
  liveIpsAged, d1EvictIdle,
  dayKey, load, save, seed, DEF, flushDB, CONN_TTL, CONN_ACTIVITY_MS, CONN_EVICTS };\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, src);
console.log('built', OUT, src.length, 'chars');
