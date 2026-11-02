import type { SkillExtension } from "#sdk/shared/skill-definition";
import workbench from "./workbench.js";
import siteAuthor from "./site-author.js";
import findSkills from "./find-skills.js";
import taskRetrospective from "./task-retrospective.js";

const register: SkillExtension = qz => {
  qz.registerSkill(workbench);
  qz.registerSkill(siteAuthor);
  qz.registerSkill(findSkills);
  qz.registerSkill(taskRetrospective);
};
export default register;
