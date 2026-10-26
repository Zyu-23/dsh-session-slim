// 分析 session.v4.jsonl.zstd 的帧结构、事件类型分布、seq 范围、turn/step 情况
const fs = require('fs');
const zlib = require('zlib');

const FILE = process.argv[2];
const buf = fs.readFileSync(FILE);

// 切帧：magic 28 B5 2F FD
const frames = [];
let pos = 0;
while (pos < buf.length) {
  const idx = buf.indexOf(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), pos);
  if (idx < 0) break;
  frames.push(idx);
  pos = idx + 4;
}
const spans = frames.map((s, i) => [s, i + 1 < frames.length ? frames[i + 1] : buf.length]);

let totalLines = 0;
const typeCount = {}, typeBytes = {};
const events = [];
let decompressedBytes = 0;
for (const [s, e] of spans) {
  const raw = zlib.zstdDecompressSync(buf.subarray(s, e));
  decompressedBytes += raw.length;
  const text = raw.toString('utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let ev;
    try { ev = JSON.parse(t); } catch (err) { console.log('PARSE_FAIL frame', s, line.slice(0, 120)); continue; }
    totalLines++;
    const ty = ev.type || '(no-type)';
    typeCount[ty] = (typeCount[ty] || 0) + 1;
    typeBytes[ty] = (typeBytes[ty] || 0) + t.length;
    events.push(ev);
  }
}

console.log('file bytes:', buf.length, ' frames:', spans.length, ' decompressed bytes:', decompressedBytes, ' lines:', totalLines);
const seqs = events.filter(e => typeof e.seq === 'number').map(e => e.seq);
console.log('seq range:', Math.min(...seqs), '..', Math.max(...seqs), ' count:', seqs.length, ' unique:', new Set(seqs).size);
const gaps = [];
const sorted = [...new Set(seqs)].sort((a, b) => a - b);
for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) gaps.push([sorted[i - 1], sorted[i]]);
console.log('seq gaps:', JSON.stringify(gaps.slice(0, 20)), gaps.length > 20 ? `(+${gaps.length - 20} more)` : '');

console.log('\n=== event types (count, chars) ===');
Object.entries(typeCount).sort((a, b) => typeBytes[b[0]] - typeBytes[a[0]]).forEach(([ty, c]) => {
  console.log(`${ty.padEnd(42)} ${String(c).padStart(6)}  ${(typeBytes[ty] / 1024 / 1024).toFixed(2)} MB`);
});
