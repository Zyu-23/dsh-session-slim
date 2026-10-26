// 模拟 surface 折叠，查看模型将看到的消息序列
const fs = require('fs');
const zlib = require('zlib');
function readFrames(file) {
  const buf = fs.readFileSync(file);
  const starts = [];
  for (let i = 0; i <= buf.length - 4; i++) if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) starts.push(i);
  const lines = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k], e = k + 1 < starts.length ? starts[k + 1] : buf.length;
    for (const line of zlib.zstdDecompressSync(buf.subarray(s, e)).toString('utf8').split('\n')) { const t = line.trim(); if (t) lines.push(t); }
  }
  return lines;
}
const file = process.argv[2];
const rows = readFrames(file).map((l) => JSON.parse(l));
const events = rows.slice(1);
const surfaceTypes = new Set(['system/message', 'user/message', 'developer/message', 'assistant/message', 'tool/result']);
const msgs = [];
for (const e of events) {
  if (!surfaceTypes.has(e.type)) continue;
  if (e.surfaceOp !== 'append') continue;
  const m = e.type === 'user/message' ? e.data : e.data.message;
  msgs.push({ type: e.type, seq: e.seq, msg: m });
}
let chars = 0;
for (const { type, msg } of msgs) {
  const text = JSON.stringify(msg).length;
  chars += text;
}
console.log('messages:', msgs.length, 'approx chars:', chars, 'approx tokens:', Math.round(chars / 4));
console.log('first 8 messages:');
for (const m of msgs.slice(0, 8)) {
  const txt = m.msg.content.map((b) => (b.type === 'text' ? b.text : '[' + b.type + ']')).join(' ').slice(0, 160).replace(/\n/g, '\\n');
  console.log(' ' + m.seq, m.type, 'role=' + m.msg.role, '|', txt);
}
console.log('last 4 messages:');
for (const m of msgs.slice(-4)) {
  const txt = m.msg.content.map((b) => (b.type === 'text' ? b.text : '[' + b.type + ']')).join(' ').slice(0, 120).replace(/\n/g, '\\n');
  console.log(' ' + m.seq, m.type, 'role=' + m.msg.role, '|', txt);
}
