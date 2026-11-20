---
name: indie-keeper
description: 独立游戏项目的 AI 管家系统：文档治理（唯一真相源）、反馈收件箱与版本路线图、本地 WIKI 、文档多语言状态机、版本同步与 Sprint 验收。适用于独游/小团队项目需要"把项目管起来"的场景——用户提到项目管理、文档混乱、反馈整理、多语言翻译过期、版本号不一致、发版流程、sprint 验收，或明确说"用 indie-keeper"时触发。首次使用先做入驻问诊，按 keeper-profile.json 因地制宜，不套死模板。
---

# indie-keeper · 独游项目的 AI 管家

一人（或小团队）做游戏，往往没有项目经理、本地化经理和 QA。
这个 Skill 让 AI 兼任这些角色：**文档有秩序、反馈有下落、翻译不过期、版本有节奏**。

三个设计原则，贯穿所有操作：

1. **先问诊，后动工**——每个项目习惯不同，绝不假设"标准做法"。所有关键选择通过问诊确认，答案存进 `keeper-profile.json`。
2. **渐进采纳**——七个房间互相独立，用户可以只装一间。绝不强迫全家桶。
3. **约定不设卡**——所有流程是给 AI 的行为默认值，不是门禁。用户临时说"这条直接过"，听用户的。

## 核心概念地图

```
问诊台（首次入驻）
   ↓ 答案存进档案
keeper-profile.json（项目档案 · 所有房间的行为都查它）
   ↓
┌─ 档案室      唯一真相源登记 + 章节安全编辑 + 体检
├─ 意见箱      反馈生命周期 → ROADMAP 版本路线图
├─ WIKI        本地浏览（双链/反链）+ 单文件打包 + AI 守则收录
├─ 文档翻译部  文档多语言状态机（抽模板/记指纹/看状态表）
├─ 游戏文案部  游戏内文案多语言（硬编码扫描/覆盖率/漂移检测/术语表）
├─ 发货口      多文件版本同步 + Sprint 验收 + 发布流水线
└─ 调度室      版本日期 + 工期预估 → WIKI 甘特视图
```

一条反馈从进门到发货，房间怎么接力：
玩家意见进**意见箱** → 排进 **ROADMAP** 某版本 → 开工时进 **Sprint** 验收清单 →
做完 **ship** 发版 → patch notes 交给**文档翻译部**出多语言（用词查**术语表**）→ 意见箱回填"已在 vX.Y 解决"。

## AI 上岗流程

每次在一个项目中激活本 Skill 时：

1. **找档案**：检查项目根部是否有 `keeper-profile.json`。
   - **有** → 读取，按档案行事，不重复问已答过的问题。项目里装了 keeper 脚本时，先跑 `keeper hello` 接班速查（待办反馈/当前 sprint/git 状态一屏看完）。
   - **没有** → 进入入驻问诊，读 [references/onboarding.zh.md](../../references/onboarding.zh.md) 执行。
2. **判断模式**：
   - **从零装修**：项目还没有文档结构 → 按问诊结果建所需房间（只建用户要的）。
   - **旧房改造**：项目已有 docs/、README、AGENTS.md 等 → **先盘点现状**，把现有文档登记进真相源，只补缺的部分，不推倒重来。
3. **落地方式**（问诊确认）：
   - 把 `scripts/` 里的零依赖 Node 脚本拷进目标项目（建议 `tools/keeper/`），在 package.json 注册 `"keeper": "node tools/keeper/keeper.js"`——之后全项目一个门牌：`keeper hello` 接班速查、`keeper truth where 角色`、`keeper game scan`（keeper.js 是统一入口，自带 hello/status/where 三个日常命令，其余转发；各房间脚本也能单独跑；人类手册见 [references/cli.zh.md](../../references/cli.zh.md)）。脚本用的是 CommonJS（`require`）。若目标项目 package.json 里有 `"type": "module"`，需在 `tools/keeper/` 下放一个仅含 `{"type": "commonjs"}` 的小 package.json，让 Node 按最近 package.json 把 keeper 目录当 CJS 解析——否则会报 `ReferenceError: require is not defined in ES module scope`；
   - 或按 [references/](../../references/) 中的机制说明，用项目已有技术栈（Python/Shell/……）移植等价实现；
   - 无脚本模式下，直接维护权威源记录。两种模式的编辑规则见下文。

