import { UNRELATED_ROLE_SIGNALS } from "./constants.js";
import type { RoleAnalysis, RoleClassification } from "./types.js";

type RoleRule = {
  phrase: string;
  classification: Exclude<RoleClassification, "AMBIGUOUS"> | "AMBIGUOUS";
  label: string;
  category?: string;
};

const TARGET: Array<[string, string]> = [
  ["full stack javascript developer", "Full Stack JavaScript Developer"],
  ["full stack javascript engineer", "Full Stack JavaScript Developer"],
  ["software development engineer i", "Software Development Engineer I"],
  ["software development engineer 1", "Software Development Engineer I"],
  ["software development engineer", "Software Development Engineer"],
  ["mern stack developer", "MERN Stack Developer"],
  ["full stack developer", "Full Stack Developer"],
  ["full stack engineer", "Full Stack Engineer"],
  ["fullstack developer", "Full Stack Developer"],
  ["fullstack engineer", "Full Stack Engineer"],
  ["javascript developer", "JavaScript Developer"],
  ["javascript engineer", "JavaScript Engineer"],
  ["typescript developer", "TypeScript Developer"],
  ["typescript engineer", "TypeScript Engineer"],
  ["backend engineer node js", "Backend Engineer — Node.js"],
  ["react js developer", "React.js Developer"],
  ["node js developer", "Node.js Developer"],
  ["node js engineer", "Node.js Engineer"],
  ["next js developer", "Next.js Developer"],
  ["next js engineer", "Next.js Engineer"],
  ["software engineer i", "Software Engineer I"],
  ["software engineer 1", "Software Engineer I"],
  ["mern developer", "MERN Developer"],
  ["react developer", "React Developer"],
  ["react engineer", "React Engineer"],
  ["node developer", "Node.js Developer"],
  ["node engineer", "Node.js Engineer"],
  ["next developer", "Next.js Developer"],
  ["next engineer", "Next.js Engineer"],
  ["backend engineer", "Backend Engineer"],
  ["software engineer", "Software Engineer"],
  ["web developer", "Web Developer"],
  ["web engineer", "Web Engineer"],
  ["sde 1", "SDE-1"],
  ["sde i", "SDE-1"],
  ["sde1", "SDE-1"],
  ["mern stack", "MERN Stack Developer"],
  ["fullstack", "Full Stack Developer"],
  ["mern", "MERN Developer"],
];

const RELATED: Array<[string, string]> = [
  ["full stack software engineer", "Full Stack Software Engineer"],
  ["web application engineer", "Web Application Engineer"],
  ["frontend engineer", "Frontend Engineer"],
  ["frontend developer", "Frontend Developer"],
  ["front end engineer", "Frontend Engineer"],
  ["front end developer", "Frontend Developer"],
  ["backend developer", "Backend Developer"],
  ["application developer", "Application Developer"],
  ["api engineer", "API Engineer"],
];

const AMBIGUOUS: Array<[string, string]> = [
  ["technical program manager", "Technical Program Manager"],
  ["member of technical staff", "Member of Technical Staff"],
  ["application engineer", "Application Engineer"],
  ["technical consultant", "Technical Consultant"],
  ["software consultant", "Software Consultant"],
  ["solutions engineer", "Solutions Engineer"],
  ["platform engineer", "Platform Engineer"],
  ["product engineer", "Product Engineer"],
  ["support engineer", "Support Engineer"],
  ["forward deployed engineer", "Forward Deployed Engineer"],
  ["design engineer", "Design Engineer"],
  ["solutions consultant", "Solutions Consultant"],
];

