export const displayName = "Site Memory";
export const description = "Remember and improve what you learn about operating one website, so later tasks on that site start faster. Use after a task on a site that involved trial and error, a failure you recovered from, or a stable quirk worth keeping, and when a loaded site-memory Skill turns out to be wrong. Not for cross-site workflows (use task-retrospective) or for one-off facts.";

export const content = [
  "# Site Memory",
  "",
  "Keep one site Skill per website, named `site-memory-<registrable-domain with dots as hyphens>` (for example `site-memory-example-com`), with `scope:\"site\"` and `domains:[\"<registrable-domain>\"]`. Site Skills load automatically on matching pages, so later tasks see it without extra setup. Create and edit it through `skill-workbench` (`manage_skill`).",
  "",
  "## Use it",
  "",
  "When a `site-memory-*` Skill matches the page, `load_skill` it before acting. Treat entries as hints, not facts: check the page state before relying on them.",
  "",
  "## Write it",
  "",
  "1. Decide whether anything is worth saving: a navigation path, a selector or API that worked, a pitfall with its fix, or a login/loading quirk that stayed true across the task. Skip one-off facts and anything the page already makes obvious. If nothing qualifies, say so and stop.",
  "2. List existing Skills with `skill-workbench`. If `site-memory-<domain>` exists, `load_skill` it and update that Skill. Never create a second Skill for the same domain.",
  "3. Write short entries under these headings: Navigation, Selectors and APIs, Pitfalls and fixes, Verified. Each entry is one line and ends with `(verified YYYY-MM-DD)`.",
  "4. Keep only what is stable. Leave out account names, user data, tokens, emails, query strings, order or record IDs, and prices or stock. Never copy credentials or private page content.",
  "5. Record only what happened in this task and what the page actually showed. Do not record guesses, and do not save a conclusion from a task that failed.",
  "6. Keep the Skill under 3000 characters. When it grows past that, merge duplicates and drop the oldest unverified entries.",
  "7. First creation: show the user the domain and the entries and wait for confirmation. Later updates: apply them with the update tool and tell the user in one line what changed.",
  "",
  "## Self-correct",
  "",
  "If a loaded entry fails (the selector is gone, the path moved, the API changed), fix or delete that entry in the same task once you find the working way, and refresh its date. Entries confirmed again during a task get a new date. Delete an entry you cannot reproduce instead of keeping it.",
].join("\n");
