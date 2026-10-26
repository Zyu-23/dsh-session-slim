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
const wanted = ['permission/preset','sandbox/mode','approval/policy','approval/asked','approval/decided','session/end-seed','command/run','command/done'];
for (const ty of wanted) {
  const evs = events.filter(e => e.type === ty);
  console.log('=== ' + ty + ' (' + evs.length + ') ===');
  for (const e of evs) console.log('  seq', e.seq, JSON.stringify(e.data).slice(0, 200));
}
