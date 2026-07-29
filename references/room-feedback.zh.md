# 意见箱与路线图（反馈 → 版本计划）

解决两个痛点："提过的意见蒸发了"和"计划全在脑子里"。

## 核心机制

### 反馈生命周期（feedback.json）

任何人随口一句意见，一条命令入箱，走七态人生：

```
💡 idea（刚提出）→ 📐 designed（写进设计稿）→ 📋 planned（排进 ROADMAP）
→ 🔧 doing（当前版本施工中）→ ✅ done（完成，回填版本号）
                                ⚪ dropped（撤掉，留原因）
```

```bash
node feedback.js add "tips 翻得太快了" --from 试玩伙伴A --tag ui
node feedback.js plan 6                # 自动推进下一档
node feedback.js link 6 --to "ROADMAP v0.5@docs/ROADMAP.md"
node feedback.js done 6 --version v0.5.0 --commit abc123 --summary "tips 停留时间可调"
```

存储分两层：`feedback.json` 是结构化真相源；`INBOX.md` 每次操作后自动重新生成（按状态分组的表格，人类可读，**勿手改**）。

### 时间轴三文件

| 文件 | 管什么 | 形态 |
|------|--------|------|
| `ROADMAP.md` | **未来**：版本分期，每版一个主题 | 版本总览表 + 每版一节（[模板](../templates/ROADMAP.template.md)） |
| `sprints/N.md` | **现在**：当前版本的验收清单 | 见「发货口」的 Sprint 机制 |
| `PROGRESS.md` | **过去**：历史日志 | 按时间追加，只增不改 |

### 挂钩规则（追溯全靠它）

- ROADMAP 每条任务标注来源：`| 5.3 | tips 停留时间可调 | fb #6 | ⬜ |`
- 反馈升级为 planned 时，用 `link` 挂上 ROADMAP 位置
- 发版后 `done` 回填版本号和 commit
- 于是"谁提的 → 排进哪版 → 哪个 commit 做完"一个编号从头追到尾。提意见的人能亲眼看到自己的话变成游戏里的东西——谁都愿意给这样的项目继续提意见

## 建房流程

1. `feedback.js init` 建收件箱（默认 `docs/feedback/`）
2. 从 [ROADMAP 模板](../templates/ROADMAP.template.md) 建路线图，按问诊结果定版本节奏
3. 入驻问诊"想法大倒仓"的分拣结果在这里入库：小想法 `add`、已排期的写进 ROADMAP 并互相挂链

## AI 日常纪律

- 用户转述的任何意见，**顺手入箱**，标 `--from`，不让它蒸发
- 状态不跳档：idea 直接标 done 说明流程里少了记录，补齐中间态
- 发版后立刻回填：把该版做完的反馈全部 `done --version`
- ROADMAP 的修改走章节替换（`truth.js update ROADMAP.md --section "v0.5"`），别整文件重写
