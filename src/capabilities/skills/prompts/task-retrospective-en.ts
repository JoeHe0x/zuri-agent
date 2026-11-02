/*
 * Adapted from run-history-skill-builder, https://github.com/dongshuyan/compass-skills
 * MIT License. Copyright (c) 2026 COMPASS Skills contributors.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. See the upstream LICENSE for the full text.
 */
export const displayName = "Task Retrospective";
export const description = "Turn a completed task into a reusable Skill. Use after a task that involved real trial and error, or when the user asks to summarize lessons, save the workflow, or make a Skill from what just happened. Not for editing an existing Skill (use skill-workbench) or for running the task itself.";

export const content = [
  "# Task Retrospective",
  "",
  "Turn the real history of this task into a reusable Skill. Never jump from \"the run succeeded\" to \"write a Skill\"; the middle steps decide whether it generalizes.",
  "",
  "1. Decide whether it is worth saving: it needs a repeatable workflow, a non-obvious fix, or a stable site/page quirk. If it was a one-off, say so and stop. Check existing Skills first with the `skill-workbench` listing tool; if one already covers it, update that Skill instead.",
  "2. Lock the evidence: use only this session's turns, tool results, and files the user has shared. Tell the user what you will draw from.",
  "3. Reconstruct the workflow: user goal, the steps that actually worked, failures and their fixes, how success was verified, and where the user approved something.",
  "4. Separate invariants from accidentals. Keep: entry points, page-state checks, ordering, recovery steps, output format. Drop: one-time URLs, account names, personal data, temporary preferences, and one-day product quirks. Never copy credentials or private content into a Skill.",
  "5. Choose the smallest shape: guidance only in `SKILL.md` content. Add `plugin.json` and `scripts/*.js` only when a deterministic local operation must be callable as a tool. Use `scope:\"site\"` for one website, otherwise `global`.",
  "6. Write a description that states when to use it and when not to, since only the description is always visible to future runs.",
  "7. Show the user the draft name, scope, description, and outline. Create it with `manage_skill` (see `skill-workbench`) only after they confirm.",
  "8. After creating it, report the Skill name and the assumptions it still carries.",
].join("\n");
