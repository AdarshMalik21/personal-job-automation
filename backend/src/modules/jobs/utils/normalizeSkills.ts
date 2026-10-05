import { normalizeText } from "./text.js";

const aliases: Record<string, string> = {
  "c++": "c++",
  "c plus plus": "c++",
  "c#": "c#",
  "c sharp": "c#",
  ".net": ".net",
  dotnet: ".net",
  "node.js": "node.js",
  reactjs: "react",
  "react.js": "react",
  nodejs: "node.js",
  "node js": "node.js",
  "type script": "typescript",
  "mongo db": "mongodb",
};

export const normalizeSkill = (skill: string): string => {
  const rawNormalized = skill.trim().toLowerCase().replace(/\s+/g, " ");
  const aliasedRawSkill = aliases[rawNormalized];
  if (aliasedRawSkill) return aliasedRawSkill;

  const normalized = normalizeText(skill);
  return aliases[normalized] ?? normalized;
};

export const normalizeSkills = (skills: string[] | undefined): string[] => [
  ...new Set((skills ?? []).map(normalizeSkill).filter(Boolean)),
];
