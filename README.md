# RoutineMe: Self-Tracking Without the Chore

<p align="center"><strong>A habit, routine, and nutrition tracker designed to make useful self-tracking require less manual work.</strong></p>

Tracking habits is useful only if keeping the record does not become another task to avoid.

RoutineMe brings habits, routines, goals, and nutrition into one daily workflow. A major focus is reducing the amount of manual input required to keep that history useful.

<a href="docs/assets/product-today.png">
  <img src="docs/assets/product-today.png" alt="RoutineMe today view with habits, nutrition, and goals" width="840">
</a>

*Today view: habits, routines, and nutrition in one daily workflow, with a calorie gauge, macro totals, goals with progress, and the week at a glance.*

## Contents

- [Overview](#overview)
- [The product](#the-product)
- [Natural-language logging](#natural-language-logging)
- [Making AI reliable](#making-ai-reliable)
- [Where RoutineMe is headed](#where-routineme-is-headed)
- [About this repository](#about-this-repository)

## Overview

Self-tracking is genuinely useful. You cannot improve a routine you cannot see. But logging is friction, and friction is what kills consistency. Most people abandon the tracker, not the habit.

RoutineMe keeps the recurring parts of life together in one place and asks one question: how much manual input can be removed while the user stays in control of their own data.

## The product

One place answers "what did I do?" across everything being tracked: habits, routines, goals, and nutrition. Each becomes a structured history that produces useful feedback rather than a dead spreadsheet.

## Natural-language logging

Nutrition makes logging friction obvious. Instead of searching for every ingredient and filling out fields manually, RoutineMe can turn a sentence such as "two eggs, toast, and coffee" into a structured entry for review.

<a href="docs/assets/product-meal-logging.png">
  <img src="docs/assets/product-meal-logging.png" alt="Natural-language meal parsed into a structured proposal" width="840">
</a>

*Natural-language meal logging: a free-form description becomes a structured proposal, waiting for confirmation before anything is saved.*

This is not a chatbot bolted onto a food diary. It is the same logging action the form produces, reached through natural language instead of a dozen fields.

```text
Describe meal
     ↓
Interpret
     ↓
Use known context
     ↓
Prepare entry
     ↓
Review
     ↓
Save
```

## Making AI reliable

The point of natural-language logging is that the model does something useful. The risk is that useful quietly turns into plausible. Three mechanisms keep the line.

### Grounding

Before estimating, the assistant looks at the user's recent logs, ranks them by frequency and recency, and reuses previously-confirmed values when a food matches. "Rice" means the rice this user usually eats, not whatever the model guesses. A bounded scan of the user's own history degrades to nothing when lookup fails. It degrades to nothing, never to a guess.

### Controlled actions

Every write flows through the same typed action executor, whether it came from a tap in the UI or a typed sentence. A natural-language log is not a special kind of write; it is the same write through a different input path, with a propose, confirm, execute lifecycle. An unknown food stays unknown, with zeroed macros rather than invented ones. A state-changing request produces a proposal that says apply, and nothing is written until the user confirms.

### Evaluation

The workflow is evaluated against repeatable cases covering ambiguous meals, unknown foods, retrieval failures, and state-changing requests.

The behaviors are pinned across model and prompt changes: the classifier must route ambiguous input correctly, known foods must resolve, unknown foods must stay unknown. A model or prompt change that degrades behavior fails the suite instead of shipping.

## Where RoutineMe is headed

The larger question is what self-tracking looks like when the software does more of the remembering. The direction is toward the routine running more proactively: the software knows what you usually track and when, and prepares the entry for you to confirm instead of asking you to build it from scratch each time. The user stays the one who decides what actually gets recorded.

## About this repository

RoutineMe is a larger private project, deployed and in active use. This public repository contains a public-safe slice of the AI engineering behind natural-language logging: the classification, retrieval, estimation, typed actions, and the evaluation harness that keeps them honest. It runs without exposing the full application, its data, or its infrastructure.

## Run it locally

```bash
npm install
npm test
```

No API key, no network, no database.