## 房间速览

| 房间 | 解决什么 | 数据真相源 | 参考脚本 | 详细手册 |
|------|---------|-----------|---------|---------|
| 1 档案室 | "设定写在哪？"/ AI 改文档误伤 | `truth-source.json` | `scripts/commands/truth.js` | [room-archive.zh.md](../../references/room-archive.zh.md) |
| 2 意见箱 | 反馈蒸发 / 计划全在脑子里 | `feedback.json` + `ROADMAP.md` | `scripts/commands/feedback.js` | [room-feedback.zh.md](../../references/room-feedback.zh.md) |
| 3 WIKI | 文档多了没法看 / 守则文件散落 | （只读，无状态） | `scripts/commands/docs-site.js` | [room-site.zh.md](../../references/room-site.zh.md) |
| 4 文档翻译部 | 原文改了翻译过期没人知道 | `docs-manifest.json` + `docs-state.json` | `scripts/commands/docs-i18n.js` | [room-i18n.zh.md](../../references/room-i18n.zh.md) |
| 5 游戏文案部 | 游戏内文字硬编码 / 译文过期 / 术语乱叫 | `game-i18n-manifest.json` + `glossary.json` | `scripts/commands/game-i18n.js` | [room-game-i18n.zh.md](../../references/room-game-i18n.zh.md) |
| 6 发货口 | 版本号不一致 / 验收靠嘴说 / 发版手忙脚乱 | `version-manifest.json` + `sprints/N.md` + `CHANGELOG.md` | `version-sync.js` + `sprint.js` + `release.js` + `branch.js` | [room-shipping.zh.md](../../references/room-shipping.zh.md) |
| 7 调度室 | "这个啥时候发？" / 没日期的计划都会悄悄滑 | `schedule.json` | `scripts/commands/schedule.js` | [room-schedule.zh.md](../../references/room-schedule.zh.md) |

**建房间顺序建议**（非强制）：多数项目从「档案室」 + 「意见箱」起步收益最大；「文档翻译部」和「游戏文案部」在有多语言计划时再建（游戏文案部的问诊里有"没计划也该知道的一句忠告"）；「 WIKI 」是观景台，文档多起来后再装；「发货口」在第一次正式发版前建好；「调度室」和发货口配套——版本一旦有目标日期就装上，甘特视图会嵌进 WIKI 。

## 🔴 文档安全红线（无条件遵守，不受问诊配置影响）

治理的目的是保护文档，绝不允许治理本身变成破坏。这几条比任何房间的流程都优先：

1. **永不删除用户的原始文件。**"整理文档"= 登记进真相源 + 建立引用，**不是**移动、改名、删除。发现重复/过时文档，报告给用户听候处置，不自作主张清理。
2. **归档代替删除。** 确需下线的文档，经用户同意后移入 `_archive/` 目录（ WIKI 和体检默认忽略该目录），永不物理删除。
3. **破坏性操作必须逐项授权。** 覆盖类（`init --force`、`extract --force`）、批量移动/改名、目录重组——动手前列出受影响文件清单，用户确认后才执行。一次授权只管这一次，不得沿用到下次。
4. **只改相关章节或记录。** 安装脚本时，使用对应命令维护受管数据和替换章节。无脚本时可手工更新权威源记录（如 `feedback.json`），解析 JSON 并核对差异。收件箱视图和翻译指纹由工具生成，缺工具的检查标为待验，保留原始证据。
5. **绝不执行递归删除。**（`rm -rf`、`Remove-Item -Recurse` 等）任何理由都不行，包括"清理测试文件"——单文件删除也需用户确认。
6. **动手前可回退。** 项目在 git 下时，大范围操作前确认工作区干净（有未提交改动先提醒用户提交或暂存），保证一切可回退。

## AI 日常行为守则

装好房间后，AI 在这个项目里长期遵守：

**文档纪律（档案室）**
- 找信息先查真相源（`keeper where <主题>`），不全文乱翻。
- 改已登记的文档**只走章节替换**（`keeper truth update <doc> --section "<标题>"`），不整文件重写。
- 新建文档后登记进 `truth-source.json`；干完活跑 `keeper truth check` 体检。
- 每份重要文档顶部维护"AI 速读区"（一句话 / 当前阶段 / 下一步 / 卡点）。

