# Batches

Each batch lives in its own folder here: `/batches/{batch-id}/`, created by
Scout when research on a theme begins. No batches exist yet — this repo
never fabricates placeholder batch data.

Expected contents of a batch folder once agents have run:

```
manifest.json   (tracks stage: researched -> prompted -> imaged -> assembled -> listed -> published)
research.md
prompts.json
images/         (human-populated)
interior.pdf
listing.json
```

See `/schemas/manifest.ts` for the manifest schema, and
`/schemas/examples/manifest.example.json` for an annotated fixture (not a
real batch).
