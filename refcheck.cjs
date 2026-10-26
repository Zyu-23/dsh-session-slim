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
for (const e of kept) {
  if (e.type === 'developer/message') console.log('developer/message', e.seq, 'headerSeq=', e.data.headerSeq, 'keys=', Object.keys(e.data));
  if (e.type === 'request/header') console.log('request/header', e.seq, 'turn=', e.data.turn);
  if (e.type === 'session/title') console.log('title', e.seq, JSON.stringify(e.data).slice(0, 200));
  if (e.type === 'system/message') console.log('system', e.seq, 'turn/step=', e.data.turn, e.data.step, 'op=', JSON.stringify(e.surfaceOp));
}
// 检查所有 sourceEventSeqs 引用是否指向保留区间内
let bad = 0, refs = 0;
const keptSeqs = new Set(kept.map(e => e.seq));
for (const e of kept) {
  const s = e.sourceEventSeqs;
  if (s) {
    const arr = Array.isArray(s) ? s : (Array.isArray(s[0]) ? s.flat() : [s]);
    for (const x of arr) { refs++; if (!keptSeqs.has(x)) { bad++; console.log('DANGLING ref', e.seq, e.type, x); } }
  }
}
console.log('refs:', refs, 'dangling:', bad);
// 检查事件里的其他 seq 引用字段
const seqFields = new Set();
for (const e of kept) for (const k of Object.keys(e.data || {})) if (k.toLowerCase().includes('seq')) seqFields.add(k);
console.log('data keys containing seq:', [...seqFields]);
