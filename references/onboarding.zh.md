# 入驻问诊手册 · onboarding

AI 首次在一个项目中启用 indie-keeper 时执行。问完把答案写成 `keeper-profile.json`，放在项目根目录。

## 问诊三规矩

1. **分批问，别审讯。** 初次见面只问"全局四问"；之后建哪间房间才问哪间的问题。一次抛出的问题不超过 4 个。
2. **每个问题带建议和推荐。** 用户（尤其独游新人）往往不知道"别人一般怎么做"。问法必须是：建议常见做法 → 给出推荐默认值 → 请用户选。用户说"你定"就用推荐值并在 profile 里标注 `"decidedBy": "default"`。
3. **答案要存下来。** 全部写进 `keeper-profile.json`。已答过的问题永不重复问；用户想改，直接改档案（或让 AI 改）。

## 初次见面 · 全局四问

### 问 1 · 团队与分工

> 这个项目几个人？谁管什么？（一个人也是答案）

**为什么问**：决定档案室是否需要"权威归属"标注——某些领域（世界观/美术/剧情）归特定的人拍板，AI 只组织和实现，不自由发挥。也决定反馈来源标签有哪些人。

**科普**：单人项目最常见；2-3 人小团队一般按"设定/美术归 A，代码/工程归 B"划线。混合团队（人 + 多个 AI 角色）建议把 AI 也当团队成员登记，职责写清。

### 问 2 · 想法大倒仓 ⭐

> 现在脑子里、聊天记录里、备忘录里有哪些想法、计划、已经定下的事？**全部倒出来，乱的也没关系，我来分拣。**

**为什么问**：这是入驻仪式的核心环节。AI 的第一份劳动是把这锅粥分拣成三类：
- 💡 还没定的小想法 → 意见箱（status=idea）
- 📋 已排期的计划 → ROADMAP 对应版本
- ✅ 已确认的设定/决定 → 档案室建档登记

**分拣准则** —— 对每条东西只问一个问题：*用户决定了没有？*

| 桶 | 信号 | 例子 |
|----|------|------|
| ✅ 已确认 | 用户已采纳为设定/决定——它现在是事实 | "主角叫 Lila"、"引擎用 Godot 4" |
| 📋 计划 | 用户已决定**要做**，且有版本目标（哪怕粗略） | "v0.4 加双跳"、"下个补丁修存档 bug" |
| 💡 想法 | 其他一切——用户还在琢磨、没拍板的念头 | "要不加个双跳？"、"主角我在想叫 Lila 还是 Lily"、"考虑加个昼夜循环" |

边界情况：
- "我想加 X" 但没说哪个版本 → 💡 想法（决定想要，但还没决定去做）
- "X 已经做了"（过去时）→ ✅ 已确认（已经发出来了，是现实）
- "X 在设计文档里" → ✅ 已确认（已经采纳为设定）
- "X 放 v0.5" → 📋 计划
- "X 看情况" / "我在想……" / "要不要……" → 💡 想法

拿不准时，问用户"这个是定下来了，还在想？"——别猜。把已确认的设定错分成想法，AI 日后可能"好心"去改它；把想法错分成已确认，会把用户没拍板的东西固化下来。两种错都很贵。

**分拣完必须向用户展示分拣结果清单，请用户核对**。这一步的整理成果就是这套系统价值的第一次证明。

### 问 3 · 发布平台

> 游戏打算发哪些平台？（itch.io / Steam / 手机 / 网页 / 还没想好）

**为什么问**：决定发货口要同步哪些文件的版本号（如 Android 的 build.gradle）、文档翻译部要不要管商店页文案、发布流程管到哪一步。

**科普**：独游首发最常见的是 itch.io（零门槛）；Steam 有一次性入驻费、要准备商店页多语言素材；"还没想好"完全合法——发货口可以后建。

### 问 4 · 仓库形态

> 代码仓库是什么形式？

