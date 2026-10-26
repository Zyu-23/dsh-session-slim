// 生成瘦身版 session.v4.jsonl.zstd
// 用法: node/electron-as-node rewrite.cjs <in.zstd> <out.zstd> <keepTurns>
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const IN = process.argv[2];
const OUT = process.argv[3];
const K = Number(process.argv[4] || 60);
const logicalHeader = (h) => { const c = { ...h }; delete c.type; return c; };

// asar 路径：优先读环境变量 DSH_ASAR，否则按 %LOCALAPPDATA% 自动拼装（不写死用户名，对外可直接分发）
const ASAR = process.env.DSH_ASAR
  || ((process.env.LOCALAPPDATA || '') + '\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules');
const CHK = { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } };

function readFrames(file) {
  const buf = fs.readFileSync(file);
  const starts = [];
  for (let i = 0; i <= buf.length - 4; i++) if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) starts.push(i);
  const lines = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k], e = k + 1 < starts.length ? starts[k + 1] : buf.length;
    const text = zlib.zstdDecompressSync(buf.subarray(s, e)).toString('utf8');
    for (const line of text.split('\n')) { const t = line.trim(); if (t) lines.push(t); }
  }
  return lines;
}

(async () => {
  const lines = readFrames(IN);
  const objs = lines.map((l) => JSON.parse(l));
  const header = objs.find((e) => e.type === 'session');
  const events = objs.filter((e) => e.type !== 'session');
  console.log('loaded events:', events.length);

  const turnStarts = events.filter((e) => e.type === 'turn/start');
  const startTurnStart = turnStarts[turnStarts.length - K];
  const keepFrom = startTurnStart.seq;
  console.log('keep from seq', keepFrom, 'turn', startTurnStart.data.turn, 'keeping', K, 'turns');

  let kept = events.filter((e) => e.seq >= keepFrom);
  const endSeeds = kept.filter((e) => e.type === 'session/end-seed');
  // 删掉有状态的收件箱操作日志与后台任务日志（非模型可见，重放会因前缀被裁而失败/无用）
  kept = kept.filter((e) => e.type !== 'agent/inbox/spliced' && e.type !== 'job/registered' && e.type !== 'job/settled');
  kept = kept.filter((e) => e.type !== 'session/end-seed');
  kept.push(endSeeds[endSeeds.length - 1]); // 只保留最后一个 end-seed

  // 旧 turn -> 新 turn 映射 (1..K)
  const turnMap = new Map();
  turnStarts.slice(-K).forEach((t, i) => turnMap.set(t.data.turn, i + 1));
  const t0 = kept[0].time;

  // 构造摘要 user/message
  const summaryEvent = events.find((e) => e.type === 'compaction/summary');
  const summaryText = summaryEvent.data.summary.map((b) => b.text).join('\n');
  const checkpointText =
    'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.\n\n' +
    '<compacted-summary>\n' + summaryText + '\n</compacted-summary>\n\n' +
    '（以上是更早对话的摘要；之后的聊天原文保留在下面。原始聊天已在备份中留档。）';
  const uuid = () => crypto.randomUUID();
  const summaryUser = {
    type: 'user/message', seq: -1, time: t0,
    data: {
      content: [{ type: 'text', text: checkpointText }],
      source: { kind: 'user', rpcId: uuid(), clientTimeZone: 'Asia/Shanghai' },
      role: 'user', id: uuid(),
    },
    surfaceOp: 'append',
  };

  // 系统提示：复制最后一条 system/message 的 message
  const lastSys = events.filter((e) => e.type === 'system/message').at(-1);
  const sysEvent = {
    type: 'system/message', seq: -1, time: t0,
    data: { turn: 1, step: 1, message: JSON.parse(JSON.stringify(lastSys.data.message)) },
    surfaceOp: 'append',
  };

  // 在第一个 step/start 之后插入 system + 摘要
  // 先抢救最新权限/沙箱/审批状态事件（放最前，恢复后保持 danger-full-access / never）
  const stateTypes = ['permission/preset', 'sandbox/mode', 'approval/policy'];
  const stateEvents = stateTypes.map((ty) => events.filter((e) => e.type === ty).at(-1)).filter(Boolean);
  const out = [];
  for (const s of stateEvents) out.push(s);
  let inserted = false;
  for (const e of kept) {
    out.push(e);
    if (!inserted && e.type === 'step/start') {
      out.push(sysEvent, summaryUser);
      inserted = true;
    }
  }
  if (!inserted) throw new Error('no step/start found to anchor insertion');

  // 重映射 turn 编号 + seq（插入事件的 turn 已是新编号，跳过）
  for (const e of out) {
    if (e.data && typeof e.data.turn === 'number' && e.seq >= 0) {
      if (!turnMap.has(e.data.turn)) throw new Error('turn ' + e.data.turn + ' not in map for ' + e.type + ' seq ' + e.seq);
      e.data.turn = turnMap.get(e.data.turn);
    }
  }
  const oldToNew = new Map();
  out.forEach((e, i) => { oldToNew.set(e.seq, i); e.seq = i; });

  // 重映射引用
  const remap = (x) => (oldToNew.has(x) ? oldToNew.get(x) : undefined);
  for (const e of out) {
    if (e.sourceEventSeqs !== undefined) {
      const arr = Array.isArray(e.sourceEventSeqs) ? e.sourceEventSeqs : [e.sourceEventSeqs];
      const mapped = arr.map(remap).filter((v) => v !== undefined);
      if (mapped.length === 0) delete e.sourceEventSeqs;
      else e.sourceEventSeqs = mapped;
    }
    if (e.data) {
      if (Array.isArray(e.data.messageSeqs)) {
        const mapped = e.data.messageSeqs.map(remap).filter((v) => v !== undefined);
        e.data.messageSeqs = mapped;
      }
      if (typeof e.data.headerSeq === 'number') {
        const m = remap(e.data.headerSeq);
        if (m === undefined) throw new Error('dangling headerSeq ' + e.data.headerSeq + ' in ' + e.type);
        e.data.headerSeq = m;
      }
    }
  }

  // ============ 校验 ============
  const v34 = await import(pathToFileURL(ASAR + '\\@deepseek-ai\\dsh-session-format-v3-to-v4\\lib\\index.js').href);
  const ses = await import(pathToFileURL(ASAR + '\\@deepseek-ai\\dsh-session\\lib\\index.js').href);
  const KNOWN = ses.KNOWN_SESSION_EVENT_TYPES;
  const unknown = out.filter((e) => !KNOWN.has(e.type)).map((e) => e.type);
  if (unknown.length) throw new Error('unknown event types: ' + [...new Set(unknown)].join(','));

  v34.assertReleasedV4Header(logicalHeader(header));
  for (const e of out) v34.assertV4RowAdmission(e, KNOWN);
  v34.assertReleasedV4Relationships({ header: logicalHeader(header), events: out, inheritedEventCount: 0 }, KNOWN);
  console.log('VALIDATION PASS: header/row/relationship');

  // ============ 编码 ============
  const headerFrame = zlib.zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n', 'utf8'), CHK);
  const parts = [headerFrame];
  const BATCH = 100;
  for (let i = 0; i < out.length; i += BATCH) {
    const text = out.slice(i, i + BATCH).map((e) => JSON.stringify(e) + '\n').join('');
    parts.push(zlib.zstdCompressSync(Buffer.from(text, 'utf8'), CHK));
  }
  fs.writeFileSync(OUT, Buffer.concat(parts));

  // ============ 回读自检 ============
  const back = readFrames(OUT);
  if (back.length !== out.length + 1) throw new Error('readback line count mismatch: ' + back.length);
  if (JSON.parse(back[0]).type !== 'session') throw new Error('first line is not header');
  for (let i = 0; i < out.length; i++) if (JSON.parse(back[i + 1]).seq !== i) throw new Error('seq mismatch at ' + i);
  const stats = { inBytes: fs.statSync(IN).size, outBytes: fs.statSync(OUT).size, events: out.length, turns: K };
  console.log('WROTE', OUT, JSON.stringify(stats), 'typeCount:');
  const tc = {};
  for (const e of out) tc[e.type] = (tc[e.type] || 0) + 1;
  console.log(JSON.stringify(tc));
})().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; });
