import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  confirmInteractivePublish,
  createWechatDraft,
  createOrReuseAuthorizedWechatDraft,
  doctorWechat,
  previewWechatDraft,
  publishWechatDraft,
  queryWechatStatus,
  resolveWechatCredentials,
  stateForWechatPublishStatus,
  WechatDraftAttentionRequired,
} from "../src/wechat-publisher.ts";
import { KTeachError } from "../src/errors.ts";
import { validateDocument } from "../src/schema.ts";

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-publisher-"));
  const artifactDir = path.join(
    workspace,
    ".k-teach",
    "output",
    "wechat",
    "public-lesson",
  );
  await mkdir(path.join(artifactDir, "cover"), { recursive: true });
  await mkdir(path.join(artifactDir, "media"), { recursive: true });
  await writeFile(
    path.join(artifactDir, "article.html"),
    '<section><p><img src="KT_WECHAT_MEDIA_001"></p></section>',
  );
  await writeFile(path.join(artifactDir, "cover", "cover.jpg"), "cover");
  await writeFile(path.join(artifactDir, "media", "diagram.png"), "image");
  await writeFile(
    path.join(artifactDir, "manifest.json"),
    JSON.stringify({
      schema_version: 2,
      id: "wechat-public-lesson",
      kind: "wechat-article",
      channel: "wechat",
      generator: "k-teach-wechat-v2",
      generated_at: "brief-r1",
      lesson: { id: "lesson", revision: "lesson-r1" },
      design_profile: { id: "classic-manual", revision: "1" },
      artifact_revision: "artifact-r1",
      publication_brief: {
        id: "public-lesson",
        revision: "brief-r1",
        draft_delivery: { account_alias: "main", authorized: true },
        authorized_for_publication: true,
      },
      article: { title: "公开课", author: "K Teach", digest: "摘要" },
      channel_theme: "emerald-editorial",
      article_type: "analysis",
      input_hash: "input-hash",
      input_sources: ["lessons/lesson/lesson.yaml", "lessons/lesson/lesson.md", "publications/public-lesson.yaml"],
      files: ["article.html", "cover/cover.jpg", "media/diagram.png"],
      media: [
        { kind: "cover", source: "fixture", file: "cover/cover.jpg", content_hash: "cover-hash" },
        {
          kind: "diagram",
          source: "fixture",
          placeholder: "KT_WECHAT_MEDIA_001",
          file: "media/diagram.png",
          content_hash: "media-hash",
        },
      ],
      capabilities_used: ["wechat-renderer"],
      warnings: [],
      validation: { errors: [], warnings: [], eligible_for_draft: true },
      eligible_for_draft: true,
      eligible_for_publication: true,
    }),
  );
  return { workspace, artifactDir };
}

