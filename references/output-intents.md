# Output intent routing

## Resolve the intended use

Treat output purpose as a first-class choice. If the request already says
learn, study, course, lesson, WeChat, official account, article, PPT,
presentation, slides, deck, or an equivalent phrase, infer the route and
continue. Otherwise ask one concise question:

> 这次内容主要用于哪种场景：学习、公众号，还是 PPT？

Ask only for the purpose at this point. Collect route-specific details later
and only when they materially affect the result.

Select one primary route per request. If the user explicitly asks for multiple
outputs, create them as separate derivatives from the same validated Lesson
Bundle instead of converting one rendered artifact into another.

## Learning

Preserve the existing K Teach behavior:

- build or revise the source-grounded Lesson Bundle;
- keep exercises and feedback inline at their teaching moments;
- use the Field Manual Web profile and the lesson's composition mode;
- render with `k-teach render web`;
- record demonstrated learning only from actual learner evidence.

Do not invoke a channel-layout Skill for this route.

## WeChat official account

Treat the article as a public derivative, not as the lesson itself.

1. Require a Publication Brief that selects the public sections, audience,
   angle, exclusions, title, author, summary, cover, and authorization state.
2. For an ordinary article request, run `k-teach wechat render --brief
   <brief-id>` with the default `emerald-editorial` Channel Theme, validate the
   artifact, select one account, show the summary, and ask before creating the
   remote draft. If the user explicitly requests theme preview, run
   `k-teach wechat render-proposals --brief <brief-id>` first. If the user says
   local-only, stop after rendering.
   only selected Lesson Bundle content, preserves facts and citations, and
   omits exercises, answers, progress, private notes, and implicit local links.
3. Deliver `article.html`, copy-enabled `preview.html`, the cover, prepared
   media, and the validation manifest. Require inline styles, `<span leaf="">`
   text wrappers, reusable editorial components, controlled color, strong
   section rhythm, and platform-safe markup.
4. Never infer public publication from article generation or draft creation.
   Direct public publication may skip theme preview and a separate draft
   confirmation, but not validation, exact final confirmation, or polling.

Do not invoke or require another Skill for writing or layout. Do not substitute
the learning-page renderer for the native WeChat renderer.

## PPT

Treat PPT as a presentation derivative of the Lesson Bundle. The expected
artifact is a static HTML slide deck, not a binary `.pptx`.

1. If the user only says PPT, clarify `teaching` (课堂教学) versus `talk`
   (讲座分享), then confirm audience, duration, and selected chapters only when
   missing.
2. Create a Presentation Brief and run `k-teach render ppt --brief <id>`.
   Teaching uses a multi-slide learning sequence and may include practice;
   talk uses a narrative spine and omits learning exercises by default.
3. Preserve facts, sources, and teaching objectives. Keep answer keys and
   facilitation guidance in presenter notes rather than revealing them on
   learner-facing slides.
4. Deliver one self-contained `index.html` and its audit manifest. Verify 16:9 layout, keyboard
   navigation, overview, presenter mode, reduced-motion behavior, print export,
   media paths, overflow, clipping, contrast, and consistency.

Do not invoke or require another Skill for presentation generation.

Do not call an HTML deck a `.pptx`. Create a native PowerPoint file only when
the user explicitly asks for that format and a separate compatible tool is
available.

## Shared invariants

- The Lesson Bundle remains the authoritative source.
- Never write channel-specific layout markup back into `lesson.md`.
- Never let a renderer change factual claims, sources, objectives, or answers.
- Keep local learning content private by default.
- Treat public publishing and local generation as separate authorizations.
- Keep K Teach self-contained; learning, WeChat, and PPT generation must not
  depend on another Agent Skill.
