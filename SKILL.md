---
name: k-teach
description: Create or revise source-grounded lessons, exercises, learning pages, WeChat articles/drafts, and HTML slide decks. Use for teaching content, learning assets, official-account content, or PPT-style presentations.
---

# K Teach

Choose `learn`, `wechat`, or `ppt`; if unclear ask once: 学习、公众号还是 PPT？
Resolve the Teach/Lesson only when missing. Semantic authoring is required for new
or revised material, not rerenders.

Use one resumable command:

```sh
k-teach generate --intent learn --lesson <id> --json
k-teach generate --intent ppt --brief <id> --json
k-teach generate --intent wechat --brief <id> [--draft] --json
```

Follow only `state` and `next_action.code`:

- `needs_input`: obtain listed fields; rerun.
- `needs_plan`: review its Plan/delta. Keep a faithful reference-only scaffold,
  or edit semantic order/grouping, short source-backed wording, notes, or cuts;
  rerun the same command.
- `complete`: report artifact/attempt refs, never artifact contents.
- `attention_required`: perform its single safe action; never replay an uncertain
  remote write.
- `failed`: follow its code; fetch details only when needed.

Load one optional reference only for the active decision:

- Lesson/exercise/feedback: [teaching-workflow.md](references/teaching-workflow.md)
- Diagram type: [diagrams.md](references/diagrams.md)
- Generated visual: [visual-providers.md](references/visual-providers.md)
- Teaching Theme: [teaching-themes.md](references/teaching-themes.md)
- WeChat semantics/delivery: [wechat-rendering.md](references/wechat-rendering.md)
- Domain/adapters: [core-contracts.md](references/core-contracts.md)
- Ambiguous channel: [output-intents.md](references/output-intents.md)

Rules: the Lesson Bundle is authoritative; each intent derives independently and
enforces its privacy; Plans/artifacts cannot change facts, sources, objectives,
exercises, or answers. Local generation, draft, recipient preview, and public
publication require separate authorization. Never place secrets in prompts,
files, commands, artifacts, manifests, or logs.
