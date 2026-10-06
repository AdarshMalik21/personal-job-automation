import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillObservedPage, runApplication } from "../applicationRunner.js";
import type { BrowserRunnerInput } from "../applicationRunner.js";
import type { DetectedApplicationField } from "../browserRunTypes.js";
import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";

const candidate: CandidateProfile = {
  isActive: true,
  personal: { firstName: "Asha", lastName: "Patel" },
  contact: { email: "asha@example.com", phone: "+911234567890" },
  yearsOfExperience: 4,
  experience: [],
  education: [],
  skills: ["Node.js"],
  technologies: [],
  projects: [],
  certifications: [],
  preferredRoles: [],
  preferredLocations: [],
  remotePreference: "any",
  verifiedInformation: {},
  relatedTechnology: [],
  unknownInformation: [],
};

const preparation = {
  status: "ready_for_review" as const,
  tailoredResume: { personal: {}, contact: {}, skills: [], technologies: [], experience: [], projects: [], education: [], certifications: [] },
  coverLetter: { status: "not_required" as const, reason: "Not required" },
  generatedAnswers: [],
  missingInformation: [],
  generationMetadata: {},
};

const input = (overrides: Partial<BrowserRunnerInput["job"]> = {}): BrowserRunnerInput => ({
  job: {
    officialApplicationUrl: "https://jobs.example.test/apply",
    status: "discovered",
    ...overrides,
  },
  candidate,
  preparation,
});

const locator = (value = "") => {
  let current = value;
  let checked = false;
  let uploaded = "";
  return {
    fill: async (next: string) => {
      current = next;
    },
    inputValue: async () => uploaded || current,
    selectOption: async ({ label }: { label: string }) => {
      current = label;
    },
    check: async () => {
      checked = true;
    },
    isChecked: async () => checked,
    setInputFiles: async (path: string) => {
      uploaded = path;
    },
  };
};

const pageWith = (fields: DetectedApplicationField[], submit = false) => {
  const locators = new Map(fields.map((field) => [field.elementId, locator()]));
  const page = {
    url: () => "https://jobs.example.test/apply",
    locator: (selector: string) => {
      const id = fields.find(
        (field) => (field.id && selector.includes(field.id)) || (field.name && selector.includes(field.name)),
      )?.elementId;
      return locators.get(id ?? "") ?? locator();
    },
    getByRole: (_role: string, options: { name: RegExp }) => ({
      count: async () => (submit && options.name.test("Submit Application") ? 1 : 0),
      click: async () => {
        throw new Error("submit must never be clicked");
      },
    }),
  };
  return { page, locators };
};

describe("application browser runner", () => {
  it("fills observed first name and email fields and verifies values", async () => {
    const fields: DetectedApplicationField[] = [
      { elementId: "first", type: "text", id: "first-name", label: "First Name", required: true, options: [] },
      { elementId: "email", type: "email", id: "email", label: "Email", required: true, options: [] },
    ];
    const { page } = pageWith(fields);
    const result = await fillObservedPage(page as never, input(), {
      inspectFields: async () => fields,
      getPageText: async () => "application form",
    });
    assert.equal(result.status, "RUNNING");
    assert.deepEqual(result.fieldsFilled, ["first", "email"]);
  });

  it("pauses on an unknown required field", async () => {
    const fields: DetectedApplicationField[] = [
      { elementId: "unknown", type: "text", id: "unknown", label: "Professional Background", required: true, options: [] },
    ];
    const { page } = pageWith(fields);
    const result = await fillObservedPage(page as never, input(), {
      inspectFields: async () => fields,
      getPageText: async () => "application form",
    });
    assert.equal(result.status, "PAUSED_FOR_REVIEW");
    assert.equal(result.reviewItems[0]?.field?.label, "Professional Background");
  });

  it("detects submit and never clicks it", async () => {
    const { page } = pageWith([], true);
    const result = await fillObservedPage(page as never, input(), {
      inspectFields: async () => [],
      getPageText: async () => "review",
    });
    assert.equal(result.status, "READY_FOR_SUBMISSION");
    assert.match(result.reason ?? "", /not clicked/);
  });

  it("returns explicit security and preparation stop states", async () => {
    assert.equal(
      (await fillObservedPage(pageWith([]).page as never, input(), {
        inspectFields: async () => [],
        getPageText: async () => "captcha security challenge",
      })).status,
      "CAPTCHA_REQUIRED",
    );
    assert.equal(
      (await runApplication(
        { ...input(), preparation: { ...preparation, status: "needs_information" } },
        async () => {
          throw new Error("browser must not start");
        },
      )).status,
      "MISSING_INFORMATION",
    );
  });

  it("rejects invalid URLs before opening a browser", async () => {
    const result = await runApplication(
      input({ officialApplicationUrl: "javascript:alert(1)" }),
      async () => {
        throw new Error("browser must not start");
      },
    );
    assert.equal(result.status, "FAILED");
  });
});
