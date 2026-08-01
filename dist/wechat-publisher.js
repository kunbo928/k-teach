import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";


import { KTeachError,                } from "./errors.js";
import { validateDocument } from "./schema.js";
import {
  migratePublicationAttempt,
  migrateWechatArtifactManifest,
} from "./contract-migrations.js";

const OFFICIAL_API_BASE_URL = "https://api.weixin.qq.com";



















































function aliasKey(alias        )         {
  return alias.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function resolveWechatCredentials(
  accountAlias        ,
  environment                    = process.env,
  registeredAppId         ,
)              {
  const prefix = `K_TEACH_WECHAT_${aliasKey(accountAlias)}`;
  const appId = registeredAppId ?? environment[`${prefix}_APP_ID`];
  const appSecret = environment[`${prefix}_APP_SECRET`];
  if (!appId || !appSecret) {
    throw new KTeachError(
      "credential-missing",
      `WeChat credentials are not configured for account alias ${accountAlias}.`,
      registeredAppId ? `Set ${prefix}_APP_SECRET in the process environment.` : `Register the account AppID or set ${prefix}_APP_ID, then set ${prefix}_APP_SECRET in the process environment.`,
      { account_alias: accountAlias },
    );
  }
  return { appId, appSecret };
}

function attemptsDir(cwd        )         {
  return path.join(cwd, ".k-teach", "publication-attempts");
}

function attemptPath(cwd        , id        )         {
  return path.join(attemptsDir(cwd), `${id}.json`);
}

async function saveAttempt(
  cwd        ,
  attempt               ,
)                {
  const errors = await validateDocument("publication-attempt", attempt);
  if (errors.length > 0) {
    throw new KTeachError(
      "validation-failed",
      `Publication Attempt is invalid: ${errors.join("; ")}`,
      "Keep the attempt unchanged and inspect the local artifact.",
    );
  }
  await mkdir(attemptsDir(cwd), { recursive: true, mode: 0o700 });
  const destination = attemptPath(cwd, attempt.id);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(attempt, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, destination);
  await chmod(destination, 0o600);
}

async function loadAttempt(cwd        , id        )                         {
  try {
    const value = JSON.parse(await readFile(attemptPath(cwd, id), "utf8"))                           ;
    return migratePublicationAttempt(value)                            ;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new KTeachError(
        "validation-failed",
        `Publication Attempt ${id} was not found.`,
        "Use the attempt ID printed by k-teach wechat draft.",
      );
    }
    throw error;
  }
}

export async function readWechatAttempt(
  cwd        ,
  id        ,
)                         {
  return loadAttempt(cwd, id);
}

function cachePath(options                        )         {
  const base =
    options.cacheDir ??
    path.join(
      process.env.XDG_CACHE_HOME ??
        path.join(process.env.HOME ?? options.cwd, ".cache"),
      "k-teach",
    );
  return path.join(base, `wechat-${options.accountAlias}-token.json`);
}

