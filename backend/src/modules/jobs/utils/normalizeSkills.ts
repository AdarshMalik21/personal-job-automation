import { normalizeText } from "./text.js";

const aliases: Record<string, string> = {
  reactjs: "react",
  "react.js": "react",
  nodejs: "node.js",
  "type script": "typescript",
  "mongo db": "mongodb",
};

export const normalizeSkill = (skill: string): string => {
  const normalized = normalizeText(skill);
  return aliases[normalized] ?? normalized;
};

export const normalizeSkills = (skills: string[] | undefined): string[] =>
  [...new Set((skills ?? []).map(normalizeSkill).filter(Boolean))];