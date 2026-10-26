const fs = require('fs');
const zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
const K = Number(process.argv[3] || 60);
const starts = [];
for (let i = 0; i <= buf.length - 4; i++) if (buf[i] === 0x28 && buf[i+1] === 0xb5 && buf[i+2] === 0x2f && buf[i+3] === 0xfd) starts.push(i);
const events = [];
for (let k = 0; k < starts.length; k++) {
  const s = starts[k], e = k + 1 < starts.length ? starts[k+1] : buf.length;
  for (const line of zlib.zstdDecompressSync(buf.subarray(s, e)).toString('utf8').split('\n')) { const t = line.trim(); if (t) events.push(JSON.parse(t)); }
}
const turnStarts = events.filter(e => e.type === 'turn/start');
const keepFrom = turnStarts[turnStarts.length - K].seq;
const kept = events.filter(e => e.seq >= keepFrom);
const typeCount = {};
for (const e of kept) typeCount[e.type] = (typeCount[e.type] || 0) + 1;
console.log('keepFrom seq', keepFrom, 'kept events', kept.length, 'bytes', (kept.reduce((a, e) => a + JSON.stringify(e).length, 0) / 1024).toFixed(1) + 'KB');
console.log(JSON.stringify(typeCount, null, 1));
console.log('turn numbers:', turnStarts.slice(-K).map(e => e.data.turn).join(','));
// 检查保留区间内 surface 事件顺序
console.log('surface ops in kept:');
for (const e of kept.filter(e => e.type === 'system/message' || e.type === 'user/message' || e.type === 'assistant/message' || e.type === 'tool/result' || e.type === 'developer/message').slice(0, 5)) console.log(' first surface:', e.seq, e.type, JSON.stringify(e.surfaceOp));
console.log('end-seed seqs in kept:', JSON.stringify(kept.filter(e => e.type === 'session/end-seed').map(e => e.seq)));
console.log('llm/retry seqs in kept:', JSON.stringify(kept.filter(e => e.type === 'llm/retry' || e.type === 'llm/retry-started').map(e => e.seq)));
console.log('command seqs in kept:', JSON.stringify(kept.filter(e => e.type.startsWith('command/')).map(e => e.seq)));
console.log('title seqs in kept:', JSON.stringify(kept.filter(e => e.type.startsWith('session/title')).map(e => e.seq)));
console.log('compaction seqs in kept:', JSON.stringify(kept.filter(e => e.type.startsWith('compaction/')).map(e => e.seq)));
console.log('system/message seqs in kept:', JSON.stringify(kept.filter(e => e.type === 'system/message').map(e => e.seq)));
console.log('first 12 kept events:', kept.slice(0, 12).map(e => `${e.seq}:${e.type}`).join(' | '));
