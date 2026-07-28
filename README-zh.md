# K Teach

[English](README.md) · 简体中文

K Teach 是一个 Agent Skill，用来把 AI Agent 变成能够持续陪伴学习、围绕使命推进的老师。它帮助 Agent 理解你想学什么，设计下一节真正有用的课，生成精致的学习体验，并根据你实际表现出来的理解调整后续教学。

它遵循开放的 Agent Skills 格式。`SKILL.md` 是平台无关的核心契约，因此任何兼容的 Agent 平台都可以复用同一套教学流程、参考资料、模板资产与确定性 CLI。

## 平台兼容性

K Teach 不依赖 Codex、ChatGPT、Claude 或其他特定 Agent 运行时。兼容平台通过
`SKILL.md` 发现并使用这个 Skill。`agents/` 下的文件只是可选的平台 UI
适配层；例如 `agents/openai.yaml` 用来改善 OpenAI/Codex 中的展示，但它不定义
Skill，也不会影响其他平台上的行为。

## Skill 能做什么

K Teach 指导 Agent 完成完整的教学循环：

1. 明确具体的学习使命和可观察的成功标准。
2. 读取已有知识、学习记录、可信资料和稳定偏好。
3. 选择略高于学习者当前水平的最小有效挑战。
4. 使用可信的一手资料核实课程中的事实。
5. 创建包含讲解、练习、反馈和检索活动的 Lesson Bundle。
6. 根据教学目的选择文本、确定性图解或可选的生成式视觉。
7. 渲染精致的本地 Web Lesson。
8. 记录已经表现出来的学习证据，并据此决定下一步教什么。

最终得到的不是一连串互不关联的回答，而是一个能跨会话保存学习使命、课程内容、学习证据和教学决策的持续学习工作空间。

## 什么时候使用 K Teach

当你希望 AI Agent 完成以下任务时，可以使用这个 Skill：

- 围绕一个主题持续教学多个会话；
- 把宽泛目标转化为可执行的学习路径；
- 创建或修改一节课；
- 通过练习和反馈讲清楚困难概念；
- 构建可交互的本地课程页面；
- 跟踪已经表现出来的理解与误区；
- 在确实有助于理解时创建图解或视觉学习资产；
- 把选定的课程内容派生为微信公众号文章。

示例请求：

```text
使用 K Teach 帮我学习分布式系统。

继续我的 TypeScript 学习工作空间，设计下一节课。

把这个概念设计成一节 15 分钟的课，包含练习和检索测试。

创建一个图解，解释这节课中的状态转换。
```

## 教学模型

### Learning Workspace

一个主题对应一个学习使命的持久化本地工作空间。它保存学习使命、可信资料、术语表、稳定偏好、学习记录、Lesson Bundle 和渲染产物。

### Lesson Bundle

一节课的唯一权威内容源，包含与渠道无关的正文、元数据、练习、反馈规则和原始媒体。渲染产物可以重新组织或压缩内容，但不能改变事实、目标、引用和答案。

### 已表现出的学习

K Teach 不把阅读、接触内容或打开页面视为已经学会。只有当学习者能够解释、回忆、应用、迁移知识或纠正重要误区时，才记录学习证据。

### 一节课，一个学习成果

每节课只面向一个具体能力，并遵循紧凑的教学循环：

- 激活相关的已有知识；
- 只解释完成任务所需的内容；
- 提供贴近真实目标的练习；
- 把具体反馈放在学习行为旁边；
- 最后在不回看的情况下完成检索测试。

## 可以生成什么

K Teach 可以生成：

- **Web Lesson**：包含练习与答案的完整本地学习体验；
- **Diagram**：确定性生成、可访问的 SVG 教学图解；
- **生成式视觉**：通过明确视觉计划登记的可选插图；
- **微信公众号文章**：仅从明确的 Publication Brief 派生的公开内容；
- **学习记录**：能够改变后续教学决策的简洁学习证据。

生成式视觉永远不是完成核心课程的必要条件。本地课程默认保持私有；公开发布是独立且必须明确授权的操作。

## 安装

先全局安装持久 CLI，再初始化目标项目：

```bash
npm install -g k-teach@latest
cd your-learning-project
k-teach init
```

`init` 会创建持久的 `k-teach/` Learning Workspace，并为检测到或显式选择的
Agent 生成项目级集成。自动化场景可以使用：

```bash
k-teach init --tools codex,claude
```

支持使用 `npx k-teach init --tools ...` 做一次性试用；generated Skill 会通过
`PATH` 调用 `k-teach`，因此持久 Agent 使用仍需要全局 CLI。

## 仓库结构

```text
k-teach/
├── SKILL.md          # Agent 工作流和行为边界
├── references/       # 教学、领域、视觉和发布指南
├── assets/           # 课程、视觉和发布模板
├── schemas/          # 学习与发布产物契约
├── agents/           # 可选的平台 UI 适配层
├── src/              # 确定性支撑操作源码
├── bin/               # 内置命令入口
└── tests/             # 契约与行为测试
```

首先阅读 [`SKILL.md`](SKILL.md)。`references/` 中是更深入的专项说明，Skill 只在具体任务需要时加载。

## 内置支撑工具

K Teach 包含一个小型确定性 CLI，供 Skill 执行需要可复现、可测试的操作：

- 初始化和校验 Learning Workspace；
- 渲染 Web Lesson 和结构化教学图解；
- 预览本地课程；
- 登记外部生成的视觉资产；
- 渲染选定的微信公众号文章；
- 执行经过明确授权的微信发布操作。

CLI 服务于 Skill，但不负责决定教什么。

```bash
k-teach capabilities --json
k-teach tools --json
k-teach init --tools codex,claude
k-teach update
k-teach validate
k-teach render web
k-teach preview
```

## 开发

克隆仓库并安装开发依赖：

```bash
git clone git@github.com:kunbo928/k-teach.git
cd k-teach
pnpm install
```

开发环境需要 Node.js `>= 22.18` 和 pnpm。

```bash
pnpm build
pnpm typecheck
pnpm test
```

请修改 `src/` 中的 TypeScript 源码，然后重新生成 `dist/`；不要直接编辑 `dist/`。

## 安全边界

- 不同渠道产物中的事实、资料来源、学习目标和答案必须保持一致。
- 不得把凭证写入 Skill、工作空间、产物、清单或日志。
- 微信操作只使用官方 API。
- 不得假设本地课程已经公开。
- 公开发布前必须在当前交互式终端中再次确认。
- 发布尝试开始后，渲染产物视为不可变。

## 文档

- [`references/teaching-workflow.md`](references/teaching-workflow.md)
- [`references/core-contracts.md`](references/core-contracts.md)
- [`references/diagrams.md`](references/diagrams.md)
- [`references/visual-providers.md`](references/visual-providers.md)
- [`references/wechat-rendering.md`](references/wechat-rendering.md)
