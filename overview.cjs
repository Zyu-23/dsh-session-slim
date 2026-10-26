const fs = require('fs');
const zlib = require('zlib');
const FILE = process.argv[2];
const buf = fs.readFileSync(FILE);
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
for (let i = 0; i <= buf.length - 4; i++) if (buf[i] === 0x28 && buf[i+1] === 0xb5 && buf[i+2] === 0x2f && buf[i+3] === 0xfd) starts.push(i);
const events = [];
for (let k = 0; k < starts.length; k++) {
  const s = starts[k], e = k + 1 < starts.length ? starts[k+1] : buf.length;
  const text = zlib.zstdDecompressSync(buf.subarray(s, e)).toString('utf8');
  for (const line of text.split('\n')) { const t = line.trim(); if (!t) continue; events.push(JSON.parse(t)); }
}
const header = events.find(e => e.type === 'session');
console.log('=== HEADER ===');
console.log(JSON.stringify(header, null, 1).slice(0, 2000));

const sur = {};
let withSource = 0, withReplace = 0;
for (const e of events) {
  const k = e.surfaceOp || '(none)';
  sur[k] = (sur[k] || 0) + 1;
  if (e.sourceEventSeqs) withSource++;
  if (e.surfaceOp === 'replace') withReplace++;
}
console.log('surfaceOp:', JSON.stringify(sur), 'withSourceEventSeqs:', withSource, 'replace:', withReplace);

const repl = events.filter(e => e.surfaceOp === 'replace');
console.log('\n=== replace events (seq, type, target) ===');
for (const r of repl.slice(-15)) console.log(r.seq, r.type, JSON.stringify(r.sourceEventSeqs)?.slice(0, 200));

const comp = events.filter(e => e.type.startsWith('compaction/'));
console.log('\n=== compaction events ===');
for (const c of comp) console.log(c.seq, c.type, JSON.stringify(c.data)?.slice(0, 160));

const turns = events.filter(e => e.type === 'turn/start');
console.log('\nturns:', turns.length, 'last turn start seq:', turns.at(-1)?.seq, 'turnId:', turns.at(-1)?.data?.turn);
const last = events.at(-1);
console.log('last event:', JSON.stringify(last)?.slice(0, 400));
const sys = events.filter(e => e.type === 'system/message');
console.log('system/message seqs:', JSON.stringify(sys.map(e => e.seq)));
const ttl = events.filter(e => e.type === 'session/title');
console.log('title events:', JSON.stringify(ttl.map(e => ({ seq: e.seq, d: e.data }))).slice(0, 500));
