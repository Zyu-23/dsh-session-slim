const fs = require('fs');
const zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
for (let i = 0; i <= buf.length - 4; i++) if (buf[i] === 0x28 && buf[i+1] === 0xb5 && buf[i+2] === 0x2f && buf[i+3] === 0xfd) starts.push(i);
const events = [];
for (let k = 0; k < starts.length; k++) {
  const s = starts[k], e = k + 1 < starts.length ? starts[k+1] : buf.length;
  for (const line of zlib.zstdDecompressSync(buf.subarray(s, e)).toString('utf8').split('\n')) { const t = line.trim(); if (t) events.push(JSON.parse(t)); }
}
console.log('=== non-string surfaceOp ===');
for (const e of events.filter(e => e.surfaceOp && typeof e.surfaceOp !== 'string')) console.log(e.seq, e.type, JSON.stringify(e.surfaceOp).slice(0, 300));
console.log('\n=== last 40 events ===');
for (const e of events.slice(-40)) {
  const s = JSON.stringify(e);
  console.log(e.seq, e.type, 'turn=' + (e.data?.turn ?? '-'), 'step=' + (e.data?.step ?? '-'), 'op=' + (typeof e.surfaceOp === 'string' ? e.surfaceOp : JSON.stringify(e.surfaceOp) || '-'), s.length > 220 ? s.slice(0, 220) + '...' : s);
}
console.log('\n=== last 3 turns boundaries ===');
const turnsIdx = events.map((e, i) => [e, i]).filter(([e]) => e.type === 'turn/start' || e.type === 'turn/end');
for (const [e, i] of turnsIdx.slice(-6)) console.log('idx', i, 'seq', e.seq, e.type, JSON.stringify(e.data));
