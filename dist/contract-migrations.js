




































export function migratePublicationBrief(
  value                                       ,
)                   {
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
  value                                                    ,
)                          {
  if (value.schema_version === 2) return structuredClone(value);
  const legacy = value                            ;
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
  value                                                ,
  context





    = {},
)                          {
  if (value.schema_version === 2) return structuredClone(value);
  const legacy = value                        ;
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


//# sourceURL=k-teach/src/contract-migrations.ts