import assert from "node:assert/strict";
import test from "node:test";

import {
  emitPptThemeCss,
  emitWebTeachingThemesCss,
  resolveTeachingTheme,
  TEACHING_THEME_IDS,
  TEACHING_THEMES,
} from "../src/teaching-themes.ts";
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
    assert.match(theme.colors.accentInk, /^#[0-9A-F]{6}$/i);
    assert.match(theme.colors.accentSoft, /^#[0-9A-F]{6}$/i);
    assert.ok(theme.display.length > 8);
    assert.ok(theme.radius.length >= 1);
    assert.ok(theme.surface);
  }
});

test("Teaching Theme catalog emits Web and PPT styles from one source", () => {
  const web = emitWebTeachingThemesCss();
  const ppt = emitPptThemeCss();
  for (const theme of TEACHING_THEMES) {
    assert.match(web, new RegExp(`data-teaching-theme="${theme.id}"`));
    assert.match(web, new RegExp(theme.colors.accent.toLowerCase(), "i"));
    assert.match(ppt, new RegExp(`data-theme="${theme.id}"`));
    assert.match(ppt, new RegExp(theme.colors.accent, "i"));
    if (theme.pptChrome) assert.match(ppt, new RegExp(theme.id));
  }
  assert.match(web, /data-theme="night"/);
  assert.match(web, /@media print/);
  assert.match(web, /\.teaching-theme-select/);
  assert.match(ppt, /storybook.*slide::before|slide::before.*storybook/s);
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
