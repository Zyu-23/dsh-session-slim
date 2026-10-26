# DSH 会话上下文瘦身工具包（Session Slim Kit）
注意：这只是解决上下文问题，记忆插件需要额外安装，否则上下文消失后，还是会忘记所有东西。
对 DeepSeek Harness（DSH）desktop 的会话日志做**物理瘦身**（删除旧历史、保留摘要+最近 N 轮）的离线工具集。
配套完整原理文档见仓库/发行包内的《DSH 会话上下文瘦身完整报告》。

> ⚠️ 这是一套"离线手术刀"，不是日常工具。**日常长会话优先用官方 `/compact`**；只有当会话文件过大、想彻底瘦身时才用它。

---

## 1. 环境要求

- **Windows**（脚本以 Windows 为例，Linux/macOS 思路相同、命令需替换）
- **DSH desktop** 已安装
- **Node.js 24**（直接用 DSH 自带的 Electron 跑，无需另装）

运行方式（PowerShell）：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "<DSH安装目录>\DeepSeek Harness.exe" --expose-internals .\rewrite.cjs <in.zstd> <out.zstd> <K>
```

> 脚本通过 asar 加载 DSH 自己的校验模块：
> - 默认路径：`%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules`
> - 可用环境变量覆盖：`$env:DSH_ASAR = "<自定义 app.asar 下 node_modules 路径>"`

---

## 2. 脚本清单

| 脚本 | 用途 | 用法 |
|---|---|---|
| `analyze.cjs` | 帧数、事件类型分布、seq 范围 | `analyze.cjs <session.v4.jsonl.zstd>` |
| `turnstats.cjs` | 按 turn 分组的体积统计 | `turnstats.cjs <file> <K>` |
| `keptstats.cjs` | 观察"保留最近 K 轮"时区间内的事件分布 | `keptstats.cjs <file> <K>` |
| `stateevents.cjs` | 定位权限/沙箱/审批等**状态事件** | `stateevents.cjs <file>` |
| `refcheck.cjs` | 检查 `sourceEventSeqs`/`messageSeqs`/`headerSeq` 引用是否悬空 | `refcheck.cjs <file> <K>` |
| `samples.cjs` | 抽样各类事件的完整 JSON 结构 | `samples.cjs <file>` |
| `byday.cjs` | user/message 按天分布（估算删减影响） | `byday.cjs <file>` |
| `overview.cjs` | 头部/尾部/surfaceOp/compaction 概览 | `overview.cjs <file>` |
| `tail.cjs` | 尾部事件、最近 turn 边界 | `tail.cjs <file>` |
| `rewrite.cjs` | **核心**：裁剪 + 重排 + 校验 + 写回 | `rewrite.cjs <in.zstd> <out.zstd> <K>` |
| `derive-check.cjs` | 模拟 surface 折叠，看模型实际会收到的消息 | `derive-check.cjs <file>` |
| `codec-check.cjs` | 用 DSH 自己的 `restoreReleasedV4Artifact` 做完整校验 | `codec-check.cjs <file>` |

---

## 3. 标准工作流（六步）

### 第一步：备份（永远先做）

```powershell
Copy-Item <session.v4.jsonl.zstd> .\backup\session.v4.jsonl.zstd.orig
Copy-Item <session_projcache.json> .\backup\session_projcache.json.orig
Copy-Item <retired-sessions.json> .\backup\retired-sessions.json.orig
(Get-FileHash <session.v4.jsonl.zstd> -Algorithm SHA256).Hash
```

### 第二步：分析

```powershell
analyze.cjs   <file>          # 类型分布、seq 是否连续
turnstats.cjs <file> 60       # 最近 60 轮占多大
stateevents.cjs <file>        # 权限状态事件在哪（后面要抢救）
refcheck.cjs  <file> 60       # 保留区间引用是否完整
```

### 第三步：生成

```powershell
rewrite.cjs <in.zstd> <out.zstd> 60
```

脚本会：按 turn 边界裁剪 → 删运行时日志（spliced/job）→ 抢救状态事件 → 插入 system+摘要 → 重排 turn/seq → 重映射引用 → **内置校验** → 写回。

### 第四步：校验（双重）

```powershell
codec-check.cjs <out.zstd>    # restoreReleasedV4Artifact 完整校验
derive-check.cjs <out.zstd>   # 看模型将看到的消息序列
```

两者都 PASS 才算格式有效。

### 第五步：释放写入窗口 + 替换

会话文件被插件常驻持有，直接替换会被覆盖。二选一：

**A. `/new` 切走（DSH 不重启）**
1. 在聊天端发 `/new`（让插件释放旧会话，旧会话进"可切换"列表）；
2. 替换文件 + 移走投影缓存；
3. 发 `/session <序号>` 切回（插件重新读瘦身版）。

**B. 重启 DSH**
1. 退出 DSH → 替换文件 + 移走投影缓存 → 重新打开。

> ⚠️ 两种方式都要**移走** `session_projcache/sessions/<id>.json`，否则旧水位会让投影跳过事件。
> ⚠️ 若 `/session` 切回失败，会话会被 hard-retire，需要修 `retired-sessions.json` + 重启（详见完整报告坑 6）。

### 第六步：验证 + 回滚

验证：投影缓存被重建、`permissions` 值正确、`inbox` 为空、`sessionStats.turns` 正确。
回滚：把备份的 `.orig` 复制回去 + 移走新缓存 + 重启 DSH。

---

## 4. 必读注意事项（浓缩版）

1. **只按整段 turn 裁剪**，绝不单独删 `step/start` 等结构事件；
2. **`agent/inbox/spliced` 必须整类删光**（有状态日志，重放会报 `invalid inbox splice`）；
3. **抢救最新一条** `permission/preset`、`sandbox/mode`、`approval/policy`，否则权限回退默认；
4. **必须移走投影缓存**（`session_projcache`），否则状态错乱；
5. 替换前确认会话**没有活跃写入**（用 `/new` 或重启）；
6. **备份先行，留足回滚点**；
7. 不同 DSH 版本的会话格式/校验规则可能变化，操作前确认 `SESSION_FORMAT_VERSION`。

完整原理与 9 个坑的详细说明见配套报告。

---

## 5. 为什么不用官方 `/compact`？

- 官方 compression 是**替换（replace）**：遮蔽旧历史，但**不删除原事件**，文件只增不减；
- 本工具是**物理裁剪**：删除旧事件、重排 seq、重写文件，文件真正变小；
- 日常长会话用 `/compact` 更安全；本工具适用于"文件已经很大、想彻底瘦身"的场景。

---

## 6. 免责声明

本工具直接改写 DSH 会话日志，**操作前必须备份**。作者不对误操作导致的数据丢失负责；请先在备份副本上演练，确认 `codec-check` PASS 后再替换真实文件。

---

*Session Slim Kit v1.0*
