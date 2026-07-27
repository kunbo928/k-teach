export type Revision = string;
export type VisualMode = "auto" | "required" | "off";
export type CompositionMode = "reading" | "workshop" | "atlas";
export type DiagramKind = "flow" | "relationship" | "state";

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

export interface PublicationBrief {
  schema_version: 1;
  id: string;
  revision: Revision;
  lesson_id: string;
  lesson_revision: Revision;
  title: string;
  audience: string;
  angle: string;
  include: string[];
  exclude: string[];
  theme: "field-manual";
  author: string;
  summary: string;
  cover: { mode: "generated" | "visual-asset"; asset_id?: string };
  authorized_for_publication: boolean;
}

export interface ArtifactManifest {
  schema_version: 1;
  id: string;
  lesson_id: string;
  lesson_revision: Revision;
  design_profile_revision: Revision;
  channel: "web" | "wechat";
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
  schema_version: 1;
  id: string;
  artifact_id: string;
  account_alias: string;
  state: PublicationState;
  remote_ids: Record<string, string>;
  artifact_dir: string;
  title: string;
  media_count: number;
  publication_eligibility: boolean;
  media_uploads: Record<string, string>;
  last_checked_at?: string;
  error_code?: string;
  preview_recipient_hash?: string;
  unknown_operation?: string;
}
