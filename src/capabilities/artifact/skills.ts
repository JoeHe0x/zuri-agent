import type { SkillExtension } from "#sdk/shared/skill-definition";
import artifact from "./skill.js";

const register: SkillExtension = qz => {
  qz.registerSkill(artifact);
};
export default register;
