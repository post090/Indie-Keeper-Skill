# 文档翻译部（文档多语言状态机）

解决一个痛点："原文改了，翻译过期了，没人知道。"管的是**面向玩家/用户的文档**：README、商店页文案（Steam/itch）、更新公告——不管游戏内文案（那是代码级 i18n，超出本 Skill 边界）。

## 核心机制

像游戏本地化一样管文档，三段分离：**抽模板（机器）→ 翻译（AI/人）→ 记指纹（机器）**。

- **抽模板**（`extract`）：基于源文件生成一份待翻文件——原文照贴，每段后面跟个 `[TODO]` 占位
- **翻译**：AI 或人把 `[TODO]` 换成译文，删掉占位标记
- **记指纹**（`stamp`）：译文定稿后，记下"这是基于当前这版源文件翻的"（用源文件内容哈希当指纹）。之后源文件一改，指纹对不上，立刻知道译文过期了

### 登记（docs-manifest.json）

```json
{
  "sourceLang": "zh",
  "primaryLang": "en",
  "i18nDir": "i18n-docs",
  "langs": ["zh", "en", "ja"],
  "docs": [
    { "id": "readme", "primary": "README.md", "source": "i18n-docs/README.zh.md", "desc": "项目门面" }
  ],
  "skip": [
    { "id": "license", "primary": "LICENSE", "reason": "法律文本保留原文" }
  ]
}
```

路径约定：源语言文件在 `source`；主入口语言（通常 en）占 `primary` 的原位置；其余语言放 `<i18nDir>/<名>.<lang>.md`。源语言=主入口语言时 source 和 primary 同一个文件。

### 四个动作

```bash
node docs-i18n.js init                      # 扫描现有 README/CHANGELOG 生成 manifest 草稿
node docs-i18n.js extract --doc readme --lang ja   # 抽模板：生成待翻文件（原文 + [TODO] 占位）
# ……AI/人 把 [TODO] 换成译文，删掉占位标记……
node docs-i18n.js stamp readme ja           # 记指纹：记下"该译文基于源文件的哪个版本"
node docs-i18n.js status                    # 看表：每份文档每个语言什么状态
```

状态判定全靠指纹（源文件内容哈希），`status` 输出的四种状态：
- ✅ **fresh**（同步）：译文存在，指纹对得上——原文没动过，可以放心用
- ⚠️ **stale**（过期）：原文改过了，指纹对不上——译文该重翻了
- ❓ **unknown**（未登记）：译文在，但从没记过指纹（不知道基于哪版原文翻的）
- ❌ **missing**（未翻）：这个语言还没译文

有个保险：译文里还有 `[TODO` 残留时 stamp 拒绝记指纹（`--force` 才能强记）——**没翻完的不能算翻完**。

### CI 闸门

`stamp --all --check`：只查不写，源文件或译文缺失、指纹过期或缺失、译文残留 TODO 时返回 1。挂在发版流程第 3 步，保证不带着过期翻译发货。

## 建房流程

1. 问诊：源语言、目标语言、谁翻（AI 全包 / AI 翻人审）、哪些不翻（LICENSE 等进 skip）
2. `init` 生成草稿 → 用户确认 → `extract` 抽第一批模板
3. **旧房改造注意**：已有翻译文件时，首次记指纹前逐个和用户确认"这份译文现在和原文对得上吗"——把过期译文错误地记成 fresh，之后没有任何机制能发现它，这是全系统唯一自己救不回来的错误

## AI 日常纪律

- 改了源语言文档，顺手跑 `status` 看波及面，把变 stale 的排进当前工作
- AI 自己翻译时走完整流程：extract 抽模板 → 填译文 → stamp 记指纹，**没记指纹的翻译等于没翻**
- 翻译要按目标语言的调性重写，不逐字直译；商店页文案建议人工终审（按 profile 的 `i18n.translator`）
