const fs = require('fs');
const zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
const starts = [];
for (let i = 0; i <= buf.length - 4; i++) if (buf[i] === 0x28 && buf[i+1] === 0xb5 && buf[i+2] === 0x2f && buf[i+3] === 0xfd) starts.push(i);
const events = [];
for (let k = 0; k < starts.length; k++) {
  const s = starts[k], e = k + 1 < starts.length ? starts[k+1] : buf.length;
  for (const line of zlib.zstdDecompressSync(buf.subarray(s, e)).toString('utf8').split('\n')) { const t = line.trim(); if (t) events.push(JSON.parse(t)); }
}
// 摘要全文
const sum = events.find(e => e.type === 'compaction/summary');
console.log('=== compaction/summary text ===');
console.log(sum.data.summary.map(b => b.text).join('\n').slice(0, 6000));

// 按 turn 分组统计大小
const turns = [];
let cur = null;
for (const e of events) {
  if (e.type === 'turn/start') { cur = { turn: e.data.turn, startSeq: e.seq, startIdx: events.indexOf(e), bytes: 0 }; }
  if (cur) cur.bytes += JSON.stringify(e).length;
  if (e.type === 'turn/end' && cur) { cur.endSeq = e.seq; turns.push(cur); cur = null; }
}
console.log('\n=== turns:', turns.length, '=== last 60 turn sizes (KB) ===');
for (const t of turns.slice(-60)) console.log('turn', t.turn, 'seq', t.startSeq + '..' + t.endSeq, (t.bytes / 1024).toFixed(1) + 'KB');
console.log('total last 60 turns KB:', (turns.slice(-60).reduce((a, t) => a + t.bytes, 0) / 1024).toFixed(1));
console.log('total last 100 turns KB:', (turns.slice(-100).reduce((a, t) => a + t.bytes, 0) / 1024).toFixed(1));
console.log('total last 150 turns KB:', (turns.slice(-150).reduce((a, t) => a + t.bytes, 0) / 1024).toFixed(1));
console.log('total all turns KB:', (turns.reduce((a, t) => a + t.bytes, 0) / 1024).toFixed(1));
