import assert from "node:assert/strict";
import test from "node:test";

import {
  migratePublicationAttempt,
  migratePublicationBrief,
  migrateWechatArtifactManifest,
} from "../src/contract-migrations.ts";
import { validateDocument } from "../src/schema.ts";

test("Publication Brief V1 is read as V2 without mutating the source", async () => {
  const legacy = {
    schema_version: 1,
    id: "article",
    revision: "r1",
    lesson_id: "lesson",
    lesson_revision: "l1",
    title: "Title",
    audience: "Readers",
    angle: "Angle",
    include: ["One"],
    exclude: [],
    theme: "future-lab",
    author: "Author",
    summary: "Summary",
    cover: { mode: "generated" },
    authorized_for_publication: false,
  };
  const migrated = migratePublicationBrief(legacy);
  assert.equal(legacy.schema_version, 1);
  assert.equal(legacy.theme, "future-lab");
  assert.equal(migrated.schema_version, 2);
  assert.equal(migrated.channel_theme, "emerald-editorial");
  assert.equal(migrated.article_type, "tutorial");
  assert.equal("theme" in migrated, false);
  assert.deepEqual(await validateDocument("publication-brief", legacy), []);
  assert.deepEqual(await validateDocument("publication-brief", migrated), []);
});

test("V1 manifest and attempt migration preserve remote identity and terminal state", () => {
  const manifest = migrateWechatArtifactManifest({
    schema_version: 1,
    id: "artifact-1",
    publication_brief: { id: "brief", revision: "b1", authorized_for_publication: true },
    lesson: { id: "lesson", revision: "l1" },
    article: { title: "Title", author: "Author", digest: "Digest" },
    input_hash: "hash-1",
    validation: { errors: [], warnings: [], eligible_for_draft: true },
    publication_eligibility: true,
    remote_safe_extra: "preserved",
  });
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.eligible_for_publication, true);
  assert.equal(manifest.remote_safe_extra, "preserved");

  const attempt = migratePublicationAttempt({
    schema_version: 1,
    id: "attempt-1",
    artifact_id: "artifact-1",
    artifact_dir: "/historical/artifact",
    account_alias: "account-a",
    title: "Title",
    media_count: 2,
    publication_eligibility: true,
    state: "published",
    remote_ids: { draft_media_id: "draft-a", publish_id: "publish-a" },
    media_uploads: { placeholder: "remote-url" },
    last_checked_at: "2026-08-01T00:00:00Z",
  });
  assert.equal(attempt.schema_version, 2);
  assert.equal(attempt.state, "published");
  assert.deepEqual(attempt.remote_ids, {
    draft_media_id: "draft-a",
    publish_id: "publish-a",
  });
  assert.equal(attempt.last_checked_at, "2026-08-01T00:00:00Z");
  assert.equal(attempt.account.alias, "account-a");
});

test("Presentation Brief and WeChat Account schemas reject incomplete contracts", async () => {
  const presentation = {
    schema_version: 1,
    id: "deck",
    revision: "r1",
    purpose: "teaching",
    audience: "New engineers",
    duration_minutes: 30,
    lesson_id: "lesson",
    lesson_revision: "l1",
    include: ["Model"],
    exclude: [],
    theme: { id: "classic-manual", source: "recommended", reason: "Readable teaching default" },
  };
  assert.deepEqual(await validateDocument("presentation-brief", presentation), []);
  assert.deepEqual(await validateDocument("wechat-accounts", {
    schema_version: 1,
    accounts: [{ alias: "a", name: "Account A", app_id: "wx123" }],
  }), []);
  assert.ok((await validateDocument("wechat-accounts", {
    schema_version: 1,
    accounts: [{ alias: "a", name: "Account A", app_secret: "forbidden" }],
  })).some((error) => error.includes("app_id") || error.includes("app_secret")));
});
