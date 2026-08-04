import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTeachingTheme,
  TEACHING_THEME_IDS,
  TEACHING_THEMES,
} from "../src/teaching-themes.ts";
import { applyWechatTheme } from "../src/wechat-renderer.ts";
import { validateDocument } from "../src/schema.ts";

test("all seven Teaching Themes have complete unique visual tokens", () => {
  assert.equal(TEACHING_THEME_IDS.length, 7);
  assert.equal(TEACHING_THEMES.length, 7);
  assert.equal(new Set(TEACHING_THEMES.map((theme) => theme.id)).size, 7);
  assert.equal(
    new Set(TEACHING_THEMES.map((theme) => theme.colors.accent)).size,
    7,
  );
  for (const theme of TEACHING_THEMES) {
    assert.equal(resolveTeachingTheme(theme.id), theme);
    assert.ok(theme.label.length >= 3);
    assert.ok(theme.description.length >= 12);
    assert.match(theme.colors.background, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.surface, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.ink, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.accent, /^#[0-9A-F]{6}$/i);
    assert.ok(theme.display.length > 8);
    assert.ok(theme.radius.length > 1);
  }
});

test("all seven Teaching Themes are valid Presentation Brief choices", async () => {
  for (const theme of TEACHING_THEMES) {
    const brief = {
      schema_version: 1,
      id: `brief-${theme.id}`,
      revision: "2026-07-31T00:00:00Z",
      purpose: "teaching",
      duration_minutes: 30,
      lesson_id: "lesson-01",
      lesson_revision: "2026-07-31T00:00:00Z",
      audience: "学习者",
      include: [],
      exclude: [],
      theme: { id: theme.id, source: "brief", reason: "验证主题" },
    };
    assert.deepEqual(
      await validateDocument("presentation-brief", brief),
      [],
      theme.id,
    );
  }
});

test("all seven Teaching Themes produce distinct platform-safe WeChat palettes", () => {
  const base =
    '<section style="background:#F5F1E8;color:#1C2822;border:1px solid #BBC3BD"><span leaf="">正文</span><strong style="color:#315C49">重点</strong><p style="background:#E7E8DE;color:#66716B">说明</p></section>';
  const outputs = TEACHING_THEMES.map((theme) => ({
    theme,
    html: applyWechatTheme(base, theme),
  }));
  assert.equal(new Set(outputs.map(({ html }) => html)).size, 7);
  for (const { theme, html } of outputs) {
    assert.match(html, new RegExp(theme.colors.background, "i"));
    assert.match(html, new RegExp(theme.colors.accent, "i"));
    assert.match(html, /<span leaf="">/);
    assert.doesNotMatch(html, /<style|class=|display:grid/i);
  }
});
