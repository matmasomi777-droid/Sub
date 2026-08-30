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
  liveIpsAged, d1EvictIdle, liveView, connKick, connAcquireInner,
  metaEnsure, metaPut, metaDel, metaSweep, label, renderName, NAME_PRESETS, NAME_TOKENS,
  liveRowsDetailed, liveSessions, sourceName, metaBytes, metaMigrate, META_COLS,
  banEnsure, banAdd, banRemove, banList, banCheck, banSweep, banSource,
  validateBackup, applyBackup, BACKUP_ROOT_KEYS, SETTING_KEYS,
  dayKey, load, save, seed, DEF, flushDB, CONN_TTL, CONN_ACTIVITY_MS, CONN_EVICTS,
  EXIT_SECURITIES, EXIT_TRANSPORTS, EXIT_STATS, EXIT_LAST_ERR,
  normalizeExit, exitIssues, exitsOf, exitById, resolveExit, exitRoutingEnabled,
  ipv6ToBytes, vlessAddons, vlessRequestHeader, wsFrame, makeWsUnwrap, openExitSocket, testExit,
  parseVlessLink, EXIT_LINK_ERR, VLESS_QUERY_MAP, EXIT_FIELDS };\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, src);
console.log('built', OUT, src.length, 'chars');
