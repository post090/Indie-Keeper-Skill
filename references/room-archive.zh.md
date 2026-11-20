# 档案室（文档治理）

解决两个痛点："这个信息写在哪？"和"AI 改文档误伤别的章节"。

## 核心机制

### 唯一真相源（truth-source.json）

一个 JSON 登记表，规则只有一条：**每类信息只准有一个权威文件**。

```json
{
  "version": 1,
  "scanDir": "docs",
  "topics": {
    "角色": { "file": "docs/design/characters.md", "desc": "全部角色卡", "aliases": ["characters", "人设"], "authority": "负责设定的成员名" },
    "守则": { "file": "AGENTS.md", "desc": "AI 协作守则" },
    "决策": { "file": "docs/decisions", "desc": "ADR 目录（目录级登记，覆盖其下所有文件）" }
  }
}
```

字段说明：
- `aliases`：别名数组，`where` 查询时中英文都能命中
- `authority`：权威归属。**登记了 authority 的主题，AI 只组织和实现，不自由发挥**——改动前先问归属人
- `anchor`：可选，直接指到某章节
- 目录级登记：`file` 指向目录时，其下所有文件都算已登记（体检不再报未登记）

### 章节安全编辑（update）

AI 不整文件重写，只做"把《某标题》下面的内容换掉/追加"：

```bash
node truth.js sections ROADMAP.md                       # 先看有哪些章节
node truth.js update ROADMAP.md --section "v0.5" --content "..."
node truth.js update PROGRESS.md --section "日志" --append --content "..."
```

按 markdown 标题切块（代码块里的 # 不算标题），只动目标章节，其余原样保留。找不到章节时会列出标题。若多个章节匹配，使用完整标题并加 `--parent "上级标题"` 限定范围。仍有歧义时退出，文件保持原样。

### 体检（check）

三项检查，任一有问题 exit 1（可挂 CI）：
1. **死链**：登记表指向的文件不存在
2. **未登记**：`scanDir` 下的 .md 没被任何主题登记
3. **守则死链**：AGENTS.md / CLAUDE.md 等守则文件里引用的 .md 路径不存在——守则腐烂最坑 AI，优先级最高

### AI 速读区（约定，非工具）

每份重要文档顶部维护四行：

```markdown
## 📌 AI 速读区
- 一句话：……
- 当前阶段：……
- 下一步：……
- 卡点：……（没有写"无"）
```

AI 接手时先读这四行；每次大改动后顺手更新（用 `update --section "AI 速读区"`）。

## 建房间流程

1. **旧房改造**（已有文档）：跑 `truth.js init` 生成草稿 → AI 把主题名从文件名改成语义主题、补 desc/aliases → 请用户确认权威归属 → `check` 跑通
2. **从零装修**：先按 [game-docs-menu.md](game-docs-menu.md) 推荐建 1~2 份文档，边建边登记，不预先铺空架子

## AI 日常纪律

- 找信息先 `where`，不全文乱翻
- 改已登记文档只走 `update`（章节替换），新文档建完即登记
- 碰 `authority` 标注的主题，先问归属人再动
- 干完活跑 `check`；未登记文档的处理方式是**登记进真相源**（或报告用户），死链的处理方式是修正登记表——**都不是删文件**（见 SKILL.md 文档安全红线）