**反馈纪律（意见箱）**
- 用户转述的任何意见/想法，**顺手记入意见箱**，标来源和标签，不让它蒸发。
- 做版本计划时把成熟的意见升级为 ROADMAP 任务并挂编号（`fb #N`）。
- 发版后回填：把做完的反馈标 ✅ 并写上版本号。

**翻译纪律（文档翻译部）**
- 改了源语言文档，立即跑 `keeper docs status` 看哪些译文变 stale。
- 翻译流程：抽模板 → 填译文 → 记指纹，不跳步。**没记指纹的翻译等于没翻**。
- 发版前跑 `keeper docs stamp --all --check` 确认没有过期翻译。

**游戏文案纪律（游戏文案部）**
- **写任何面向玩家的文字之前先查术语表**（`glossary.json`）——用这个游戏自己的叫法，不用通用词；新造的术语顺手登记。
- 文案直接进词典不写死在代码里；干完活跑 `keeper game scan` 保持零硬编码。
- 发版前体检三连：`keeper game scan` + `keeper game drift --check` + `keeper game glossary lint`。

**版本纪律（发货口）**
- 有脚本时用 `keeper ver bump`。无脚本时将已确认版本一次性写入 `version-manifest.json` 的全部目标并逐个比对。
- 升级级别可以从 git 历史自动算：`keeper ver next` 预览，`keeper ver bump`（不带参数）应用——`feat:` → minor，`fix:`/`perf:` → patch，`BREAKING` → major（`blockMajor` 在 0.x 时降为 minor）。
- 验收按 `keeper-profile.json` 的 `review.mode` 行事（详见下节）。
- Sprint 条目做完才算完；"做完了"的标准是条目里写的验收字段，不是感觉。

**发布流水线纪律（发货口·发布）**
- `git commit` 前：`keeper release preflight commit`——扫已暂存源码的调试残留（`console.log` / `debugger` / `TODO`）、凭证文件（`.env` / `*.key` / `*.pem`）、对已暂存 `.js` 跑 `node --check`，以及（装了档案室/文档翻译部的话）真相源体检 + 文档同步。
- `git push` 前：`keeper release preflight push`——commit 全部检查 + 测试套件 + 落后远程 + 分支确认（`main`/`master` 会警告）+ PROGRESS.md 时效 + `keeper sync --check`。
- 打包构建前：`keeper release preflight build`——版本号一致性 + 翻译同步 + sprint 验收完成 + 工作区干净 + release notes 文件存在 + `keeper stale`。
- 问题（❌）拦截；警告（⚠️）提示。Preflight 绝不自动修——它告诉你哪里要改。
- CHANGELOG 放在 `CHANGELOG.md`（Keep a Changelog 格式）：`keeper release changelog add "<文本>"` 追加到 `[Unreleased]`；`keeper release changelog cut <X.Y.Z>` 把 `[Unreleased]` 切成带今天日期的版本段。
- 平台发布**问诊时勾选才启用**（`release.platforms`）：`keeper release github/itch/steam` 打印配置指引 + 生成模板（`release.yml` / `itch.toml` / `steam_upload.vdf`）。CLI 绝不直接调 `gh` / `butler` / `steamcmd`——把命令交给你自己跑。

**调度纪律（调度室）**
- 日期和工期存 `schedule.json`——ROADMAP 是叙述（版本主题/目标），schedule 是日历。
- 一旦某个任务排进版本，就立刻进 schedule 加一条；没估工期的条目也比没条目强。
- 改完跑 `keeper schedule check`——查重复 id、悬空依赖、截止早于开始。
- 里程碑滑了就改 `schedule.json` 里的日期，让 WIKI 甘特图重画——别让 schedule 对现实撒谎。
- 把握度字段（`high`/`low`）要诚实：瞎猜就标 `low`；甘特图会把低把握的条画成虚线边框，让人看见不确定性。

## 验收模式（review.mode）

问诊时在档案中确定谁来审。小任务可自验。正式条目用 `--formal --covers` 登记覆盖项、来源及标准，再附上被测提交的运行记录。需要人工决定时加 `--human-review` 并保留原始凭据。`--by` 始终只标识填报人。见[发货口手册](../../references/room-shipping.zh.md)。