**科普三种常见做法**：
- **单仓私有**：商业游戏最常见，发布靠 CI 出包。多数单人项目从这里开始就够。（推荐默认）
- **单仓公开**：开源游戏，代码即宣传，issue 区就是反馈箱的一部分。
- **双仓并行**：私有仓日常开发，公开仓只放发布版。适合"代码想保密但项目想有公开门面"。维护成本最高。

## 菜单拍板 · 要装哪些

全局四问之后，**依次摆出三组菜单**（每组一次问完，一次不超过 4 个问题）。每个条目带一句话"解决什么"+ 推荐默认。用户圈要哪些；答案写进 `keeper-profile.json`。关掉的条目：AI 之后不再推销，CLI 不显示对应命令，关联逻辑优雅降级（见下面的[兼容性说明](#兼容性说明)）。

这是**保持项目精简最关键的一步**——indie-keeper 共有 7 个房间 + 7 个骨架文档 + 2 项规范，但多数项目只需要其中一部分。把整套强塞给一个一人项目就违背初衷了。

### 菜单 A · 房间（7 项，一次多选）

> 要装哪些房间？每个房间独立——只装能解决真实痛点的。

| 房间 | 解决什么 | 默认 |
|------|--------|---------|
| **档案室** | "这个设定写在哪个文件？" / AI 乱改文档 | ✅ 开 |
| **意见箱** | 反馈蒸发 / 计划只活在脑子里 | ✅ 开 |
| **WIKI** | 文档多到看不过来 / 守则文件散落 | ✅ 开 |
| **文档翻译部** | 源文改了，译文没跟上 | ⬜ 关（有本地化计划才开） |
| **游戏文案部** | 游戏内文案硬编码 / 术语不统一 | ⬜ 关（有本地化计划才开） |
| **发货口** | 版本号漂移 / 验收靠口头 | ✅ 开（首次正式发布前备好） |
| **调度室** | "这个什么时候发？" / 没日期的计划悄悄滑 | ⬜ 关（版本有目标日期时再接入） |

答案写进 profile 的 `rooms.*`。关掉的房间：AI 不推销；之后用户撞到对应痛点时，提一次让用户决定要不要开。

### 菜单 B · 项目骨架文档（7 项，一次多选）

> 在项目根 / `docs/` 下建哪些骨架文档？每个都是一次性起稿，让新人不用 grep 全仓库就能定位。

| 文档 | 用途 | 默认 |
|-----|---------|---------|
| **AGENTS.md**（根） | AI 员工手册（技术栈、约定、坑） | ✅ 开（必建——任何接手项目的 AI 都先读它） |
| **START-HERE.md**（根） | 给人看的入口页（进展、待办、文档地图） | ✅ 开（README 已经在做这事就关，`startHere.enabled: false`） |
| **docs/PLAN.md** | 当前 + 下个 sprint 任务清单 | ✅ 开 |
| **docs/PROGRESS.md** | 时间倒序的进展流水账 | ✅ 开 |
| **docs/DOCS-OVERVIEW.md** | 仓库文档地图 + 建议读顺序 | ✅ 开 |
| **docs/ARCHITECTURE.md** | 技术架构（模块 / 数据流 / 决策） | ✅ 开 |
| **docs/UIUX-SPEC.md** | UI/UX 架构（设计系统 / 交互 / 可访问性） | ✅ 项目有 UI 就开；纯文字/CLI 关（`entryDocs.uiuxSpec: false`） |

答案写进 profile 的 `startHere.enabled` 和 `entryDocs.*`。关掉的文档：不建，后续 session 不再推销。

### 菜单 C · 通用规范（2 项，建立并记录）

> 这两个不是开关——是 AI 在问诊时建立、写进 `AGENTS.md` 的规范。跟用户确认一下，让他知道会发生什么。

| 规范 | AI 做什么 | 默认 |
|------------|------------------|---------|
| **文件布局** | 身份文档留根、状态文档进 `docs/`、脚本进 `scripts/`——引导用户走向干净的根目录 | ✅ 建立（文件夹名按项目框架调整） |
| **测试** | 按项目栈定命名 + 分层 + 维护规范，写进 `AGENTS.md` | ✅ 建立（纯文档项目无代码才跳过） |

这两个不写进 profile——是实践不是开关。AI 在问诊时建立，记录进 `AGENTS.md`。用户说"跳过测试规范"就不写那段。

### 兼容性说明

关掉的房间/文档会优雅降级：
- **房间关掉**：CLI 不列该房间的命令；`keeper hello` 不显示它的状态；房间手册在 `references/` 里仍可读，但 AI 不推销。
- **START-HERE 关掉**（`startHere.enabled: false`）：问诊不建该文件；`keeper hello` 跳过过期提醒；`keeper start-here refresh` 优雅报错"START-HERE.md not found"；WIKI 仍会列出已存在的（只读）。
- **入口文档关掉**（`entryDocs.*: false`）：不建、不再推销。`keeper hello` 的"要维护的文档"段跳过它。如果之后手动建了，AI 登记进真相源但不唠叨。
- **调度室关但发货口开**：ROADMAP 正常工作；`keeper hello` 不显示调度状态；WIKI 甘特图缺失（不要求 schedule.js）。
- **PROGRESS 关掉**：`keeper hello` 跳过基于 PROGRESS 的过期检查；`keeper progress add` 优雅报错"PROGRESS.md not found —— 建一个或通过 entryDocs.progress 重新启用"。

## 建房间时的追加问诊

只在用户决定建对应房间时问。

### 建档案室时

- 项目已有哪些文档？（AI 自己先扫一遍 docs/、根目录 *.md、AGENTS.md/CLAUDE.md 等守则文件，列出盘点结果请用户确认，而不是让用户报菜名）
- 有没有"权威归属"要标注的领域？（问 1 已有分工的直接沿用确认）
- 缺哪些游戏设计文档？按 [game-docs-menu.md](game-docs-menu.md) 的"器官查表法"推荐——一次最多推 3 份、只建马上要写的、已有等价物就登记不新建。

### 建意见箱时

- 反馈来源有哪些人/渠道？（试玩朋友、社群、issue 区……决定 `from` 标签集）
- ROADMAP 用什么版本节奏分期？（建议：多数独游按 0.x 小步走，主题式命名如"v0.5 工坊大改"比日期式更适合无固定排期的项目）

### 建 WIKI 时

- 只本地自己看，还是要打包发给不装工具的合作者？（决定 serve/pack 哪个优先）

### 建文档翻译部时

- 源语言是什么？目标语言有哪些？
- 谁翻译？（建议：AI 全包→人抽查 是当前最常见做法；重要商店页建议人工终审。决定记指纹流程的严格度）
- 哪些文档不翻？（建议：LICENSE 法律文本保留原文是开源惯例）

### 建游戏文案部时（三连问，详见 [room-game-i18n.md](room-game-i18n.md)）

- **有多语言计划吗？** 没有/没想好 → 不建房间，但留一句忠告：文案尽量集中放、别散着写死在代码里——以后想翻时是搬家一天搞定还是全仓考古三星期，就看这个。
- **游戏内现在有多语言机制吗？** 已有 → 盘点接上（词典格式/位置/翻译函数），绝不推倒重来；没有 → 按引擎给推荐（手册里有各引擎惯例表）。
- **什么引擎/技术栈？** 决定词典格式（JSON/CSV/引擎托管）和扫描规则。
- 顺手起术语表：游戏里已经有哪些自造叫法？（比如行动资源不叫体力叫"灵魂"）→ 登记进 glossary.json，AI 之后写文案全按它来。

### 建发货口时

- 版本号写在哪些文件里？（AI 自己先扫：package.json / build.gradle / pyproject.toml / Godot export_presets / VERSION 文件……列出来请用户确认）
- 版本号节奏？（建议：正式上线前停在 0.x 是常见纪律，避免"1.0"心理负担；`blockMajor` 默认开）
- **Sprint 严格度**（`sprint.rigor`）：
  - `light`（推荐默认）：条目 = 标题 + 怎么验收，两个字段。
  - `strict`：全字段 + 敷衍词检查 + 接线检查。建议：AI 写代码占比高的项目建议 strict——专防"AI 说做完了，其实代码没接上"。
- **验收模式**（`review.mode`）：
  > 每条任务做完，谁来点头算数？
  - `self`：AI 自验（solo 快跑）
  - `peer`：一个 agent 干、另一个 agent 验
  - `human`：人点头才算（主观件多选这个）
  - `mixed`：小事 self、大事 human（推荐给多数真实项目）

  强调：这是默认流程不是门禁，临时想换随口说。
- **发布流水线**（`release.*`，可选——默认全关）：
  > 发版流程的哪些环节想让 CLI 帮忙？（可以一个都不选——全都是可选的。）
  - `preflight`：AI 在每个不可逆步骤前跑 `keeper release preflight commit/push/build`，拦下调试残留 / 凭证泄露 / 版本号漂移 / 翻译过期。（推荐默认开——便宜的保险。）
  - `changelog`：`keeper release changelog init/add/draft/cut/show` 维护一个 Keep a Changelog 格式的 `CHANGELOG.md`。（还没有 changelog 习惯的建议开。）
  - `autoVersion`：`keeper ver next` 从 conventional commits 自动算升级级别；`keeper ver bump`（不带参数）直接应用。（默认开——每次都手挑级别的可以关。）
  - `commitConvention`："提交要不要按 conventional commits 来（feat/fix/chore…）？"——默认 `conventional`，因为 `ver next` 就是按它解析的；项目有自己的提交风格就设 `freeform`。
  - `platforms`："要装哪几个平台的配置指引 + 模板？"（多选——`github` / `itch` / `steam`。默认一个都不装，选你真打算发的。）
    - GitHub：生成 `.github/workflows/release.yml` + `gh` CLI 指引。仓库在 GitHub、想 tag 触发构建的选。
    - itch.io：生成 `itch.toml` + butler 指引。独游首发选这个（零门槛）。
    - Steam：生成 `steam_upload.vdf` + steamcmd 指引。交了 Steamworks 入场费的再选。

  CLI 绝不直接调 `gh` / `butler` / `steamcmd`——只打印命令。不存任何凭据。

### 建调度室时

- 版本有目标日期吗？（建议：solo 项目往往抗拒定死日期——没关系，调度室能处理无日期版本，按顺序排。但如果有任何外部截止——参展、发行商里程碑、"积蓄花完之前"——写下来作为版本里程碑）
- 工期单位用什么？（推荐：天。别用故事点，除非用户已经在用——重点是诚实估工，不是搞敏捷仪式）
- 谁定日期？（solo：用户。团队：通常是 lead。这是默认不是门禁——之后谁都能改 schedule.json 调日期）

## 问诊后：创建 AGENTS.md + START-HERE.md + 核心入口文档

写完 `keeper-profile.json` 后，创建**七个文件**（用户在 `entryDocs` 里关掉的就跳过）。放哪遵循下面的[文件布局规范](#文件布局规范)——一句话：身份文档留根，状态文档进 `docs/`。

1. **`AGENTS.md`**（项目根）— AI 员工手册（技术栈、文件布局、约定、已知坑、边界）。任何接手这个项目的 AI 都先读它。完整规范见 [SKILL.md](../SKILL.md) 的"AI 守则文件（AGENTS.md）"段。约定变了、踩到新坑了就更新它，这是活文件。

2. **`START-HERE.md`**（项目根）— 给人看的入口页（最新进展、待办决策、文档地图、谁在干什么）。AGENTS.md 的给人看的对应物。完整规范见 [SKILL.md](../SKILL.md) 的"给人看的入口页（START-HERE.md）"段。每次接班都检查它——做了进展但 START-HERE.md 没更新的话，收工前更新它。**提到别的文档时用双链格式**（`[[ROADMAP]]`、`[[sprints/1]]`、`[[references/cli]]`）， WIKI 会渲染成可点的交叉链，反链面板也能抓到。用户不想要这页就在 profile 里设 `startHere.enabled: false`。

3. **`docs/PLAN.md`** — 当前 + 下个 sprint 任务清单。见 [SKILL.md](../SKILL.md) 的"核心入口文档"段。从 ROADMAP 第一个 `in-progress` 或 `planned` 版本拉任务起步。

4. **`docs/PROGRESS.md`** — 时间倒序的进展流水账。起步只一条："项目接入 indie-keeper"（日期 + 一行）。之后每发版 / 每 sprint 收尾都在顶部加一行。

5. **`docs/DOCS-OVERVIEW.md`** — 仓库全部文档地图 + 建议读顺序。从真相源登记表派生：每个登记主题一行。

6. **`docs/ARCHITECTURE.md`** — 技术架构（设计原则、文件布局、模块划分、数据流、关键决策）。从 Q4 + 各房间构建时发现的技术栈起稿。

7. **`docs/UIUX-SPEC.md`** — UI/UX 架构（设计原则、视觉系统、交互规范、信息架构、可访问性）。ARCHITECTURE.md 的界面侧对应物。从问诊起稿：如果项目有 UI（web/Unity Canvas/Godot Control 等），建立设计系统骨架；纯文字/CLI 项目通过 `entryDocs.uiuxSpec: false` 关掉。**UI/UX 是典型的 authority 领域**——如果团队有人管 UI/UX，由他拍板，AI 只起草和实现。

这七个文件都登记进真相源（`"rules"`、`"start-here"`、`"plan"`、`"progress"`、`"docs-overview"`、`"architecture"`、`"uiux-spec"` 主题），让 `check` 体检覆盖。

## 文件布局规范

干净的根目录是项目的门面。问诊时引导用户走向这个布局（文件夹名按项目框架调整——Unity 项目保留 `Assets/`、web 项目保留 `src/`，规范的核心是"别散着放"，不是死规定文件夹名）：

```
项目根/
├── README.md            ← 身份证（永远在根，像 package.json）
├── AGENTS.md            ← 身份证（AI 守则）
├── START-HERE.md        ← 身份证（给人看的入口）
├── keeper-profile.json  ← 身份证（项目指纹）
├── package.json / 等价物
├── docs/                ← 所有叙事 + 状态文档都进这里
│   ├── zh/              ← 根文档中文版（README.zh.md、SKILL.zh.md）
│   │                      （根目录只留英文正版，中文版进 docs/zh/，保持根干净）
│   ├── ROADMAP.md       ← 版本主题/目标
│   ├── PLAN.md          ← 当前 sprint 任务清单
│   ├── PROGRESS.md      ← 进展流水账（时间倒序）
│   ├── DOCS-OVERVIEW.md ← 文档地图
│   ├── ARCHITECTURE.md  ← 技术架构
│   ├── UIUX-SPEC.md     ← UI/UX 架构（entryDocs.uiuxSpec 开时）
│   ├── truth-source.json    ← 真相源登记表
│   ├── docs-manifest.json   ← 翻译配置（装了翻译部才有）
│   ├── docs-state.json      ← 翻译指纹（自动生成）
│   ├── schedule.json        ← 版本日期/工期（装了调度室才有）
│   ├── sprints/         ← sprint 计划 + 验收记录
│   ├── feedback/        ← 意见箱数据
│   ├── decisions/       ← 架构决策记录（ADR）
│   ├── design/          ← 设计文档（游戏设计、世界观、角色、系统）
│   ├── tech/            ← 技术文档（引擎选型、性能、工具链）
│   ├── uiux/            ← UI/UX 文档（线框、交互、可访问性）
│   └── HANDOFF.md       ← 会话交接备忘（给下一个 AI）
├── references/          ← 房间手册（英文正版 + .zh.md 并排）
├── templates/           ← 数据文件模板 + 游戏文档骨架（英文正版 + .zh 并排）
└── scripts/             ← keeper CLI + 房间脚本
    ├── keeper.js        ← CLI 入口
    ├── lang.js          ← 共享 i18n 助手
    ├── project-files.js ← 入口和房间命令共用的登记表路径
    ├── commands/        ← 一文件一房间（truth/feedback/docs-site/…）
    └── tests/           ← 测试脚本（见下面的测试规范）
```

**几条规矩**：
- **根目录只放身份证。** 一个文件如果不是 `README` / `AGENTS` / `START-HERE` / `LICENSE` / `package.json` / `.gitignore` / 项目框架入口——它大概率该进 `docs/`。
- **别散着放。** 状态文档（`ROADMAP` / `PLAN` / `PROGRESS`）进 `docs/`，不进根。设计文档进 `docs/design/`，不散在根或 `docs/` 里。
- **双语布局。** 根文档（README、SKILL）只留英文正版在根，中文版进 `docs/zh/`（如 `docs/zh/README.zh.md`）——保持根目录干净。`references/` 和 `templates/` 的中文版仍和英文源同目录并排（`.zh.md`），因为这些目录是自包含单元，移走中文版会破坏"拷走整个文件夹就有全套"的特性。`docs-manifest.json` 的 `translations` 字段记录根文档中文版的非默认路径。
- **WIKI 自动发现。** `keeper site serve` 扫 `--dir`（默认 `docs,references`）+ 根目录身份证。`templates/` 下的文件不会被收录（它们是空白模板，不是文档）。`node_modules` / `.`-开头目录 / `_archive` 也跳过。
- **拿不准就问。** 用户拿来一个文档，不属于任何现有文件夹——先问用途，再放进匹配的 `docs/<子目录>/`（必要时新建子目录），并登记进 `truth-source.json`。

## 测试规范

indie-keeper **不**内置测试房间或测试 runner——solo 项目用的栈差太多（Unity Test Framework、Godot Testing、jest、pytest、纯手动 QA 表……），硬塞一个反而碍事。AI 在问诊时建立的是**命名 + 分层 + 维护规范**，按项目栈定制。

**问诊时 AI 要建立这些**（写进 `AGENTS.md` 的"Testing"段）：

1. **栈 & runner。** 项目用什么测试框架（或将要用的）。还没有就推荐最轻量的（Unity 用 Unity Test Framework，Node CLI 用 `node:assert`，纯文档项目用手动 QA 清单）。尽量零额外依赖。

2. **命名规范。** 测试文件镜像被测文件，加 `.test` / `_test` / `Spec` 后缀——选一个坚持用。例：`PlayerController.cs` → `PlayerControllerTests.cs`，或 `lib/feed.js` → `lib/feed.test.js`。测试和源码并排，还是放 `tests/` 镜像目录——选一个坚持用。

3. **分层。** 至少区分：
   - **单元测试** — 纯逻辑，无 I/O，快。大部分测试应该在这里。
   - **集成测试** — 跨模块或带真实 I/O（文件、网络、引擎）。慢；打标签方便单独跑。
   - **验收 / 通关测试** — 手动或脚本化；挂 sprint 验收。在 `docs/sprints/N.md` 里写验收清单也算。
   分目录或打标签，让"只跑单元测试"是一条命令的事。

4. **测什么（优先级）**。
   - 涉及金钱 / 存档 / 进度的逻辑（数据丢失 = 信任丢失）。
   - 有分支的逻辑（状态机、对话、任务）。
   - 共享模块的公开 API（别的代码会调的那些）。
   - Bug 修复——修 bug 时加一条回归测试，让它不再犯。
   - 跳过：琐碎的 getter/setter、纯 UI 格式、一次性脚本。

5. **维护规矩。** 测试是代码——进同一个仓库、同一个 PR 评审、挂了就断构建。过期的测试比没测试更糟；代码变了就更新或删测试。AI 在 sprint 里宣布任务"完成"前先跑一遍测试。

6. **写进 AGENTS.md。** 定好的栈、命名、分层、运行命令都写进 `AGENTS.md`，这样以后的 AI 会话都跟同一个规范走，不会重新发明。

## keeper-profile.json 字段定义

```json
{
  "version": 1,
  "createdAt": "YYYY-MM-DD",
  "project": {
    "name": "游戏名",
    "platforms": ["itch", "steam", "android", "web"]
  },
  "team": [
    { "name": "某人", "role": "代码/发版", "authority": [] },
    { "name": "某人", "role": "世界观/美术", "authority": ["设定", "美术"] }
  ],
  "repo": {
    "layout": "single-private | single-public | dual",
    "notes": "双仓时写清哪个是开发仓哪个是公开仓"
  },
  "rooms": {
    "archive": true,
    "feedback": true,
    "site": false,
    "i18n": false,
    "gametext": false,
    "shipping": true,
    "schedule": false
  },
  "startHere": {
    "enabled": true
  },
  "entryDocs": {
    "plan": true,
    "progress": true,
    "docsOverview": true,
    "architecture": true,
    "uiuxSpec": true
  },
  "versioning": {
    "scheme": "zero-x | semver",
    "blockMajor": true
  },
  "sprint": { "rigor": "light | strict" },
  "review": {
    "mode": "self | peer | human | mixed",
    "notes": "mixed 时写清界线，如：玩法/美术类 human，其余 self"
  },
  "i18n": {
    "sourceLang": "zh",
    "langs": ["en", "ja"],
    "translator": "ai-with-human-review | ai-only | human"
  },
  "decidedBy": {
    "repo.layout": "user | default"
  }
}
```

字段说明：
- `team[].authority`：该成员拍板的领域。AI 在这些领域**只组织和实现，不自由发挥**。
- `rooms.*`：哪些房间已启用。未启用的房间，AI 不主动推销，用户遇到对应痛点时提一句即可。
- `startHere.enabled`：为 `false` 时，问诊不创建 `START-HERE.md`，`keeper hello` 也不打印过期提醒。默认 `true`。用户明确说不要入口页时关掉。
- `entryDocs.*`：问诊时创建哪些核心入口文档。每个默认 `true`。用户明确说不要哪个（如一周的小项目不需要 `PROGRESS.md`）就关掉。AI 不会在后续 session 重新推销关掉的文档。
- `decidedBy`：记录哪些选择是用户拍的、哪些是沿用推荐默认——后者在用户成长后值得回访确认。

## 旧房改造清单

项目已有文档/流程时，按此顺序盘点（先自己扫，再请用户确认，不问用户能自答的问题）。
**盘点全程只读**：只登记、只报告，不移动/改名/删除任何现有文件（见 SKILL.md 文档安全红线）。发现重复或疑似过时的文档，列清单请用户定夺。

1. 扫根目录与 `.github/`：README、CHANGELOG、LICENSE、守则文件（AGENTS.md 等）
2. 扫 `docs/`（或等价目录）：现有文档的主题归类 → 起草 truth-source 登记表
3. 看现有的计划记在哪：ROADMAP / TODO / issue 列表 / 项目板 → 讨论是否迁入或并存
4. 找版本号所在文件 → 起草 version-manifest
5. 已有翻译文件的话 → 起草 docs-manifest，**首次记指纹前和用户确认哪些译文当前和原文对得上**（避免把过期译文错误地记成 fresh）
