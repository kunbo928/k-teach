# WeChat rendering

Create a Publication Brief only when the user explicitly selects lesson
content for public distribution. Save it as `publications/<brief-id>.yaml`.
Start from [the bundled template](../assets/publication-brief/wechat.yaml).
Set `channel_theme` to `emerald-editorial` (default), `graphite-minimal`, or
`olive-journal`, and set `article_type` to `tutorial`, `analysis`, or
`narrative`. Channel Themes are independent of the seven Web/PPT Teaching
Themes.

The brief must match the current Lesson Bundle revision. `include` and
`exclude` use exact level-two headings from `lesson.md`; exclusions win.
Exercises, answers, progress, feedback controls, and local Web Lesson links are
never read into the article.

Generate locally:

```sh
k-teach generate --intent wechat --brief <brief-id> --json
```

Only when the user explicitly asks to compare themes, use the narrow proposal
and preview diagnostics after Generation Run completes. Keep preview alive and
return its printed HTTP URL; do not hand off a `file://` URL.

Output lives under `.k-teach/output/wechat/<brief-id>/`:

- `article.html`: a clean `<section>` fragment with inline styles and
  `<span leaf="">` text wrappers;
- `preview.html`: a local-only document shell with a copy button;
- `cover/cover.jpg`: a conservative sub-64 KB JPEG suitable for later
  permanent-material upload;
- `media/`: JPG/PNG content derivatives ready for `uploadimg`;
- `manifest.json`: article metadata, revisions, hashes, media placeholders,
  validation, capabilities, warnings, and publication eligibility.

Use `cover.mode: generated` for a deterministic Field Manual title cover. Use
`cover.mode: visual-asset` plus `asset_id` only for a registered, validated
cover owned by the same Lesson Bundle revision.

Reference a Diagram Spec from selected Markdown image syntax to derive its PNG:

```markdown
![处理流程](media/diagrams/request-flow.yaml)
```

Other local images are resized without enlargement and converted to JPG or
PNG. The renderer rejects external images, workspace escapes, content images
at or above the conservative 1 MB upload limit, more than 20 article images,
unsupported HTML/CSS, long metadata, unwrapped Chinese text, and warnings such
as half-width Chinese punctuation.

Embedded `diagram` assets support `flow`, `relationship`, `state`, and
`sequence`. WeChat derivation rasterizes each diagram onto a 1080 px wide paper
canvas, bounds its height to 480-1800 px, preserves the diagram kind in the
article markup, and wraps long node labels before rasterization. Use
`sequence` for participant/message timelines instead of a horizontal `flow`.

`article.html` retains placeholders such as `KT_WECHAT_MEDIA_001`. The local
preview rewrites them to local media files. A publisher must upload each
manifest media entry through the official WeChat API, replace every placeholder
with the returned WeChat URL, and upload the JPEG cover as permanent material.

`authorized_for_publication: false` still permits local rendering and later
draft preparation, but `eligible_for_publication` remains false. Rendering never
contacts WeChat and never grants publication authority.

## Official publishing

Register multiple account aliases in the user-level registry. AppID is allowed
there; AppSecret is not:

```sh
k-teach wechat account add <alias> --app-id <id> --name <display-name>
k-teach wechat account list
```

Resolve the secret from:

```text
K_TEACH_WECHAT_<ALIAS>_APP_SECRET
```

Normalize non-alphanumeric alias characters to `_` and uppercase the alias.
Never pass secrets as command arguments. Diagnose token reachability without
creating content:

```sh
k-teach doctor wechat --account <alias>
```

Create an authorized draft through Generation Run. Recipient preview remains a
separate explicit operation:

```sh
k-teach generate --intent wechat --brief <brief-id> --draft --json
k-teach wechat preview --attempt <attempt-id> --openid <openid>
```

The current Publication Brief must contain matching account-scoped
`draft_delivery` authorization. There is no fallback prompt in Generation Run.
Draft authorization never authorizes public publication.

The recipient is stored only as a SHA-256 audit hash. Public publishing requires
both Publication Brief authorization and a current interactive terminal. It has
no non-interactive confirmation bypass:

```sh
k-teach wechat publish --attempt <attempt-id> --live
k-teach wechat status --attempt <attempt-id>
```

Type the exact phrase shown by the CLI only after reviewing account, title,
draft ID, and media count. A successful submit means only that WeChat accepted
an asynchronous job. Query status until it reaches a terminal state. If a
write's network result is unknown, do not repeat it; inspect the saved record in
`.k-teach/publication-attempts/` and the WeChat backend first.