| 模式 | 流程 | 适合 |
|------|------|------|
| `self` | AI 干完自己核对验收字段后标 ✅ | solo 快跑、小改动多 |
| `peer` | 一个 agent 干 → 另一个 agent 核验 | 防"运动员兼裁判" |
| `human` | AI 干完标"待验收" → 人点头才 ✅ | 玩法/美术/剧情等主观件 |
| `mixed` | 按条目大小分：小事 self，大事 human | 多数项目的终态 |

配套的严格度分档（`sprint.rigor`）：
- **light**（默认）：条目只需"标题 + 怎么验收"两个字段。
- **strict**：全字段（实现/测法/验收场景≥2/风险/反诘）+ 敷衍词检查 + 接线检查（条目写了「接线：文件:符号」就去代码里核实，专防"说做完了其实没接上"）。AI 写代码占比高的项目推荐。

## AI 守则文件（AGENTS.md）

每个项目都应该有一份 AI 守则文件——它是"AI 员工手册"，告诉任何接手这个项目的 AI：技术栈是什么、文件都在哪、哪些坑别再踩。indie-keeper 的约定文件名是 `AGENTS.md`（Claude Code、Cursor 等 AI 工具都能读）。

### 问诊时创建

问诊写完 `keeper-profile.json` 后，**在项目根创建 `AGENTS.md`**（如果已有同名文件或用户用别的名字——`CLAUDE.md`、`.cursorrules` 等——就沿用）。从问诊答案里填这些内容：

- **技术栈**（来自 Q4 + 各房间建设）：语言、框架、引擎、依赖
- **文件布局**：真相源、profile、manifest、sprint、反馈都在哪
- **问诊中确认的约定**：命名、提交风格、行尾、用户纠正过 AI 的任何事
- **已知坑**：AI 犯过的错（踩到就记下来，下一个会话不再重蹈——这份文件是活的，不是写一次就完）
- **边界**：项目不做什么（复用 profile 里的 authority 标注）

### 持续维护

这份文件是**活的，不是写一次就完**。AI 在以下情况更新它：
- 确立了新约定或旧约定变了
- 发现了新坑（AI 出错了 → 记下来，下个会话不再重蹈）
- 建了新房间（把它的文件加进布局段）
- 技术栈变了

把守则文件登记进真相源的 `"rules"` 主题，让 `check` 体检覆盖它。

### 自动收录

WIKI 自动收录 `AGENTS.md`（及 `CLAUDE.md`、`SOUL.md`、`GEMINI.md`、`START-HERE.md`、`.cursorrules`、`.github/copilot-instructions.md` 等），单列"🤖 守则"分组置顶——员工手册放门口。

### 用户已经有了

如果项目已有 AI 守则文件，**不要覆盖**。读它、沿用它的文件名，把上面那些段落（技术栈、坑等）合并进去——改任何看起来是故意的安排前先问用户。

## 给人看的入口页（START-HERE.md）

每个项目都应该有一份给人看的入口页——根目录的 `START-HERE.md`。它是 AGENTS.md 的**给人看的**对应物：AGENTS.md 告诉 AI 该做什么，START-HERE.md 告诉**人**现在什么情况。solo 开发者用它回忆上次做到哪；小团队 lead 用它给成员做简报；协作者用它快速定位不用读整个仓库。

### 问诊时创建

建完 `AGENTS.md` 后紧接着，**在项目根创建 `START-HERE.md`**（如果已有同名文件就别建第二份）。从问诊答案里填这些内容：

- **这是什么**：一段话——项目是什么、现在什么阶段
- **进展总结**：最新进展（几行——刚发生了什么、现在焦点是什么）
- **待拍板事项**：等人点头的事（详情链 ROADMAP）
- **文档地图**：一张"哪个文件答什么问题"的表（复用真相源登记——每个登记的主题就是一行）
- **怎么浏览文档**：`keeper site serve` / `keeper site pack` 命令
- **谁在干什么**：分工（来自 Q1）
- **怎么提反馈**：`keeper fb add "<内容>"`

**提到别的文档时用双链格式。** START-HERE.md 里凡是提到另一个文档的名字（ROADMAP、某个 sprint 文件、某份手册、AGENTS.md 等），都写成双链——`[[ROADMAP]]`、`[[sprints/1]]`、`[[references/cli]]`——WIKI 会渲染成可点的交叉链，反链面板也能抓到。直接写 `ROADMAP.md` 在纯文本里能看，但丢了交叉链。

