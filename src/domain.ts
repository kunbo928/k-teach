export type Revision = string;
export type VisualMode = "auto" | "required" | "off";
export type CompositionMode = "reading" | "workshop" | "atlas";
export type DiagramKind = "flow" | "relationship" | "state" | "sequence";
export type TeachingThemeId =
  | "classic-manual"
  | "storybook"
  | "nature-explorer"
  | "active-classroom"
  | "junior-lab"
  | "editorial-desk"
  | "future-lab";
export type PresentationPurpose = "teaching" | "talk";
export type ChannelThemeId =
  | "emerald-editorial"
  | "graphite-minimal"
  | "olive-journal";
export type WechatArticleType = "tutorial" | "analysis" | "narrative";
export type OutputIntent = "learn" | "ppt" | "wechat";
export type SemanticBlockKind =
  | "paragraph"
  | "list"
  | "code"
  | "quote"
  | "exercise"
  | "asset";

export interface DiagramSpec {
  schema_version: 1;
  id: string;
  title: string;
  description: string;
  kind: DiagramKind;
  direction: "top-to-bottom" | "left-to-right";
  nodes: Array<{
    id: string;
    label: string;
    detail?: string;
    role?: "start" | "end" | "decision" | "step" | "source" | "artifact" | "state";
  }>;
  edges: Array<{ from: string; to: string; label?: string }>;
}

export interface LessonBundle {
  schema_version: 1;
  id: string;
  revision: Revision;
  title: string;
  mission: string;
  objectives: string[];
  sources: Array<{ title: string; url: string }>;
  composition: CompositionMode;
  visuals: VisualMode;
}

export interface DesignProfile {
  schema_version: 1;
  id: string;
  revision: Revision;
  name: string;
  modes: CompositionMode[];
  themes: Array<"paper" | "night" | "print">;
}

export interface PresentationBrief {
  schema_version: 1;
  id: string;
  revision: Revision;
  purpose: PresentationPurpose;
  audience: string;
  learner_stage?: string;
  duration_minutes: number;
  lesson_id: string;
  lesson_revision: Revision;
  include: string[];
  exclude: string[];
  theme: {
    id: TeachingThemeId;
    source: "explicit" | "brief" | "teach-default" | "recommended" | "fallback";
    reason: string;
  };
}

export interface PublicationBrief {
  schema_version: 2;
  id: string;
  revision: Revision;
  lesson_id: string;
  lesson_revision: Revision;
  title: string;
  audience: string;
  angle: string;
  include: string[];
  exclude: string[];
  channel_theme: ChannelThemeId;
  article_type: WechatArticleType;
  author: string;
  summary: string;
  cover: { mode: "generated" | "visual-asset"; asset_id?: string };
  draft_delivery?: {
    account_alias: string;
    authorized: true;
  };
  authorized_for_publication: boolean;
}

export interface WechatAccount {
  alias: string;
  name: string;
  app_id: string;
  last_doctor_status?: "unknown" | "credentials-ready" | "token-reachable" | "failed";
}

export interface WechatAccountRegistry {
  schema_version: 1;
  accounts: WechatAccount[];
  last_successful_alias?: string;
}

export interface ArtifactManifest {
  schema_version: 1;
  id: string;
  lesson_id: string;
  lesson_revision: Revision;
  design_profile_revision: Revision;
  channel: "web" | "wechat" | "ppt";
  input_hash: string;
  files: string[];
  capabilities_used: string[];
  warnings: string[];
}

export type PublicationState =
  | "prepared"
  | "uploading_media"
  | "draft_created"
  | "previewed"
  | "publish_submitted"
  | "polling"
  | "published"
  | "failed"
  | "review_rejected"
  | "deleted"
  | "blocked"
  | "unknown";