async function withMockWechat(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: request.method, url: request.url, body });
    const result = handler(request.url, body);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("official publisher uploads media, drafts, previews, confirms publish, and maps terminal status", async () => {
  const { workspace, artifactDir } = await fixture();
  const mock = await withMockWechat((url) => {
    if (url === "/cgi-bin/stable_token")
      return { access_token: "secret-access-token", expires_in: 7200 };
    if (url.startsWith("/cgi-bin/media/uploadimg"))
      return { url: "https://mmbiz.qpic.cn/body.png" };
    if (url.startsWith("/cgi-bin/material/add_material"))
      return { media_id: "cover-media-id", url: "https://mmbiz.qpic.cn/cover.jpg" };
    if (url.startsWith("/cgi-bin/draft/add"))
      return { media_id: "draft-media-id" };
    if (url.startsWith("/cgi-bin/message/mass/preview"))
      return { errcode: 0, errmsg: "previewmsg success" };
    if (url.startsWith("/cgi-bin/freepublish/submit"))
      return { publish_id: "publish-id" };
    if (url.startsWith("/cgi-bin/freepublish/get"))
      return {
        publish_id: "publish-id",
        publish_status: 0,
        article_id: "article-id",
        article_detail: {
          item: [{ article_url: "https://mp.weixin.qq.com/s/example" }],
        },
      };
    return { errcode: 404, errmsg: "unexpected" };
  });
  const options = {
    cwd: workspace,
    accountAlias: "main",
    credentials: { appId: "fake-app-id", appSecret: "fake-app-secret" },
    apiBaseUrl: mock.baseUrl,
    cacheDir: path.join(workspace, "cache"),
  };

  try {
    const drafted = await createWechatDraft(artifactDir, options);
    assert.equal(drafted.state, "draft_created");
    assert.equal(drafted.schema_version, 2);
    assert.equal(drafted.account.app_id_suffix, "app-id");
    assert.equal(drafted.authorization.brief_revision, "brief-r1");
    assert.equal(drafted.authorization.authorized_for_draft, true);
    assert.equal(drafted.authorization.draft_account_alias, "main");
    assert.equal(drafted.remote_ids.draft_media_id, "draft-media-id");
    assert.equal(drafted.remote_ids.cover_media_id, "cover-media-id");
    assert.equal(drafted.media_uploads.KT_WECHAT_MEDIA_001, "https://mmbiz.qpic.cn/body.png");
    assert.deepEqual(await validateDocument("publication-attempt", drafted), []);

    const previewed = await previewWechatDraft(drafted.id, "openid-sensitive", options);
    assert.equal(previewed.state, "previewed");
    assert.ok(previewed.preview_recipient_hash);
    assert.doesNotMatch(JSON.stringify(previewed), /openid-sensitive/);

    await assert.rejects(
      () => publishWechatDraft(drafted.id, options, async () => false),
      (error) => error instanceof KTeachError && error.code === "validation-failed",
    );
    const publishing = await publishWechatDraft(
      drafted.id,
      options,
      async (summary) => {
        assert.deepEqual(summary, {
          account_alias: "main",
          title: "公开课",
          draft_media_id: "draft-media-id",
          media_count: 2,
        });
        return true;
      },
    );
    assert.equal(publishing.state, "polling");
    assert.equal(publishing.remote_ids.publish_id, "publish-id");

    const published = await queryWechatStatus(drafted.id, options);
    assert.equal(published.state, "published");
    assert.equal(published.remote_ids.article_id, "article-id");
    assert.equal(
      published.remote_ids.article_url_0,
      "https://mp.weixin.qq.com/s/example",
    );

    const persisted = JSON.parse(
      await readFile(
        path.join(workspace, ".k-teach", "publication-attempts", `${drafted.id}.json`),
        "utf8",
      ),
    );
    assert.equal(persisted.state, "published");
    assert.doesNotMatch(JSON.stringify(persisted), /secret-access-token|fake-app-secret|openid-sensitive/);
    if (process.platform !== "win32") {
      assert.equal((await stat(path.join(workspace, "cache", "wechat-main-token.json"))).mode & 0o777, 0o600);
    }

    const draftRequest = mock.requests.find((entry) =>
      entry.url.startsWith("/cgi-bin/draft/add"),
    );
    assert.match(draftRequest.body, /https:\/\/mmbiz\.qpic\.cn\/body\.png/);
    assert.doesNotMatch(draftRequest.body, /KT_WECHAT_MEDIA_001/);
  } finally {
    await mock.close();
  }
});

