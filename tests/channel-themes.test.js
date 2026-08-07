import assert from "node:assert/strict";
import test from "node:test";

import {
  applyChannelTheme,
  CHANNEL_THEME_IDS,
  CHANNEL_THEMES,
  resolveChannelTheme,
  styleWechatArticle,
  WECHAT_ARTICLE_BASELINE,
} from "../src/channel-themes.ts";

test("three Channel Themes own complete unique visual tokens", () => {
  assert.equal(CHANNEL_THEME_IDS.length, 3);
  assert.equal(CHANNEL_THEMES.length, 3);
  assert.equal(new Set(CHANNEL_THEMES.map((theme) => theme.id)).size, 3);
  assert.equal(
    new Set(CHANNEL_THEMES.map((theme) => theme.colors.accent)).size,
    3,
  );
  for (const theme of CHANNEL_THEMES) {
    assert.equal(resolveChannelTheme(theme.id), theme);
    assert.ok(theme.label.length >= 3);
    assert.ok(theme.reason.length >= 8);
    assert.match(theme.colors.background, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.ink, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.accent, /^#[0-9A-F]{6}$/i);
    assert.ok(theme.radius.length >= 1);
  }
});

test("Channel Theme mapping produces distinct platform-safe WeChat palettes", () => {
  const base = `<section style="background:${WECHAT_ARTICLE_BASELINE.paper};color:${WECHAT_ARTICLE_BASELINE.ink};border:1px solid ${WECHAT_ARTICLE_BASELINE.line}"><span leaf="">正文</span><strong style="color:${WECHAT_ARTICLE_BASELINE.accent}">重点</strong><p style="background:${WECHAT_ARTICLE_BASELINE.note};color:${WECHAT_ARTICLE_BASELINE.muted}">说明</p></section>`;
  const outputs = CHANNEL_THEMES.map((theme) => ({
    theme,
    html: applyChannelTheme(base, theme),
  }));
  assert.equal(new Set(outputs.map(({ html }) => html)).size, 3);
  for (const { theme, html } of outputs) {
    assert.match(html, new RegExp(theme.colors.background, "i"));
    assert.match(html, new RegExp(theme.colors.accent, "i"));
    assert.match(html, /<span leaf="">/);
    assert.doesNotMatch(html, /<style|class=|display:grid/i);
  }
});

test("styleWechatArticle applies Channel Theme recipe markers without Teaching Theme ids", () => {
  const brief = {
    schema_version: 2,
    id: "brief",
    revision: "r1",
    lesson_id: "lesson",
    lesson_revision: "r1",
    title: "标题",
    audience: "读者",
    angle: "角度",
    include: [],
    exclude: [],
    channel_theme: "graphite-minimal",
    article_type: "analysis",
    author: "作者",
    summary: "摘要",
    cover: { mode: "generated" },
    authorized_for_publication: false,
  };
  const base = `<section style="box-sizing:border-box;max-width:100%;background:${WECHAT_ARTICLE_BASELINE.paper};"><p style="padding-left:12px;border-left:3px solid ${WECHAT_ARTICLE_BASELINE.accent}">段落</p></section>`;
  const html = styleWechatArticle(base, brief);
  assert.match(html, /FIELD NOTE · ANALYSIS/);
  assert.match(html, /#A52A2A|#181818/i);
  assert.doesNotMatch(html, /classic-manual|editorial-desk|nature-explorer/);
});