const EXCLUDED: Array<[string, string, string]> = [
  ["business development executive", "Business Development Executive", "Business/Sales"],
  ["business development manager", "Business Development Manager", "Business/Sales"],
  ["customer success manager", "Customer Success Manager", "Customer/Support"],
  ["customer support engineer", "Customer Support Engineer", "Customer/Support"],
  ["associate product manager", "Associate Product Manager", "Product/Management"],
  ["product operations manager", "Product Operations Manager", "Product/Management"],
  ["business intelligence analyst", "Business Intelligence Analyst", "Data/Analytics"],
  ["key account manager", "Key Account Manager", "Business/Sales"],
  ["talent acquisition", "Talent Acquisition", "HR/Recruiting"],
  ["relationship manager", "Relationship Manager", "Business/Sales"],
  ["business development", "Business Development", "Business/Sales"],
  ["technical recruiter", "Technical Recruiter", "HR/Recruiting"],
  ["hr business partner", "HR Business Partner", "HR/Recruiting"],
  ["people operations", "People Operations", "HR/Recruiting"],
  ["human resources", "Human Resources", "HR/Recruiting"],
  ["chartered accountant", "Chartered Accountant", "Finance/Accounting"],
  ["financial analyst", "Financial Analyst", "Finance/Accounting"],
  ["financial advisor", "Financial Advisor", "Finance/Accounting"],
  ["investment analyst", "Investment Analyst", "Finance/Accounting"],
  ["interaction designer", "Interaction Designer", "Design"],
  ["customer experience", "Customer Experience", "Customer/Support"],
  ["customer success", "Customer Success", "Customer/Support"],
  ["customer support", "Customer Support", "Customer/Support"],
  ["customer service", "Customer Service", "Customer/Support"],
  ["technical support", "Technical Support", "Customer/Support"],
  ["support specialist", "Support Specialist", "Customer/Support"],
  ["client acquisition", "Client Acquisition", "Business/Sales"],
  ["account executive", "Account Executive", "Business/Sales"],
  ["account manager", "Account Manager", "Business/Sales"],
  ["business consultant", "Business Consultant", "Business/Sales"],
  ["sales consultant", "Sales Consultant", "Business/Sales"],
  ["sales executive", "Sales Executive", "Business/Sales"],
  ["territory manager", "Territory Manager", "Business/Sales"],
  ["product management", "Product Management", "Product/Management"],
  ["product operations", "Product Operations", "Product/Management"],
  ["product specialist", "Product Specialist", "Product/Management"],
  ["product designer", "Product Designer", "Design"],
  ["product manager", "Product Manager", "Product/Management"],
  ["product analyst", "Product Analyst", "Product/Management"],
  ["product owner", "Product Owner", "Product/Management"],
  ["graphic designer", "Graphic Designer", "Design"],
  ["visual designer", "Visual Designer", "Design"],
  ["creative designer", "Creative Designer", "Design"],
  ["ux researcher", "UX Researcher", "Design"],
  ["user researcher", "User Researcher", "Design"],
  ["ui ux designer", "UI/UX Designer", "Design"],
  ["ux ui designer", "UI/UX Designer", "Design"],
  ["design manager", "Design Manager", "Design"],
  ["ux designer", "UX Designer", "Design"],
  ["ui designer", "UI Designer", "Design"],
  ["client support", "Client Support", "Customer/Support"],
  ["sales manager", "Sales Manager", "Business/Sales"],
  ["inside sales", "Inside Sales", "Business/Sales"],
  ["growth manager", "Growth Manager", "Business/Sales"],
  ["pre sales", "Pre-Sales", "Business/Sales"],
  ["operations manager", "Operations Manager", "Operations"],
  ["operations executive", "Operations Executive", "Operations"],
  ["operations analyst", "Operations Analyst", "Operations"],
  ["business operations", "Business Operations", "Operations"],
  ["revenue operations", "Revenue Operations", "Operations"],
  ["sales operations", "Sales Operations", "Operations"],
  ["program management", "Program Management", "Operations"],
  ["program manager", "Program Manager", "Operations"],
  ["project management", "Project Management", "Operations"],
  ["project manager", "Project Manager", "Operations"],
  ["marketing manager", "Marketing Manager", "Marketing"],
  ["digital marketing", "Digital Marketing", "Marketing"],
  ["content marketing", "Content Marketing", "Marketing"],
  ["public relations", "Public Relations", "Marketing"],
  ["brand manager", "Brand Manager", "Marketing"],
  ["social media", "Social Media", "Marketing"],
  ["communications", "Communications", "Marketing"],
  ["vendor management", "Vendor Management", "Procurement/Supply Chain"],
  ["supply chain", "Supply Chain", "Procurement/Supply Chain"],
  ["finance analyst", "Finance Analyst", "Finance/Accounting"],
  ["tax analyst", "Tax Analyst", "Finance/Accounting"],
  ["reporting analyst", "Reporting Analyst", "Data/Analytics"],
  ["business analyst", "Business Analyst", "Data/Analytics"],
  ["mis analyst", "MIS Analyst", "Data/Analytics"],
  ["data analyst", "Data Analyst", "Data/Analytics"],
  ["data scientist", "Data Scientist", "Data/Analytics"],
  ["data entry", "Data Entry", "Data/Analytics"],
  ["legal analyst", "Legal Analyst", "Legal"],
  ["legal associate", "Legal Associate", "Legal"],
  ["talent partner", "Talent Partner", "HR/Recruiting"],
  ["hr manager", "HR Manager", "HR/Recruiting"],
  ["quality assurance", "Quality Assurance", "Outside target"],
  ["android developer", "Android Developer", "Outside target"],
  ["devops engineer", "DevOps Engineer", "Outside target"],
  ["ios developer", "iOS Developer", "Outside target"],
  ["qa engineer", "QA Engineer", "Outside target"],
  ["procurement", "Procurement", "Procurement/Supply Chain"],
  ["purchasing", "Purchasing", "Procurement/Supply Chain"],
  ["accountant", "Accountant", "Finance/Accounting"],
  ["accounting", "Accounting", "Finance/Accounting"],
  ["recruiter", "Recruiter", "HR/Recruiting"],
  ["compliance", "Compliance", "Legal"],
  ["marketing", "Marketing", "Marketing"],
  ["logistics", "Logistics", "Procurement/Supply Chain"],
  ["salesforce", "Salesforce", "Outside target"],
  ["servicenow", "ServiceNow", "Outside target"],
  ["telephony", "Telephony", "Outside target"],
  ["sourcing", "Sourcing", "Procurement/Supply Chain"],
  ["auditor", "Auditor", "Finance/Accounting"],
  ["counsel", "Counsel", "Legal"],
  ["lawyer", "Lawyer", "Legal"],
  ["finance", "Finance", "Finance/Accounting"],
  ["legal", "Legal", "Legal"],
  ["audit", "Audit", "Finance/Accounting"],
  ["sales", "Sales", "Business/Sales"],
  ["bde", "BDE", "Business/Sales"],
  ["seo", "SEO", "Marketing"],
  ["sem", "SEM", "Marketing"],
  ["hr", "HR", "HR/Recruiting"],
  ["pr", "PR", "Marketing"],
  ["implementation manager", "Implementation Manager", "Operations"],
  ["deal desk", "Deal Desk", "Finance/Accounting"],
  ["developer relations", "Developer Relations", "Marketing"],
  ["engineering manager", "Engineering Manager", "Operations"],
  ["designer", "Designer", "Design"],
  ["devops", "DevOps", "Outside target"],
];

