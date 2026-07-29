# keeper CLI · 给人敲的命令手册

这份手册是给**人**看的——你自己在终端里敲 keeper 用。AI 怎么用各房间脚本见各房间手册，这里只讲人的日常。

## 装到你的项目里

1. 把整个 `scripts/` 文件夹拷进你的项目，建议放 `tools/keeper/`
2. `package.json` 里注册一行：

```json
{ "scripts": { "keeper": "node tools/keeper/keeper.js" } }
```

3. 以后就是 `npm run keeper -- <命令>`。嫌长的话配一个 bin 或 shell 别名，直接 `keeper <命令>`

裸敲 `keeper` 会看到开屏——小机器人管家和它照看的房子，标题是**你游戏的名字**（从 keeper-profile.json 读）。

## 日常三件套

| 命令 | 什么时候敲 |
|------|-----------|
| `keeper hello` | **每天开工先敲这个**。30 秒接班速查：版本、git 状态、待处理反馈、当前 sprint 进度、真相源登记数，最后附常用命令小抄 |
| `keeper status` | 想快速看一眼工作区健康度：git 改动明细、反馈分类计数、sprint 进度 |
| `keeper where <主题>` | "这个设定写在哪个文件？"——直达权威文档，不用全文搜。例：`keeper where 角色` |

这三个是从两个前辈项目的 CLI 里验证过最好用的习惯：开工 hello、迷路 where、睡前 status。

## 交接条（HANDOFF.md）

sprint 管"这一班做什么"，交接条管"做到哪了、下一班别踩啥"。约定路径 `docs/HANDOFF.md`（根目录 `HANDOFF.md` 也认）。

- 每次开工 `keeper hello` 会自动播报交接条是否存在——存在就先读它再动手
- 一班做完，把"未完事项 / 已踩的坑 / 下一班建议动线"写进 `docs/HANDOFF.md`
- sprint `close` 时会提醒你处置交接条：归档进 `docs/sprints/_archive/` 或删掉

交接条随班次归档，不留作长期文档；要长期留痕的内容请进真相源或 sprint。

## 各房间高频命令

```bash
# 档案室 —— 文档的秩序
keeper truth list                # 全部真相源登记表
keeper truth check               # 体检：死链 / 未登记文档
keeper truth section <文件> <章节>  # 安全读某章节

# 意见箱 —— 反馈不蒸发
keeper fb add "跳跃手感太飘" --from 试玩群 --tag balance
keeper fb list                   # 收件箱全览（按状态分组）
keeper fb plan 6                 # 把 #6 往前推一档（idea→designed→…）
keeper fb done 6 --version v0.3.2  # 处理完，记上是哪版修的

# WIKI —— 文档变小网站
keeper site serve                # 本地起站（双链/反链/搜索/夜间模式）
keeper site pack                 # 打成单个 HTML，发给谁都能看

# 文档翻译部 —— 翻译不过期
keeper docs status               # 哪些译文过期了（stale）一眼看
keeper docs stamp <语言> <文件>   # 翻完记指纹

# 游戏文案部 —— 游戏内文案
keeper game scan                 # 还有多少硬编码文案没进词典
keeper game coverage             # 各语言翻译覆盖率
keeper game drift --check        # 源文改了译文没跟上的（CI 可用）
keeper game glossary list        # 自造术语表（体力叫"灵魂"这种）

# 发货口 —— 版本有节奏
keeper ver show                  # 看各处版本号 + 一致性
keeper ver next                  # 预览：从 git log 自动算下次升什么级（feat→minor，fix→patch）
keeper ver bump                  # 不带参数 → 用自动算的级别；或显式：patch|minor|major
keeper sprint show               # 当前 sprint 详情
keeper sprint lint               # 验收清单质检（防糊弄）

# 发货口·发布 —— preflight + changelog + 平台指引（可选）
keeper release preflight commit  # git commit 前跑（查调试残留 / 凭证 / 语法）
keeper release preflight push    # git push 前跑（+ 测试 + 分支 + 落后远程）
keeper release preflight build   # 打包构建前跑（+ 版本号 + 翻译 + sprint 验收）
keeper release changelog init    # 创建 CHANGELOG.md（Keep a Changelog 格式）
keeper release changelog add "Added X"   # 在 [Unreleased] 下追加一条
keeper release changelog draft           # 从 conventional commits 自动起草 [Unreleased]（加 --apply 写入）
keeper release changelog cut 0.2.0       # 把 [Unreleased] 切成 [0.2.0] - <今天>
keeper release github guide      # GitHub release workflow 配置 + gh CLI 命令
keeper release itch init         # 生成 itch.toml 模板
keeper release steam guide       # Steam 上传配置 + steamcmd 命令

# 发货口·分支 —— 分支命名规范 + 保护分支守卫
keeper branch check              # 当前分支对照规范体检（--strict 违规退出码 1）
keeper branch new feature login ui   # 创建 feature/login-ui 并切过去
keeper branch policy             # 打印当前生效的规范（keeper-profile.json → branch）
```

每个命令都有 `help`：`keeper truth help`、`keeper fb help`……

## 语言

输出默认英文。要中文有两种方式：

- 临时：任何命令后面加 `--lang zh`
- 永久：`keeper-profile.json` 里写 `"language": "zh"`

## 找不到命令？

裸敲 `keeper` 或 `keeper help` 看全表。每个房间的机制原理（为什么这么设计、数据文件长什么样）在 `references/room-*.md` 各房间手册里。