test("publisher maps platform rejection and preserves unknown writes without replay", async () => {
  const { workspace, artifactDir } = await fixture();
  let draftCalls = 0;
  const rejected = await withMockWechat((url) => {
    if (url === "/cgi-bin/stable_token")
      return { access_token: "token", expires_in: 7200 };
    if (url.startsWith("/cgi-bin/media/uploadimg"))
      return { url: "https://mmbiz.qpic.cn/body.png" };
    if (url.startsWith("/cgi-bin/material/add_material"))
      return { media_id: "cover-id" };
    if (url.startsWith("/cgi-bin/draft/add")) {
      draftCalls += 1;
      return { errcode: 48001, errmsg: "api unauthorized" };
    }
    return {};
  });
  const options = {
    cwd: workspace,
    accountAlias: "main",
    credentials: { appId: "app", appSecret: "secret" },
    apiBaseUrl: rejected.baseUrl,
    cacheDir: path.join(workspace, "cache"),
  };
  try {
    await assert.rejects(
      () => createWechatDraft(artifactDir, options),
      (error) => error instanceof KTeachError && error.code === "account-ineligible",
    );
    assert.equal(draftCalls, 1);
  } finally {
    await rejected.close();
  }

  const unknownOptions = {
    ...options,
    apiBaseUrl: "http://127.0.0.1:1",
    cacheDir: path.join(workspace, "unknown-cache"),
  };
  await assert.rejects(
    () => createWechatDraft(artifactDir, unknownOptions),
    (error) => error instanceof KTeachError && error.code === "remote-unknown",
  );
  const attemptsDir = path.join(workspace, ".k-teach", "publication-attempts");
  const names = await import("node:fs/promises").then(({ readdir }) => readdir(attemptsDir));
  const attempts = await Promise.all(
    names.map(async (name) => JSON.parse(await readFile(path.join(attemptsDir, name), "utf8"))),
  );
  assert.ok(attempts.some((attempt) => attempt.state === "unknown"));
});

test("authorized draft orchestration reuses success and blocks uncertain replay", async () => {
  const { workspace, artifactDir } = await fixture();
  let draftCalls = 0;
  const mock = await withMockWechat((url) => {
    if (url === "/cgi-bin/stable_token") return { access_token: "token", expires_in: 7200 };
    if (url.startsWith("/cgi-bin/media/uploadimg")) return { url: "https://mmbiz.qpic.cn/body.png" };
    if (url.startsWith("/cgi-bin/material/add_material")) return { media_id: "cover-id" };
    if (url.startsWith("/cgi-bin/draft/add")) { draftCalls += 1; return { media_id: "draft-id" }; }
    return {};
  });
  const options = { cwd: workspace, accountAlias: "main", credentials: { appId: "app", appSecret: "secret" }, apiBaseUrl: mock.baseUrl, cacheDir: path.join(workspace, "cache") };
  try {
    const first = await createOrReuseAuthorizedWechatDraft(artifactDir, options);
    const second = await createOrReuseAuthorizedWechatDraft(artifactDir, options);
    assert.equal(second.id, first.id);
    assert.equal(draftCalls, 1);
  } finally { await mock.close(); }

  const { workspace: unknownWorkspace, artifactDir: unknownArtifact } = await fixture();
  const unknown = { ...options, cwd: unknownWorkspace, apiBaseUrl: "http://127.0.0.1:1", cacheDir: path.join(unknownWorkspace, "cache") };
  await assert.rejects(() => createOrReuseAuthorizedWechatDraft(unknownArtifact, unknown), (error) => error instanceof WechatDraftAttentionRequired);
  await assert.rejects(() => createOrReuseAuthorizedWechatDraft(unknownArtifact, unknown), (error) => error instanceof WechatDraftAttentionRequired);
});