const STRONG_OBJECTS = [
  "web application development",
  "software development",
  "software engineering",
  "frontend development",
  "backend development",
  "api development",
  "full stack development",
  "production code",
  "software components",
  "web applications",
  "web application",
  "frontend systems",
  "backend systems",
  "microservices",
];

const CODING_OBJECTS = [
  "applications",
  "application",
  "services",
  "features",
  "software",
  "frontend",
  "backend",
  "apis",
  "api",
];

const NEGATIVE_EVIDENCE = [
  "sales quotas",
  "sales quota",
  "revenue targets",
  "revenue target",
  "customer acquisition",
  "account management",
  "client relationships",
  "client relationship",
  "product roadmap",
  "user research",
  "visual design",
  "customer support",
  "talent acquisition",
  "marketing campaigns",
  "marketing campaign",
  "financial analysis",
  "project coordination",
  "recruiting",
];

const TECH_KEYWORDS = [
  "react js",
  "node js",
  "next js",
  "rest api",
  "javascript",
  "typescript",
  "mongodb",
  "postgresql",
  "express",
  "docker",
  "react",
  "aws",
  "sql",
  "git",
];

const CODING_VERB =
  /\b(?:develop|develops|developing|build|builds|building|implement|implements|implementing|write|writes|writing|maintain|maintains|maintaining)\b/;

const OWNERSHIP_VERB =
  /\b(?:develop|develops|developing|build|builds|building|implement|implements|implementing|write|writes|writing|maintain|maintains|maintaining|own|owns|owning|design|designs|designing|responsible)\b/;

const MANAGES_ENGINEERS =
  /\bmanag(?:e|es|ing)\s+(?:developers|engineers|the engineering team)\b/;

const unrelatedCategory = (phrase: string): string => {
  if (phrase.includes("data") || phrase.includes("analyst")) return "Data/Analytics";
  return "Outside target";
};

const rules: RoleRule[] = [
  ...EXCLUDED.map(([phrase, label, category]) => ({
    phrase,
    classification: "EXCLUDED" as const,
    label,
    category,
  })),
  ...AMBIGUOUS.map(([phrase, label]) => ({
    phrase,
    classification: "AMBIGUOUS" as const,
    label,
  })),
  ...TARGET.map(([phrase, label]) => ({
    phrase,
    classification: "TARGET" as const,
    label,
  })),
  ...RELATED.map(([phrase, label]) => ({
    phrase,
    classification: "RELATED" as const,
    label,
  })),
  ...UNRELATED_ROLE_SIGNALS.map((phrase) => ({
    phrase,
    classification: "EXCLUDED" as const,
    label: phrase,
    category: unrelatedCategory(phrase),
  })),
];

export const normalizeRoleText = (value: string): string =>
  value
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const containsPhrase = (text: string, phrase: string): boolean =>
  ` ${text} `.includes(` ${phrase} `);

const bestRule = (title: string): RoleRule | undefined => {
  const matches = rules.filter((rule) => containsPhrase(title, rule.phrase));
  matches.sort((left, right) => right.phrase.length - left.phrase.length);
  return matches[0];
};

