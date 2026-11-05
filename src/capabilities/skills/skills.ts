import type { SkillExtension } from "#sdk/shared/skill-definition";
import workbench from "./workbench.js";
import siteAuthor from "./site-author.js";
import findSkills from "./find-skills.js";
import taskRetrospective from "./task-retrospective.js";
import siteMemory from "./site-memory.js";

const register: SkillExtension = zuri => {
  zuri.registerSkill(workbench);
  zuri.registerSkill(siteAuthor);
  zuri.registerSkill(findSkills);
  zuri.registerSkill(taskRetrospective);
  zuri.registerSkill(siteMemory);
};
export default register;
