/** Authored built-in Skill instructions; protocol identifiers remain stable across locales. */
export const displayName = "Find Skills";
export const description = "Discover and install Skills from the open agent skills ecosystem. Use when the user asks \"how do I do X\", \"find a skill for X\", \"is there a skill that can...\", or wants to extend what Weee Agent can do.";

export const content = [
  "# Find Skills",
  "",
  "Search the open skills ecosystem at https://skills.sh/ and install a match into Weee Agent.",
  "",
  "1. Identify the domain and task (for example React testing, PR review, changelog).",
  "2. Open `https://skills.sh/` (leaderboard) or `https://skills.sh/?q=<keywords>` with the page or Network tools and read the results. Use specific keywords and retry with synonyms.",
  "3. Verify before recommending: prefer 1K+ installs, official or reputable owners, and a source repository with real stars. Treat skills under 100 installs with caution.",
  "4. Present the best one to three options to the user: name, what it does, install count, source repository, and the skills.sh link.",
  "5. After the user agrees, install it from its GitHub repository URL with the Git inspection/import tool (`import_git_skill_repository`). Do not pass `overwrite:true` for name conflicts without user confirmation. Do not run `npx skills`; Weee Agent has no shell.",
  "6. If nothing fits, say so, offer to do the task directly, and mention that `skill-workbench` can create a custom Skill.",
].join("\n");
