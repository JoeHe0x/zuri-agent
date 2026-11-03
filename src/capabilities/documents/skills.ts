import type { SkillExtension } from "#sdk/shared/skill-definition";
import embedded from "./embedded-skill.js";
import reportDesign from "./artifact-skill.js";

const register: SkillExtension = qz => {
  qz.registerSkill(embedded);
  qz.registerSkill(reportDesign);
};
export default register;
