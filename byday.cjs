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
const day = (ms) => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
const byDay = {};
for (const e of events) {
  if (e.type !== 'user/message') continue;
  const d = day(e.time);
  byDay[d] = (byDay[d] || 0) + 1;
}
console.log('user/message 按天分布：');
for (const [d, c] of Object.entries(byDay).sort()) console.log('  ' + d + '  ' + c + ' 条');
console.log('总计 user/message：', events.filter(e => e.type === 'user/message').length);
console.log('时间范围：', day(events[0].time), '→', day(events.at(-1).time));
