# 发货口（版本同步 + Sprint 验收 + 发布）

解决两个痛点："版本号各写各的"和"验收靠嘴说"。

## 核心机制

### 版本同步（version-sync.js）

一个项目的版本号往往散在多个文件（package.json / build.gradle / Godot export_presets / VERSION…），手改必漏。`version-manifest.json` 用占位符登记每个位置：

```json
{
  "targets": [
    { "file": "package.json", "patterns": ["\"version\": \"{{version}}\""] },
    { "file": "android/app/build.gradle", "patterns": ["versionName \"{{version}}\"", "versionCode {{code}}"] }
  ],
  "blockMajor": true
}
```

- `{{version}}` = X.Y.Z；`{{code}}` = major×10000 + minor×100 + patch（安卓式单调构建号）
- `show` 看各处版本 + 一致性；`bump patch|minor` 全部改齐；`check` 挂 CI（不一致 exit 1）
- `blockMajor` 默认开：正式上线前停在 0.x 是常见纪律，要升 major 用 `--allow-major`
- bump 只改文件**不自动 commit**——审完自己提交，符合"动手前可回退"红线

### Sprint 验收（sprint.js）

时间轴分工：ROADMAP 管未来，**Sprint 管现在**，PROGRESS 管过去。某版本开工时：

```bash
node sprint.js new "工坊大改" --version v0.5
node sprint.js add "资产管理器" --accept "拖入图片能登记 · 删除有确认" --from "fb #3"
node sprint.js approve 1.1 --by self           # 小任务自验
node sprint.js close --version v0.5.0          # 全清后归档 + 回填 ship
```

- 文件是 `docs/sprints/N.md` 纯 markdown，人可直接读改
- 小任务可以自己核对标准再 `approve`。`--by` 只记录填报人。即使填 `human:某人`，仍须到原始来源核对该人的决定。
- `lint` 质检：light 档查"有没有验收标准"；strict 档加查实现/测法/风险/反诘（必须疑问句）+ **敷衍词检查**（"优化了""相关问题"这类空话直接抓）；条目写了「接线：文件:符号」还会去代码里核实——专治 AI 糊弄
- 正式验收先登记范围，例如 `sprint add "存档往返" --formal --covers window,hud,reopen,bad-save --from "反馈 3" --accept "重开后 HUD 数值保留，坏档触发加载错误"`。需要真人决定的条目另加 `--human-review`。
- 跑项目自己的测试，把运行记录保存在项目内，用 `sprint approve <id> --record evidence/run.json` 登记。记录写明完整 Git SHA、运行编号、实际命令，每个约定用例都须有通过结果与产物。下面只展示一个用例的格式，占位符须换成实测值。

```json
{"commit":"<被测 SHA>","run":"windows-01","command":"<项目测试命令>","coverage":{"window":{"result":"passed","file":"window.png","sha256":"<64 位十六进制摘要>"}}}
```

  产物路径相对运行记录。需人工决定时，在 `review` 中用 `file` 和 `sha256` 引用单独的原始确认凭据。保留记录和产物。验收时固定记录摘要与提交，质检和关单时复验。只跑 headless 会留下 Windows 窗口用例待验。HUD、读档和错误断言由游戏判断，IK 核对记录的结果与证据完整性。

### 发布流水线（release.js）

发版是小错叠加的地方：一个 `console.log` 混进 commit、一个凭证文件被暂存、版本号改漏一处、翻译带着过期就发了。发布流水线是一组 **preflight 检查**，在每个不可逆步骤前拦下这些错，外加 changelog 和平台指引。**问诊时勾选才启用**（`release.platforms`）——默认不开平台集成，用户确认了哪几个才装哪几个。

#### Preflight（三个阶段）

每个阶段扫描项目状态，报问题（❌ 拦截）+ 警告（⚠️ 提示）。问题 exit 1，警告不拦。Preflight 绝不自动修——它告诉你哪里要改。

| 阶段 | 跑的时机 | 查什么 |
|------|----------|--------|
| `keeper release preflight commit` | `git commit` 前 | 已暂存源码里的调试残留（`console.log` / `debugger` / `TODO` / `FIXME`）· 暂存区里的凭证文件（`.env` / `*.key` / `*.pem` / `id_rsa` / `*.keystore`）· 已暂存的 `.js` 跑 `node --check` · 文档翻译同步（装了文档翻译部才查）· 真相源体检（装了档案室才查） |
| `keeper release preflight push` | `git push` 前 | 配置 `repo.localOnlyBranches` 的项目拦截清单中的分支和游离 HEAD。其他检查覆盖提交、项目声明的测试、上游、分支、PROGRESS 时效与 `keeper sync --check`。 |
| `keeper release preflight build` | 打包构建前 | 版本号一致性（`keeper ver check`）· 翻译是否同步 · sprint 验收是否完成（有待验收条目会警告）· 工作区干净（有未提交改动会拦）· release notes 文件存在（`CHANGELOG.md` / `docs/releases/`）· `keeper stale` 全绿 |

AI 在每个不可逆动作前跑对应的 preflight。警告是建议——用户可以 override；问题必须修掉或显式接受。

#### 版本号自动推算（version-sync.js · `next`）

版本升级级别不用 AI 手挑了——从 git 历史算：

