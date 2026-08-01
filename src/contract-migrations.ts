import type {
  PublicationBrief,
  PublicationBriefV1,
  PublicationState,
} from "./domain.ts";

export interface WechatArtifactManifestV1 {
  schema_version: 1;
  id: string;
  publication_brief: {
    id: string;
    revision: string;
    authorized_for_publication: boolean;
  };
  lesson: { id: string; revision: string };
  article: { title: string; author: string; digest: string };
  input_hash: string;
  validation: { errors: string[]; warnings: string[]; eligible_for_draft: boolean };
  publication_eligibility: boolean;
  [key: string]: unknown;
}

export interface PublicationAttemptV1 {
  schema_version: 1;
  id: string;
  artifact_id: string;
  artifact_dir: string;
  account_alias: string;
  title: string;
  media_count: number;
  publication_eligibility: boolean;
  state: PublicationState;
  remote_ids: Record<string, string>;
  media_uploads: Record<string, string>;
  [key: string]: unknown;
}

export function migratePublicationBrief(
  value: PublicationBrief | PublicationBriefV1,
): PublicationBrief {
  if (value.schema_version === 2) return structuredClone(value);
  const { theme: _legacyTheme, ...preserved } = value;
  return {
    ...preserved,
    schema_version: 2,
    channel_theme: "emerald-editorial",
    article_type: "tutorial",
  };
}

export function migrateWechatArtifactManifest(
  value: WechatArtifactManifestV1 | Record<string, unknown>,
): Record<string, unknown> {
  if (value.schema_version === 2) return structuredClone(value);
  const legacy = value as WechatArtifactManifestV1;
  const { publication_eligibility: _legacyEligibility, ...preserved } = legacy;
  return {
    ...preserved,
    schema_version: 2,
    generator: "k-teach-wechat-v2",
    channel_theme: "emerald-editorial",
    article_type: "tutorial",
    artifact_revision: legacy.input_hash,
    eligible_for_draft: legacy.validation.eligible_for_draft,
    eligible_for_publication:
      legacy.validation.eligible_for_draft &&
      legacy.publication_brief.authorized_for_publication,
  };
}

export function migratePublicationAttempt(
  value: PublicationAttemptV1 | Record<string, unknown>,
  context: {
    artifact_revision?: string;
    account_name?: string;
    app_id_suffix?: string;
    brief_id?: string;
    brief_revision?: string;
  } = {},
): Record<string, unknown> {
  if (value.schema_version === 2) return structuredClone(value);
  const legacy = value as PublicationAttemptV1;
  const { publication_eligibility: _legacyEligibility, ...preserved } = legacy;
  return {
    ...preserved,
    schema_version: 2,
    artifact_revision: context.artifact_revision ?? legacy.artifact_id,
    account: {
      alias: legacy.account_alias,
      name: context.account_name ?? legacy.account_alias,
      app_id_suffix: context.app_id_suffix ?? "unknown",
    },
    authorization: {
      brief_id: context.brief_id ?? "legacy-unknown",
      brief_revision: context.brief_revision ?? "legacy-unknown",
      authorized_for_publication: legacy.publication_eligibility,
    },
    current_operation: legacy.unknown_operation ?? "none",
    eligible_for_draft: true,
    eligible_for_publication: legacy.publication_eligibility,
  };
}