test("draft orchestration rejects mismatched authorization before remote access", async () => {
  const { workspace, artifactDir } = await fixture();
  const manifestPath = path.join(artifactDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.publication_brief.draft_delivery.account_alias = "other";
  await writeFile(manifestPath, JSON.stringify(manifest));
  let calls = 0;
  const mock = await withMockWechat(() => { calls += 1; return {}; });
  try {
    await assert.rejects(() => createOrReuseAuthorizedWechatDraft(artifactDir, { cwd: workspace, accountAlias: "main", credentials: { appId: "app", appSecret: "secret" }, apiBaseUrl: mock.baseUrl }), /does not authorize/);
    assert.equal(calls, 0);
  } finally { await mock.close(); }
});

test("doctor is read-only, reports capability uncertainty, and maps rate limits", async () => {
  assert.deepEqual(
    resolveWechatCredentials("primary-cn", {
      K_TEACH_WECHAT_PRIMARY_CN_APP_ID: "app",
      K_TEACH_WECHAT_PRIMARY_CN_APP_SECRET: "secret",
    }),
    { appId: "app", appSecret: "secret" },
  );
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-doctor-"));
  const healthy = await withMockWechat((url) =>
    url === "/cgi-bin/stable_token"
      ? { access_token: "token", expires_in: 7200 }
      : { errcode: 404, errmsg: "unexpected" },
  );
  try {
    const report = await doctorWechat({
      cwd: workspace,
      accountAlias: "main",
      credentials: { appId: "app", appSecret: "secret" },
      apiBaseUrl: healthy.baseUrl,
      cacheDir: path.join(workspace, "healthy-cache"),
    });
    assert.deepEqual(report, {
      account_alias: "main",
      credentials: "configured",
      token: "reachable",
      materials: "unverified",
      drafts: "unverified",
      preview: "unverified",
      publish: "unverified",
    });
    assert.deepEqual(
      healthy.requests.map(({ method, url }) => ({ method, url })),
      [{ method: "POST", url: "/cgi-bin/stable_token" }],
    );
  } finally {
    await healthy.close();
  }

  const limited = await withMockWechat(() => ({
    errcode: 45009,
    errmsg: "reach max api daily quota limit",
  }));
  try {
    await assert.rejects(
      () =>
        doctorWechat({
          cwd: workspace,
          accountAlias: "main",
          credentials: { appId: "app", appSecret: "secret" },
          apiBaseUrl: limited.baseUrl,
          cacheDir: path.join(workspace, "limited-cache"),
        }),
      (error) => error instanceof KTeachError && error.code === "rate-limited",
    );
  } finally {
    await limited.close();
  }

  assert.equal(
    await confirmInteractivePublish({
      account_alias: "main",
      title: "公开课",
      draft_media_id: "draft-id",
      media_count: 2,
    }),
    false,
  );
});

test("one frozen artifact creates isolated attempts and remote IDs for accounts A and B", async () => {
  const { workspace, artifactDir } = await fixture();
  const mockFor = async (suffix) => withMockWechat((url) => {
    if (url === "/cgi-bin/stable_token") return { access_token: `token-${suffix}`, expires_in: 7200 };
    if (url.startsWith("/cgi-bin/media/uploadimg")) return { url: `https://mmbiz.qpic.cn/${suffix}.png` };
    if (url.startsWith("/cgi-bin/material/add_material")) return { media_id: `cover-${suffix}` };
    if (url.startsWith("/cgi-bin/draft/add")) return { media_id: `draft-${suffix}` };
    return { errcode: 404, errmsg: "unexpected" };
  });
  const mockA = await mockFor("a");
  const mockB = await mockFor("b");
  try {
    const attemptA = await createWechatDraft(artifactDir, {
      cwd: workspace,
      accountAlias: "a",
      accountName: "帐号 A",
      credentials: { appId: "wx-account-a", appSecret: "secret-a" },
      apiBaseUrl: mockA.baseUrl,
      cacheDir: path.join(workspace, "cache-a"),
    });
    const attemptB = await createWechatDraft(artifactDir, {
      cwd: workspace,
      accountAlias: "b",
      accountName: "帐号 B",
      credentials: { appId: "wx-account-b", appSecret: "secret-b" },
      apiBaseUrl: mockB.baseUrl,
      cacheDir: path.join(workspace, "cache-b"),
    });
    assert.notEqual(attemptA.id, attemptB.id);
    assert.equal(attemptA.artifact_id, attemptB.artifact_id);
    assert.equal(attemptA.artifact_revision, attemptB.artifact_revision);
    assert.deepEqual(attemptA.remote_ids, { cover_media_id: "cover-a", draft_media_id: "draft-a" });
    assert.deepEqual(attemptB.remote_ids, { cover_media_id: "cover-b", draft_media_id: "draft-b" });
    assert.equal(attemptA.account.name, "帐号 A");
    assert.equal(attemptB.account.name, "帐号 B");
    assert.doesNotMatch(JSON.stringify([attemptA, attemptB]), /secret-a|secret-b|token-a|token-b/);
  } finally {
    await mockA.close();
    await mockB.close();
  }
});

test("publish polling maps every documented terminal and retry state", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 99].map(stateForWechatPublishStatus),
    ["published", "polling", "failed", "failed", "review_rejected", "deleted", "blocked", "failed"],
  );
});