```bash
keeper ver next          # 预览：显示建议的级别 + 分类明细
keeper ver bump          # 不带参数 → 用自动算的级别
keeper ver bump minor    # 显式指定仍然可以
```

逻辑：扫 `git log <上次tag>..HEAD` 的 [conventional commits](https://www.conventionalcommits.org/)：
- `BREAKING CHANGE` 或 `type!:` → major
- `feat:` → minor
- `fix:` / `perf:` → patch
- 其他 → patch（保守）

`blockMajor`（默认开）在 0.x 时把 major 降级为 minor。没有版本 tag 就扫全部 commit。

#### Changelog（Keep a Changelog 格式）

`CHANGELOG.md` 遵循 [Keep a Changelog](https://keepachangelog.com/) 约定。`[Unreleased]` 段在两次发版之间累积条目；`cut` 把它切成带今天日期的版本段。

```bash
keeper release changelog init                          # 创建 CHANGELOG.md（已存在会拒绝，--force 覆盖）
keeper release changelog add "Added new feature X"     # 在 [Unreleased] 下追加一条
keeper release changelog draft                         # 从上次 tag 后的 conventional commits 自动起草 [Unreleased]（加 --apply 写入）
keeper release changelog cut 0.2.0                     # 把 [Unreleased] 切成 [0.2.0] - <今天>
keeper release changelog show                          # 打印文件
```

- `add` 会插到 `[Unreleased]` 下第一个 `### 类别` 标题（Added / Changed / Fixed / …）后面；没有类别标题就插个普通 bullet。
- `cut` 会前置一个新的 `[Unreleased]` 段，下个周期从空白开始。
- 模板里有个 `## [0.1.0] - 1970-01-01` 占位——换成你真实的首次发版。

#### 平台指引（可选）

平台集成**默认关闭**，问诊时通过 `release.platforms: ["github", "itch", "steam"]` 开启。每个平台有 `init`（生成模板文件）+ `guide`（打印配置 + 上传步骤）。

**GitHub**（`keeper release github`）：
- `release-notes` —— 从 PROGRESS.md + sprint 已验收条目起草 release notes（用 `--out=<file>` 写文件，否则输出到 stdout）
- `workflow-template` —— 生成 `.github/workflows/release.yml`（打 tag 时构建、附产物、用 `softprops/action-gh-release` 自动生成 notes）
- `guide` —— 打印 `gh` CLI 命令：建 release、传产物、看 workflow 状态、打 tag

**itch.io**（`keeper release itch`）：
- `init` —— 生成 `itch.toml`（入口 + 封面 + 截图）
- `guide` —— 走一遍 itch.io 账号注册、butler CLI 安装/登录、`butler push build/ user/game:channel`、CI 用 `BUTLER_API_KEY` 自动上传

**Steam**（`keeper release steam`）：
- `init` —— 生成 `steam_upload.vdf`（App ID + depot + 文件映射）
- `guide` —— 走一遍 Steamworks 合作伙伴配置（$100 入场费）、steamcmd 安装/登录、`steamcmd +login bot +runscript steam_upload.vdf`、CI 自动上传、Steam Guard、1–5 天审核窗口

CLI **绝不直接调 `gh` / `butler` / `steamcmd`**——打印命令让用户/AI 自己跑。零依赖原则 + 跨平台稳定。

#### 发布序列（串起来）

装了发布流水线后，一次发版是固定序列；AI 每步都跑 preflight 暂停：

1. 运行 `keeper sprint lint`，核对约定范围。版本相关 Sprint 等版本与关单决定落定后再关闭。
2. 用 `keeper ver next` 预览，写入已获确认的版本号。
3. 运行 `keeper release changelog cut <X.Y.Z>` 并审阅对应更新记录。
4. 暂存预期文件，运行 `keeper release preflight commit`，提交候选版本。
5. 在该 SHA 的干净检出中跑 `keeper release preflight build` 和项目测试。获准推送前核对待推引用仍指向该 SHA。有变动就重新验证。
6. 平台发布（如果装了）：`git tag vX.Y.Z && git push origin vX.Y.Z` 触发 GitHub workflow；或手动 `butler push` / `steamcmd +runscript`
7. 善后：ROADMAP 对应版本标 ✅、`keeper fb done <id> --version vX.Y.Z` 回填、归档 HANDOFF.md

**推送前必须经用户确认**（外发操作不自作主张）；凭据走环境变量或 gitignore 的文件，永不写进任何登记文件。

## 建房流程

1. AI 先扫版本号所在文件，起草 version-manifest 请用户确认（onboarding 有清单）
2. 问诊定 `sprint.rigor`（light/strict）、`review.mode`、`release.platforms`（装哪几个平台的指引——默认一个都不装）
3. 第一次发版前把发布序列走一遍，之后就是肌肉记忆
4. 如果 `release.platforms` 里有平台，跑它的 `init` 生成模板文件，再跟用户走一遍 `guide`

## AI 日常纪律

- 有脚本时用 `ver next` 和 `ver bump`。手工模式一次性更新并核对登记的全部目标。
- 条目"做完了"的标准是验收字段，不是感觉；strict 档写字段时先自查敷衍词
- 每次 `git commit` / `git push` / 打包构建前，跑对应的 `keeper release preflight <阶段>`——别因为"应该没事"就跳过
- close 后立刻做第 7 步善后，别攒
- 随手往 `CHANGELOG.md` 里追加（零散记，别等发版才脑暴）
