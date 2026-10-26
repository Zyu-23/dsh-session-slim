// 用 DSH 自己的 V4 codec 解码 + restoreReleasedV4Artifact 校验生成的文件
const fs = require('fs');
const zlib = require('zlib');
const { pathToFileURL } = require('node:url');
const ASAR = process.env.DSH_ASAR
  || ((process.env.LOCALAPPDATA || '') + '\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules');

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

(async () => {
  const file = process.argv[2];
  const lines = readFrames(file);
  const rows = lines.map((l) => JSON.parse(l));
  const header = rows[0];
  const events = rows.slice(1);
  const v34 = await import(pathToFileURL(ASAR + '\\@deepseek-ai\\dsh-session-format-v3-to-v4\\lib\\index.js').href);
  const ses = await import(pathToFileURL(ASAR + '\\@deepseek-ai\\dsh-session\\lib\\index.js').href);
  const KNOWN = ses.KNOWN_SESSION_EVENT_TYPES;
  const codec = v34.releasedV4SessionFormatCodec;
  console.log('codec keys:', Object.keys(codec || {}));
  const logicalHeader = { ...header }; delete logicalHeader.type;
  // 走与读取器一致的完整校验
  const artifact = v34.restoreReleasedV4Artifact({ header: logicalHeader, events, inheritedEventCount: 0 }, KNOWN);
  console.log('restoreReleasedV4Artifact PASS; events:', artifact.events.length, 'first seq:', artifact.events[0].seq, 'last seq:', artifact.events.at(-1).seq);
  // 检查第一帧单行
  const buf = fs.readFileSync(file);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const first = buf.indexOf(magic);
  const second = buf.indexOf(magic, first + 4);
  const firstFrame = zlib.zstdDecompressSync(buf.subarray(first, second)).toString('utf8');
  console.log('first frame exactly one header line:', firstFrame.trim().split('\n').length === 1, '| type:', JSON.parse(firstFrame.trim()).type);
})().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; });
