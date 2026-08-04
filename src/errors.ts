export const ERROR_CODES = [
  "invalid-workspace",
  "invalid-bundle",
  "invalid-brief",
  "invalid-diagram",
  "missing-capability",
  "render-failed",
  "validation-failed",
  "migration-required",
  "credential-missing",
  "account-ineligible",
  "ip-not-allowlisted",
  "remote-rejected",
  "rate-limited",
  "remote-unknown",
  "publish-review-rejected",
  "published-deleted",
  "published-blocked",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class KTeachError extends Error {
  readonly code: ErrorCode;
  readonly nextAction: string;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    message: string,
    nextAction: string,
    context: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "KTeachError";
    this.code = code;
    this.nextAction = nextAction;
    this.context = context;
  }
}
