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
const pick = (pred) => events.filter(pred);
const show = (title, ev, max = 1200) => {
  console.log('\n=== ' + title + ' ===');
  console.log(JSON.stringify(ev, null, 1).slice(0, max));
};
show('last system/message', pick(e => e.type === 'system/message').at(-1), 800);
show('last user/message (12118)', events.find(e => e.seq === 12118), 900);
show('last assistant/message (12136)', events.find(e => e.seq === 12136), 900);
show('last tool/result (12133)', events.find(e => e.seq === 12133), 900);
show('last session/title (11546)', events.find(e => e.seq === 11546), 400);
show('last end-seed (12140)', events.find(e => e.seq === 12140), 300);
show('last request/header', pick(e => e.type === 'request/header').at(-1), 1500);
show('last request/context', pick(e => e.type === 'request/context').at(-1), 500);
show('a tool/call (12130)', events.find(e => e.seq === 12130), 700);
show('compaction/summary 9136', events.find(e => e.seq === 9136), 600);
console.log('\nrequest/header seqs:', JSON.stringify(pick(e => e.type === 'request/header').map(e => e.seq)));
console.log('request/context seqs:', JSON.stringify(pick(e => e.type === 'request/context').map(e => e.seq)));
console.log('developer/message seqs:', JSON.stringify(pick(e => e.type === 'developer/message').map(e => e.seq)));
console.log('agent/inbox/spliced last seq:', pick(e => e.type === 'agent/inbox/spliced').at(-1)?.seq);
console.log('job events last seq:', pick(e => e.type.startsWith('job/')).at(-1)?.seq);
console.log('with delivery field:', events.filter(e => e.delivery !== undefined).length);
console.log('with ignorable:', events.filter(e => e.ignorable !== undefined).length);