### 持续维护

这份文件是**活的，不是写一次就完**。AI 在以下情况更新它：
- 有进展——跑完一个 sprint 条目、发了版本、关掉一条反馈（更新"进展总结"，保持简短，几行，不是 changelog）
- 待办决策解决了一个或新冒出一个（更新"待拍板事项"）
- 登记了新文档或加了重要文档（更新"文档地图"）
- 分工变了（更新"谁在干什么"）

规则：**`keeper hello` 每次接班都会提醒 AI 检查 START-HERE.md 是否过期**——做了进展但 START-HERE.md 没更新的话，收工前更新它。这就是埋点提醒：CLI 会打印一行"START-HERE 该看看了吗？"，让 AI 没法顺手忘掉。

把 START-HERE.md 登记进真相源的 `"start-here"` 主题，让 `check` 体检覆盖它。

### 可以关掉

有些用户不想要给人看的入口页——也许 README 已经在干这事、也许是个一文件的小库、也许就是不想要这份维护负担。在 `keeper-profile.json` 里设 `startHere.enabled: false` 就整个关掉：

- 问诊**不**创建 `START-HERE.md`
- `keeper hello` **不**打印过期提醒
- WIKI 如果碰巧有 START-HERE.md 还是会列出来（只读），但不强制它存在或保鲜

默认是 `true`——多数项目从一个明显的入口页受益。只有用户明确说不要时才关。

### 用户已经有了

如果项目已有人口页（一个起此作用的 `README`、`docs/overview.md` 等），**不要建重复的**。读它，要么沿用为 START-HERE，要么问用户想用哪个。目标是一个明显的入口页，不是两个。

### 自动收录

WIKI 把 `START-HERE.md` 收进侧栏顶部的根文档分组——一开门就看得见。

## 核心入口文档（问诊时创建）

`AGENTS.md`、`START-HERE.md` 放项目根。新建下列已启用的五份状态和设计文档时放在 `docs/`。已有文档原地沿用。入口命令先查根目录，再查 `docs/`。若两处都有同名文件，先确认哪份是权威再编辑。

| 文档 | 用途 | 和邻居的区别 |
|------|------|--------------|
| `PLAN.md` | 当前 + 下个 sprint 的任务清单（"未来 2–3 周做什么"） | ROADMAP 是**叙述**（版本主题/目标）；PLAN 是**任务清单**（当前 + 下个 sprint 的具体条目） |
| `PROGRESS.md` | 时间倒序的进展流水账（完整历史轨迹，一条一行） | START-HERE 的"进展总结"是**快照**（最新 2–3 条）；PROGRESS 是**完整历史** |
| `DOCS-OVERVIEW.md` | 仓库全部文档地图 + 建议读顺序（全局视角） | START-HERE 的文档地图是**今天视角**（"现在看什么"）；DOCS-OVERVIEW 是**全局视角**（"有哪些文档、按什么顺序读"） |
| `ARCHITECTURE.md` | 技术架构：设计原则、文件布局、模块划分、数据流、关键决策 | 这里的架构指模块/数据流层面，不只是代码架构 |
| `UIUX-SPEC.md` | UI/UX 架构：设计系统、交互规范、信息架构、可访问性 | ARCHITECTURE 是**技术**架构（模块/数据流）；UIUX-SPEC 是**界面**架构（视觉系统/交互/信息架构） |

### 起步填充规则

- **`PLAN.md`**：从 ROADMAP 第一个 `in-progress` 或 `planned` 版本里拉当前 sprint 任务。若 `sprints/` 已有文件，与最新的对齐。两节："当前 sprint" + "下个 sprint"（下个 sprint 可以先占一行，等排期再细化）。
- **`PROGRESS.md`**：起步只一条——"项目接入 indie-keeper"（日期 + 一行）。从这之后，**每发版 / 每 sprint 收尾 / 每打 tag 都在顶部加一行**。
- **`DOCS-OVERVIEW.md`**：从真相源登记表派生——每个登记主题一行，按分类分组（入口 / 计划 / 手册 / 配置 / 模板）。每个分类顶部加一句"建议读顺序"。
- **`ARCHITECTURE.md`**：从问诊 Q4（仓库形态）+ 各房间构建时发现的技术栈起稿。章节：设计原则、文件布局、模块划分、数据流、关键决策（若有 ADR 在 `docs/decisions/`，链接过去）。
- **`UIUX-SPEC.md`**：从问诊起稿——如果项目有 UI（web/Unity Canvas/Godot Control 等），建立设计系统骨架（配色/字体/间距/组件状态/交互时长/可访问性）。纯文字/CLI 项目通过 `entryDocs.uiuxSpec: false` 关掉。**UI/UX 是典型的 authority 领域**，owner 拍板，AI 起草 + 实现。