async function cachedToken(options                        )                              {
  try {
    const value = JSON.parse(await readFile(cachePath(options), "utf8"))


     ;
    if (
      value.access_token &&
      value.expires_at &&
      value.expires_at > Date.now() + 5 * 60 * 1000
    ) {
      return value.access_token;
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  return undefined;
}

function errorForWechat(code        , message        )              {
  let errorCode            = "remote-rejected";
  let nextAction = "Inspect the safe platform error and correct the artifact or account configuration.";
  if (code === 40164) {
    errorCode = "ip-not-allowlisted";
    nextAction = "Add this server IP to the WeChat developer IP allowlist.";
  } else if (code === 48001) {
    errorCode = "account-ineligible";
    nextAction = "Verify the account certification and API permission in WeChat Developer Center.";
  } else if ([45009, 45011].includes(code)) {
    errorCode = "rate-limited";
    nextAction = "Wait for the platform limit window before trying a new explicit operation.";
  }
  return new KTeachError(
    errorCode,
    `WeChat API rejected the request (${code}): ${message}.`,
    nextAction,
    { wechat_errcode: code },
  );
}

async function parseResponse(response          )                                   {
  let value                         ;
  try {
    value = (await response.json())                           ;
  } catch {
    throw new KTeachError(
      "remote-rejected",
      `WeChat API returned HTTP ${response.status} without a valid JSON response.`,
      "Check WeChat service status and inspect the request outside credential-bearing logs.",
    );
  }
  const code = typeof value.errcode === "number" ? value.errcode : 0;
  if (!response.ok || code !== 0) {
    throw errorForWechat(code || response.status, String(value.errmsg ?? "request failed"));
  }
  return value;
}

async function getAccessToken(options                        )                  {
  const existing = await cachedToken(options);
  if (existing) return existing;
  const response = await fetch(`${options.apiBaseUrl ?? OFFICIAL_API_BASE_URL}/cgi-bin/stable_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: options.credentials.appId,
      secret: options.credentials.appSecret,
      force_refresh: false,
    }),
  });
  const value = await parseResponse(response);
  if (typeof value.access_token !== "string") {
    throw new KTeachError(
      "remote-rejected",
      "WeChat token response did not contain an access token.",
      "Verify the AppID, AppSecret, account status, and official API response.",
    );
  }
  const target = cachePath(options);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify({
      access_token: value.access_token,
      expires_at: Date.now() + Number(value.expires_in ?? 7200) * 1000,
    })}\n`,
    { mode: 0o600 },
  );
  await rename(temporary, target);
  await chmod(target, 0o600);
  return value.access_token;
}

async function apiJson(
  options                        ,
  endpoint        ,
  token        ,
  body                         ,
)                                   {
  const response = await fetch(
    `${options.apiBaseUrl ?? OFFICIAL_API_BASE_URL}${endpoint}?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return parseResponse(response);
}

async function uploadFile(
  options                        ,
  endpoint        ,
  token        ,
  filePath        ,
)                                   {
  const form = new FormData();
  form.set("media", new Blob([await readFile(filePath)]), path.basename(filePath));
  const response = await fetch(
    `${options.apiBaseUrl ?? OFFICIAL_API_BASE_URL}${endpoint}?access_token=${encodeURIComponent(token)}${
      endpoint.includes("add_material") ? "&type=image" : ""
    }`,
    { method: "POST", body: form },
  );
  return parseResponse(response);
}

function unknownError(operation        )              {
  return new KTeachError(
    "remote-unknown",
    `The result of WeChat write operation ${operation} is unknown.`,
    "Do not replay it automatically; inspect the account backend and the saved Publication Attempt.",
    { operation },
  );
}

async function runWrite   (
  options                        ,
  attempt               ,
  operation        ,
  callback                  ,
)             {
  const operations                                                     = {
    "create-draft": "create-draft",
    "send-preview": "send-preview",
    "submit-publish": "submit-publish",
    "poll-status": "poll-status",
  };
  attempt.current_operation = operations[operation] ?? "none";
  await saveAttempt(options.cwd, attempt);
  try {
    const result = await callback();
    attempt.current_operation = "none";
    await saveAttempt(options.cwd, attempt);
    return result;
  } catch (error) {
    if (error instanceof KTeachError && error.code !== "remote-unknown") {
      attempt.state = "failed";
      attempt.error_code = error.code;
      attempt.current_operation = "none";
      await saveAttempt(options.cwd, attempt);
      throw error;
    }
    attempt.state = "unknown";
    attempt.error_code = "remote-unknown";
    attempt.unknown_operation = operation;
    await saveAttempt(options.cwd, attempt);
    throw unknownError(operation);
  }
}

export async function createWechatDraft(
  artifactDir        ,
  options                        ,
)                         {
  const manifestValue = JSON.parse(
    await readFile(path.join(artifactDir, "manifest.json"), "utf8"),
  )                           ;
  const manifest = migrateWechatArtifactManifest(
    manifestValue,
  )                             ;
  if (!manifest.validation?.eligible_for_draft) {
    throw new KTeachError(
      "validation-failed",
      "The rendered WeChat artifact is not eligible for a draft.",
      "Run k-teach wechat render and resolve every validation error and warning.",
    );
  }
  const attempt                = {
    schema_version: 2,
    id: `wechat-${randomUUID()}`,
    artifact_id: manifest.id,
    artifact_revision: manifest.artifact_revision,
    artifact_dir: path.resolve(artifactDir),
    account_alias: options.accountAlias,
    account: {
      alias: options.accountAlias,
      name: options.accountName ?? options.accountAlias,
      app_id_suffix: options.credentials.appId.slice(-6),
    },
    authorization: {
      brief_id: manifest.publication_brief.id,
      brief_revision: manifest.publication_brief.revision,
      authorized_for_publication:
        manifest.publication_brief.authorized_for_publication,
    },
    current_operation: "none",
    title: manifest.article.title,
    media_count: manifest.media.length,
    eligible_for_draft: manifest.eligible_for_draft,
    eligible_for_publication: manifest.eligible_for_publication,
    state: "prepared",
    remote_ids: {},
    media_uploads: {},
  };
  await saveAttempt(options.cwd, attempt);

  return runWrite(options, attempt, "create-draft", async () => {
    const token = await getAccessToken(options);
    attempt.state = "uploading_media";
    await saveAttempt(options.cwd, attempt);
    let article = await readFile(path.join(artifactDir, "article.html"), "utf8");
    for (const media of manifest.media.filter((item) => item.placeholder)) {
      const uploaded = await uploadFile(
        options,
        "/cgi-bin/media/uploadimg",
        token,
        path.join(artifactDir, media.file),
      );
      if (typeof uploaded.url !== "string") {
        throw new KTeachError(
          "remote-rejected",
          "WeChat body image upload did not return a URL.",
          "Inspect the image format and account material permissions.",
        );
      }
      attempt.media_uploads[media.placeholder ] = uploaded.url;
      article = article.replaceAll(media.placeholder , uploaded.url);
      await saveAttempt(options.cwd, attempt);
    }
    const cover = manifest.media.find((item) => item.kind === "cover");
    if (!cover) {
      throw new KTeachError(
        "validation-failed",
        "The WeChat artifact has no cover.",
        "Render the Publication Brief again to derive a permanent cover input.",
      );
    }
    const uploadedCover = await uploadFile(
      options,
      "/cgi-bin/material/add_material",
      token,
      path.join(artifactDir, cover.file),
    );
    if (typeof uploadedCover.media_id !== "string") {
      throw new KTeachError(
        "remote-rejected",
        "WeChat permanent cover upload did not return a MediaID.",
        "Inspect the cover constraints and account material permissions.",
      );
    }
    attempt.remote_ids.cover_media_id = uploadedCover.media_id;
    await saveAttempt(options.cwd, attempt);
    const drafted = await apiJson(options, "/cgi-bin/draft/add", token, {
      articles: [
        {
          title: manifest.article.title,
          author: manifest.article.author,
          digest: manifest.article.digest,
          content: article,
          thumb_media_id: uploadedCover.media_id,
          show_cover_pic: 1,
          need_open_comment: 0,
          only_fans_can_comment: 0,
        },
      ],
    });
    if (typeof drafted.media_id !== "string") {
      throw new KTeachError(
        "remote-rejected",
        "WeChat draft creation did not return a MediaID.",
        "Inspect the article fields and account draft permissions.",
      );
    }
    attempt.remote_ids.draft_media_id = drafted.media_id;
    attempt.state = "draft_created";
    delete attempt.error_code;
    await saveAttempt(options.cwd, attempt);
    return attempt;
  });
}

export async function previewWechatDraft(
  attemptId        ,
  openid        ,
  options                        ,
)                         {
  const attempt = await loadAttempt(options.cwd, attemptId);
  if (!["draft_created", "previewed"].includes(attempt.state)) {
    throw new KTeachError(
      "validation-failed",
      `Attempt ${attemptId} is not ready for preview.`,
      "Create a confirmed draft before sending a preview.",
    );
  }
  return runWrite(options, attempt, "send-preview", async () => {
    const token = await getAccessToken(options);
    await apiJson(options, "/cgi-bin/message/mass/preview", token, {
      touser: openid,
      mpnews: { media_id: attempt.remote_ids.draft_media_id },
      msgtype: "mpnews",
    });
    attempt.preview_recipient_hash = createHash("sha256").update(openid).digest("hex");
    attempt.state = "previewed";
    await saveAttempt(options.cwd, attempt);
    return attempt;
  });
}

export async function publishWechatDraft(
  attemptId        ,
  options                        ,
  confirm                ,
)                         {
  const attempt = await loadAttempt(options.cwd, attemptId);
  if (!attempt.eligible_for_publication) {
    throw new KTeachError(
      "validation-failed",
      "The Publication Brief did not authorize public publishing.",
      "Create a reviewed brief with authorized_for_publication: true and render it again.",
    );
  }
  if (!["draft_created", "previewed"].includes(attempt.state)) {
    throw new KTeachError(
      "validation-failed",
      `Attempt ${attemptId} is not ready to publish.`,
      "Create or preview the draft, then retry with its attempt ID.",
    );
  }
  const accepted = await confirm({
    account_alias: attempt.account_alias,
    title: attempt.title,
    draft_media_id: attempt.remote_ids.draft_media_id,
    media_count: attempt.media_count,
  });
  if (!accepted) {
    throw new KTeachError(
      "validation-failed",
      "Public publishing was not confirmed.",
      "Run the command in an interactive terminal and confirm only after reviewing the summary.",
    );
  }
  return runWrite(options, attempt, "submit-publish", async () => {
    const token = await getAccessToken(options);
    attempt.state = "publish_submitted";
    await saveAttempt(options.cwd, attempt);
    const result = await apiJson(options, "/cgi-bin/freepublish/submit", token, {
      media_id: attempt.remote_ids.draft_media_id,
    });
    if (typeof result.publish_id !== "string") {
      throw new KTeachError(
        "remote-rejected",
        "WeChat publish submission did not return a publish ID.",
        "Inspect the draft in WeChat and do not submit it again automatically.",
      );
    }
    attempt.remote_ids.publish_id = result.publish_id;
    attempt.state = "polling";
    await saveAttempt(options.cwd, attempt);
    return attempt;
  });
}

export function stateForWechatPublishStatus(status        )                   {
  if (status === 0) return "published";
  if (status === 1) return "polling";
  if (status === 4) return "review_rejected";
  if (status === 5) return "deleted";
  if (status === 6) return "blocked";
  return "failed";
}

export async function queryWechatStatus(
  attemptId        ,
  options                        ,
)                         {
  const attempt = await loadAttempt(options.cwd, attemptId);
  if (!attempt.remote_ids.publish_id) {
    throw new KTeachError(
      "validation-failed",
      `Attempt ${attemptId} has no publish ID.`,
      "Submit a confirmed public publish before querying status.",
    );
  }
  try {
    const token = await getAccessToken(options);
    const result = await apiJson(options, "/cgi-bin/freepublish/get", token, {
      publish_id: attempt.remote_ids.publish_id,
    });
    const status = Number(result.publish_status);
    attempt.state = stateForWechatPublishStatus(status);
    attempt.last_checked_at = new Date().toISOString();
    if (typeof result.article_id === "string") {
      attempt.remote_ids.article_id = result.article_id;
    }
    const detail = result.article_detail

                 ;
    detail?.item?.forEach((item, index) => {
      if (item.article_url) attempt.remote_ids[`article_url_${index}`] = item.article_url;
    });
    if (status === 4) attempt.error_code = "publish-review-rejected";
    if (status === 5) attempt.error_code = "published-deleted";
    if (status === 6) attempt.error_code = "published-blocked";
    if ([2, 3].includes(status)) attempt.error_code = "remote-rejected";
    await saveAttempt(options.cwd, attempt);
    return attempt;
  } catch (error) {
    if (error instanceof KTeachError) throw error;
    throw new KTeachError(
      "remote-unknown",
      "WeChat publish status could not be queried.",
      "Retry the read-only status query later; do not resubmit the publication.",
    );
  }
}

export async function doctorWechat(
  options                        ,
)                                   {
  await getAccessToken(options);
  return {
    account_alias: options.accountAlias,
    credentials: "configured",
    token: "reachable",
    materials: "unverified",
    drafts: "unverified",
    preview: "unverified",
    publish: "unverified",
  };
}

export async function confirmInteractivePublish(
  summary                ,
)                   {
  process.stdout.write(
    `Public WeChat publish\nAccount: ${summary.account_alias}\nTitle: ${summary.title}\nDraft: ${summary.draft_media_id}\nMedia: ${summary.media_count}\n`,
  );
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const phrase = `PUBLISH ${summary.account_alias} ${summary.draft_media_id}`;
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await readline.question(`Type "${phrase}" to publish: `);
    return answer === phrase;
  } finally {
    readline.close();
  }
}


//# sourceURL=k-teach/src/wechat-publisher.ts