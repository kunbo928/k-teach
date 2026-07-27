# Teaching workflow

## Workspace state

Use one topic and one mission per workspace:

- `MISSION.md`: concrete outcome, observable success, constraints, and scope.
- `RESOURCES.md`: small curated set of authoritative knowledge sources,
  practitioner communities, and explicit research gaps.
- `GLOSSARY.md`: canonical terms the learner has demonstrated they can use.
- `learning-records/NNNN-slug.md`: decision-grade evidence that changes what to
  teach next.
- `NOTES.md`: stable teaching preferences, never a session transcript.
- `lessons/<id>/`: semantic Lesson Bundles.
- `reference/`: durable quick-reference material derived from demonstrated
  learning.

Ask before changing the mission. Keep earlier learning records and mark a
contradicted record `Status: superseded by LR-NNNN`.

## Select the next challenge

Choose the smallest useful challenge just above the demonstrated floor:

1. Trace it to an observable mission outcome.
2. Inspect prior evidence, misconceptions, glossary, and preferences.
3. Start with retrieval before review on returning topics.
4. Interleave prior skills only when doing so serves the current task.
5. Keep one lesson completable in roughly 10–20 minutes.

Do not mistake exposure, reading, or page completion for learning.

## Ground claims

Prefer official documentation, primary research, recognized textbooks, and
well-moderated practitioner communities. Annotate why each saved source matters.
Distinguish sourced facts, teaching judgment, analogies, and unresolved
uncertainty. Never invent citations or precise learner measurements.

## Design one learning win

Every Lesson Bundle must support this loop:

1. State one tangible outcome.
2. Activate relevant prior knowledge with a recall prompt.
3. Explain only the knowledge needed for the task.
4. Give a realistic mission-linked task.
5. Put specific feedback next to the learner action.
6. End with a retrieval check completed without looking back.
7. Link the strongest primary source and invite follow-up questions.

Use desirable difficulty in practice, not explanation. Keep quiz choices
visually similar. Do not reveal answers through formatting.

## Author the Lesson Bundle

Start from `assets/lesson-bundle/`. Keep channel-independent teaching content in
`lesson.md`, metadata in `lesson.yaml`, exercises in `exercises/`, and original
media in `media/`. Use `reading`, `workshop`, or `atlas` according to the
learning task, not visual novelty.

Run `k-teach validate` before rendering. A renderer may compress or rearrange
content, but it cannot change facts, sources, objectives, or answer keys.

## Record demonstrated learning

Write a learning record only when the learner:

- explains or transfers a non-trivial concept correctly;
- discloses meaningful prior knowledge and its depth;
- corrects a misconception; or
- changes the mission because of learning.

Use a short title and one to three sentences describing the evidence and why it
changes future teaching. Add optional Evidence or Implications only when they
matter. Promote a glossary term only after correct use.