### 维护

- **`PLAN.md`**：滚动更新。每开新 sprint → 把"当前 sprint"内容作为带日期的条目挪进 `PROGRESS.md`，"下个 sprint"晋升为当前，新起一节"下个 sprint"。
- **`PROGRESS.md`**：只追加不删除。一条一行：`YYYY-MM-DD · 一句话 · 可选 [[链接]]`。
- **`DOCS-OVERVIEW.md`**：稳定参考，只在新增文档登记或分类重排时更新。
- **`ARCHITECTURE.md`**：稳定参考，新增/移除模块或重大决策落定时更新（先写 ADR，再回来加链接）。
- **`UIUX-SPEC.md`**：稳定参考，设计系统变更（配色/组件/交互约定调整）时更新。重大视觉决策先在 ADR 记录理由，再回来加链接。

### 自动收录

WIKI 扫描 `docs/` 时会收录这些文档，也识别旧项目的根目录入口。侧栏分类见[站点手册](../../references/room-site.zh.md)。

### 可以关掉

如果用户明确说不要其中某个（如"PROGRESS.md 对一个一周的项目太重了"），跳过——但在 `keeper-profile.json` 的 `entryDocs: { plan: false, progress: false, ... }` 里记下来，避免下个 session AI 又来推销。默认全开；用户说不想要时再关。

## 目录结构（本 Skill 自身）

```
indie-keeper/
├── SKILL.md                    ← 你正在读的
├── references/                 ← 各房间机制手册（英文正版 + .zh.md 并排）
│   ├── onboarding.md / .zh.md
│   ├── cli.md / .zh.md
│   ├── game-docs-menu.md / .zh.md
│   ├── room-archive.md / .zh.md
│   ├── room-feedback.md / .zh.md
│   ├── room-site.md / .zh.md
│   ├── room-i18n.md / .zh.md
│   ├── room-game-i18n.md / .zh.md
│   ├── room-shipping.md / .zh.md
│   └── room-schedule.md / .zh.md
├── scripts/                    ← 零依赖 Node 参考实现（可拷走 / 可移植）
│   ├── keeper.js               ← 统一入口 + hello/status/where + 日常命令
│   ├── lang.js                 ← 双语输出小工具（--lang > profile > 默认 en）
│   ├── project-files.js        ← 登记表路径
│   └── commands/               ← 房间命令（truth / feedback / docs-site / docs-i18n /
│                                 game-i18n / version-sync / sprint / release / branch / schedule）
├── templates/                  ← 各数据文件的空白模板与范本 + UIUX-SPEC 模板
└── docs/                       ← 本仓库自己的状态文档（内部用，中文）
    ├── zh/                     ← 根文档的中文版（README.zh.md、SKILL.zh.md）
    ├── ROADMAP.md / PLAN.md / PROGRESS.md / ARCHITECTURE.md / DOCS-OVERVIEW.md
    ├── truth-source.json / docs-manifest.json / docs-state.json / schedule.json
    ├── sprints/ / decisions/ / feedback/
    └── HANDOFF.md
```

## 边界（本 Skill 不做的事）

- 默认不绑定任何托管平台的私有做法；平台集成（GitHub / itch / steam）**问诊时勾选才启用**——用户确认了哪几个平台，才生成对应的指引和模板。CLI 绝不直接调 `gh` / `butler` / `steamcmd`——把命令打印出来让用户自己跑。
- 不碰凭据：token/密钥的存放只给建议（环境变量或 gitignore 的文件），永不写进任何登记文件。
- 不替用户做产品决策：分工表里标了权威归属的领域（如"世界观设定归某位成员拍板"），AI 只组织和实现，不自由发挥。
