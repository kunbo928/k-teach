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
]         ;



export class KTeachError extends Error {
           code           ;
           nextAction        ;
           context                                   ;

  constructor(
    code           ,
    message        ,
    nextAction        ,
    context                                    = {},
  ) {
    super(message);
    this.name = "KTeachError";
    this.code = code;
    this.nextAction = nextAction;
    this.context = context;
  }
}


//# sourceURL=k-teach/src/errors.ts