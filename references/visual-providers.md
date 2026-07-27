# Optional visual providers

Treat a Visual Provider as an external, optional producer. The K Teach CLI does
not call a model SDK, resolve provider credentials, or make generative visuals
part of the core teaching path. It validates and registers provider output.

## Handoff

1. Create `media/visual-plan.yaml` from the current Lesson Bundle.
2. Give one planned asset, its exact prompt, and its `input_references` to an
   available provider.
3. Save the generated bitmap inside the Learning Workspace, normally under
   `media/generated/`.
4. Review it against the planned purpose and authoritative references.
5. Record the provider id, model, unchanged prompt, unchanged references,
   output path, media type, and validation checks in a result YAML.
6. Register it:

```sh
node bin/k-teach.js visuals register \
  --plan lessons/<lesson>/media/visual-plan.yaml \
  --result lessons/<lesson>/media/<asset>.result.yaml
```

Registration rejects failed validation, prompt or reference drift, unknown
asset ids, unreadable files, and files outside the workspace. It writes a
content-addressed record under
`.k-teach/artifacts/visuals/<plan-id>/<asset-id>.json`. Later rendering rejects
an asset if its bytes, lesson revision, plan, prompt, or references changed.

Use [the bundled plan template](../assets/visuals/visual-plan.yaml) and
[result template](../assets/visuals/visual-result.yaml) as starting points.

## Modes

- `auto`: use registered assets when a renderer needs them; record a warning
  and keep the complete text, Diagram, exercise, and learning flow when an
  optional result is missing.
- `required`: stop with `missing-capability` when a plan or any requested
  provider result is missing.
- `off`: do not read the plan or provider records and do not emit downgrade
  warnings.

Never let a generated asset change facts, objectives, sources, or answer keys.
Do not store provider credentials in plans, results, records, manifests, or
logs.
