# Execution transcript

All commands run from the repo root. No API key, network, or database is required — the suite is fully keyless and deterministic.

## Environment

- Node `v22.22.3`, npm `10.9.8`
- Repo: `showcase-routine-me` (standalone, no git remote)

## Commands + observed output

### 1. Install

```bash
npm install --legacy-peer-deps
```

> Note: `--legacy-peer-deps` was required once due to an npm arborist
> peer-resolution bug (`Cannot read properties of null (reading 'edgesOut')`)
> on this host. It does not change the installed packages.

Observed: `added 46 packages in 11s`

### 2. Full suite

```bash
npx vitest run
```

Observed:

```
 RUN  v4.1.11

 Test Files  6 passed (6)
      Tests  40 passed (40)
   Duration  178ms
```

### 3. Golden eval harness (hero proof)

```bash
npx vitest run tests/golden-eval.test.ts --reporter=verbose
```

Observed (verbatim, trimmed to the two summary blocks):

```
stdout | golden eval: classifier accuracy vs floor
{
  "step": "classifier",
  "floor": 0.7,
  "count": 17,
  "matched": 17,
  "accuracy": 1,
  "failures": []
}

stdout | golden eval: estimator coverage + unknown-bounds vs floors
{
  "step": "estimator",
  "coverageFloor": 0.8,
  "unknownBoundsFloor": 0.6,
  "count": 6,
  "coverageOk": 6,
  "unknownInBoundsOk": 6,
  "coverageRate": 1,
  "unknownBoundsRate": 1,
  ...
}
```

The estimator report also confirms the honest-fallback case — `"some weird alien
food xyzzy"` resolves to `{ "unknown": true }` with zeroed macros, matching the
golden bounds `unknownAtLeast: 1, unknownAtMost: 1`.

Full verbatim output: `docs/golden-eval-run.txt`. Rendered capture: `docs/hero-proof.svg`.

## Test files

| File | Covers |
| --- | --- |
| `tests/golden-eval.test.ts` | End-to-end harness: baseline model vs golden fixtures vs floors. |
| `tests/evals-harness.test.ts` | Fixture validity + scoring math (synthetic runs). |
| `tests/retrieval.test.ts` | `rankPriorNutrition` + `buildEstimatorUserContent` + degradation. |
| `tests/llm-observability.test.ts` | `estimateCostUsd` + `summarizeAiHealth` + sink wiring. |
| `tests/agentic-loop.test.ts` | Zod union gating, `parseAgenticResponse`, depth guard, prompt shape. |
| `tests/trace.test.ts` | Fire-and-forget sink wiring + never-throw. |