const phraseWithVerb = (description: string, object: string, verb: RegExp): boolean => {
  let from = 0;
  while (from < description.length) {
    const index = description.indexOf(object, from);
    if (index < 0) return false;
    const before = index === 0 || description[index - 1] === " ";
    const after = index + object.length;
    const afterOk = after === description.length || description[after] === " ";
    if (before && afterOk && verb.test(description.slice(Math.max(0, index - 70), index))) return true;
    from = index + Math.max(object.length, 1);
  }
  return false;
};

const responsibilityEvidence = (description: string): string[] => [
  ...STRONG_OBJECTS.filter((object) => phraseWithVerb(description, object, OWNERSHIP_VERB)),
  ...CODING_OBJECTS.filter((object) => phraseWithVerb(description, object, CODING_VERB)),
];

const negativeEvidence = (description: string): string[] => {
  const found = NEGATIVE_EVIDENCE.filter((phrase) => containsPhrase(description, phrase));
  if (MANAGES_ENGINEERS.test(description)) found.push("manages developers");
  return found;
};

const withOptionals = (
  analysis: RoleAnalysis,
  extras: Partial<Pick<RoleAnalysis, "matchedTargetRole" | "exclusionCategory" | "exclusionReason" | "evidence">>,
): RoleAnalysis => ({
  ...analysis,
  ...(extras.matchedTargetRole ? { matchedTargetRole: extras.matchedTargetRole } : {}),
  ...(extras.exclusionCategory ? { exclusionCategory: extras.exclusionCategory } : {}),
  ...(extras.exclusionReason ? { exclusionReason: extras.exclusionReason } : {}),
  ...(extras.evidence && extras.evidence.length > 0 ? { evidence: extras.evidence } : {}),
});

const assessAmbiguous = (rule: RoleRule, normalizedRole: string, description: string): RoleAnalysis => {
  const positives = responsibilityEvidence(description);
  const negatives = negativeEvidence(description);
  const keywords = TECH_KEYWORDS.filter((keyword) => containsPhrase(description, keyword));
  const evidence = [
    ...(keywords.length > 0 ? [`technical keywords: ${keywords.join(", ")}`] : []),
    ...positives.map((item) => `responsibility: ${item}`),
    ...negatives.map((item) => `non-engineering: ${item}`),
  ];
  const passed = positives.length > 0 && positives.length > negatives.length;
  if (passed) {
    return withOptionals(
      {
        status: "compatible",
        classification: "AMBIGUOUS",
        normalizedRole,
        confidence: 0.7,
        reason: `${rule.label} is accepted because the description assigns software engineering work`,
      },
      { matchedTargetRole: rule.label, evidence },
    );
  }
  const exclusionReason =
    negatives.length > 0
      ? `${rule.label} describes non-engineering work: ${negatives.join(", ")}`
      : `${rule.label} does not describe software engineering responsibility`;
  return withOptionals(
    {
      status: "incompatible",
      classification: "AMBIGUOUS",
      normalizedRole,
      confidence: 0.8,
      reason: exclusionReason,
    },
    { exclusionCategory: "Ambiguous title", exclusionReason, evidence },
  );
};

export const assessRoleRelevance = (title: string, description = ""): RoleAnalysis => {
  const normalizedRole = normalizeRoleText(title);
  const normalizedDescription = normalizeRoleText(description);
  const rule = bestRule(normalizedRole);
  if (!rule) {
    const exclusionReason = "Title is not a target or related software engineering role";
    return withOptionals(
      {
        status: "incompatible",
        classification: "EXCLUDED",
        normalizedRole,
        confidence: 0.7,
        reason: exclusionReason,
      },
      { exclusionCategory: "Not a target engineering role", exclusionReason },
    );
  }
  if (rule.classification === "EXCLUDED") {
    const category = rule.category ?? "Outside target";
    const exclusionReason = `${rule.label} belongs to ${category}`;
    return withOptionals(
      {
        status: "incompatible",
        classification: "EXCLUDED",
        normalizedRole,
        confidence: 0.95,
        reason: `Excluded ${category}: ${rule.label}`,
      },
      { exclusionCategory: category, exclusionReason },
    );
  }
  if (rule.classification === "AMBIGUOUS") {
    return assessAmbiguous(rule, normalizedRole, normalizedDescription);
  }
  return withOptionals(
    {
      status: "compatible",
      classification: rule.classification,
      normalizedRole,
      confidence: rule.classification === "TARGET" ? 0.95 : 0.85,
      reason:
        rule.classification === "TARGET"
          ? `Role matches target software engineering role: ${rule.label}`
          : `Role is related software engineering work: ${rule.label}`,
    },
    { matchedTargetRole: rule.label },
  );
};