export interface PublicationAttempt {
  schema_version: 2;
  id: string;
  artifact_id: string;
  account_alias: string;
  state: PublicationState;
  remote_ids: Record<string, string>;
  artifact_dir: string;
  title: string;
  media_count: number;
  artifact_revision: Revision;
  account: { alias: string; name: string; app_id_suffix: string };
  authorization: {
    brief_id: string;
    brief_revision: Revision;
    authorized_for_draft?: boolean;
    draft_account_alias?: string;
    authorized_for_publication: boolean;
  };
  current_operation: "none" | "upload-media" | "create-draft" | "send-preview" | "submit-publish" | "poll-status";
  eligible_for_draft: boolean;
  eligible_for_publication: boolean;
  media_uploads: Record<string, string>;
  last_checked_at?: string;
  error_code?: string;
  preview_recipient_hash?: string;
  unknown_operation?: string;
}

export interface ContextPacket {
  schema_version: 1;
  packet_id: string;
  intent: OutputIntent;
  teach: { id: string; title: string };
  lesson: {
    id: string;
    revision: Revision;
    title: string;
    mission: string;
    objectives: string[];
  };
  sections: Array<{
    id: string;
    heading: string;
    blocks: Array<{
      id: string;
      kind: SemanticBlockKind;
      body: string;
      asset_ids: string[];
    }>;
  }>;
  sources: Array<{ id: string; title: string; url: string }>;
  assets: Array<{
    id: string;
    kind: "diagram" | "illustration" | "interactive" | "audio";
    title: string;
    alt_or_transcript: string;
    availability: "ready" | "missing" | "stale";
  }>;
  route: Readonly<Record<string, unknown>>;
  diagnostics: {
    missing_fields: string[];
    blockers: string[];
    warnings: string[];
  };
  provenance: {
    input_hash: string;
    planning_hash: string;
    lesson_revision: Revision;
    brief_revision?: Revision;
  };
}

export type SemanticContentItem =
  | { mode: "reference"; source_refs: string[] }
  | { mode: "authored"; text: string; source_refs: string[] };

export interface SemanticPlanContext {
  packet_id: string;
  planning_hash: string;
  lesson_id: string;
  lesson_revision: Revision;
}

export interface ArticlePlan {
  schema_version: 1;
  id: string;
  revision: Revision;
  kind: "article";
  context: SemanticPlanContext;
  route_brief: { id: string; revision: Revision };
  blocks: Array<{
    id: string;
    role: "lead" | "section" | "bridge" | "example" | "callout" | "summary" | "sources";
    heading?: string;
    content: SemanticContentItem[];
    asset_refs: string[];
  }>;
}

export interface SlidePlan {
  schema_version: 1;
  id: string;
  revision: Revision;
  kind: "slide";
  context: SemanticPlanContext;
  route_brief: { id: string; revision: Revision };
  slides: Array<{
    id: string;
    role: "cover" | "concept" | "evidence" | "example" | "practice" | "recap" | "sources";
    title: string;
    content: SemanticContentItem[];
    asset_refs: string[];
    speaker_notes: SemanticContentItem[];
    duration_seconds: number;
  }>;
}

export type GenerationRunState =
  | "needs_input"
  | "needs_plan"
  | "complete"
  | "attention_required"
  | "failed";

export interface GenerationRunResult {
  schema_version: 1;
  run_id: string;
  state: GenerationRunState;
  intent: OutputIntent;
  input_hash: string;
  next_action: { code: string | null; fields: string[] };
  refs: {
    context_packet: string | null;
    route_brief: string | null;
    plan: string | null;
    artifact: string | null;
    publication_attempt: string | null;
  };
  warnings: string[];
  error?: { code: string; fields: string[]; refs: string[] };
}

export interface PlanReviewDelta {
  schema_version: 1;
  unchanged: string[];
  needs_review: Array<{
    item_id: string;
    reason: "source_changed" | "source_removed" | "route_changed" | "asset_changed";
    changed_refs: string[];
  }>;
  proposed: Array<{ item_id: string; reason: "newly_selected_content" }>;
  removed: string[];
}
