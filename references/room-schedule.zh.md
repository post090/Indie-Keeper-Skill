# 调度室（版本日期 + 工期预估）

解决两个痛点："这个啥时候发？"和"没日期的计划都会悄悄滑"。

## 核心机制

### 两层规划（ROADMAP vs schedule）

| 文件 | 它是什么 | 形式 |
|------|---------|------|
| `ROADMAP.md` | **叙述层**：版本主题、目标、每个版本对玩家意味着什么 | 人类可读的 markdown |
| `schedule.json` | **日历层**：结构化日期、工期、依赖、置信度 | JSON，CLI 和 WIKI 甘特图读取的真相源 |

这么拆是有意的：ROADMAP 用来读（"v0.5 的故事是什么？"），schedule.json 用来算（"如果 0.5.2 从 3 天变成 5 天，v0.5 会滑吗？"）。两者靠约定保持同步——版本主题变了改 ROADMAP；日期或工期变了改 schedule.json。

### schedule.json 结构

```json
{
  "version": 1,
  "versions": [
    {
      "id": "v0.1",
      "title": "首个可玩版",
      "status": "in-progress",
      "milestone": "2026-08-15",
      "items": [
        {
          "id": "0.1.1",
          "title": "玩家移动",
          "estimate": 3,
          "start": "2026-08-01",
          "due": "2026-08-04",
          "dependsOn": [],
          "status": "doing",
          "confidence": "high"
        }
      ]
    }
  ]
}
```

字段说明：
- `version.status`：`planned`（计划中）/ `in-progress`（进行中）/ `shipped`（已发）/ `paused`（搁置）
- `item.status`：`todo`（待办）/ `doing`（施工中）/ `done`（完成）/ `blocked`（卡住）/ `dropped`（撤掉）
- `estimate`：天数（整数）。瞎猜也比没有强——0.1.1 是 3 天还是 30 天，计划完全不一样
- `dependsOn`：同版本内兄弟条目的 id 列表。甘特图会用箭头连线；`check` 会抓悬空引用
- `confidence`：`high` / `low`。甘特图把 `low` 的任务条画成虚线轮廓，让人一眼看到不确定性
- `milestone`：版本目标发布日期。滑了就老实改日期，让甘特图重渲染，绝不让计划撒谎

### 添加和推进条目

```bash
node schedule.js init                                       # 创建空的 schedule.json
node schedule.js add "玩家移动" --version v0.1 --estimate 3 --start 2026-08-01 --due 2026-08-04
node schedule.js add "摄像机跟随" --version v0.1 --estimate 2 --depends 0.1.1 --confidence low
node schedule.js list --version v0.1
node schedule.js bump 0.1.1 --status doing
node schedule.js edit 0.1.1 --estimate 5                    # 现实变了——更新工期
node schedule.js done 0.1.1
node schedule.js drop 0.1.3                                 # 撤掉这条，原因留在 title 里
```

条目 id 按版本自动分配（`<版本id>.<序号>`），`add` 不用自己造。

### 甘特视图（在 WIKI 里）

`keeper site serve` 把 schedule 渲染成 ROADMAP 页面内的可交互甘特图（不是盖住整页的独立视图——是同页内的可展开 section）：

- **任务条**可点击 → 弹详情卡片，含 sprint 文档跳转链接
- **依赖关系**用箭头连线
- **置信度**：`low` 的任务条画成虚线轮廓，瞎猜的工期一眼可见
- **缩放控件**：+/- / 还原 / 全宽
- **`keeper schedule gantt --out schedule.svg`** 导出独立 SVG，离线分享用

### 体检（check）

```bash
node schedule.js check
```

三项检查，任一失败 exit 1（可接 CI）：
1. **条目 id 重复**——两个条目共用同一 id（会破坏 `dependsOn` 解析）
2. **悬空依赖**——`dependsOn` 指向不存在的 id
3. **截止早于开始**——某条目的 `due` 日期早于 `start` 日期

## 房间搭建流程

1. `schedule.js init` 创建 `schedule.json`（建议放 `docs/schedule.json`）
2. 把 ROADMAP 里已有的版本加进来（先 id + title + status + milestone——条目等排进版本再 add）
3. 当 ROADMAP 的某个任务排进版本时，当天就 `add` 进来并给个工期。没工期的条目也比没条目强。
4. 这个房间挨着发货口装——一旦版本有了目标日期，甘特图就是最有用的规划视图

## AI 日常纪律

- **任务排进版本的那一刻就加进 schedule。**"等会儿加"是计划偏离现实的开始。
- **工期要诚实，不要乐观。** 瞎猜就标 `confidence: low`——甘特图的虚线轮廓告诉人"这条可能不准"。
- **里程碑滑了，改 schedule.json 里的日期，让甘特图重渲染。** 绝不让计划对现实撒谎。ROADMAP 的叙述保持稳定；日历跟着动。
- **改完跑 `keeper schedule check`**——抓重复 id、悬空依赖、日期倒挂。
- **依赖是为了排序，不是为了追责。** 0.5.3 依赖 0.5.2，0.5.2 滑了，甘特图会显示连锁反应——那是信息，不是判决。
- **`done` 和 `drop` 都是终态。** 撤掉的条目留在文件里（status=dropped），保留"我们考虑过这个，最后决定不做"的历史——绝不删条目。
