import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fillObservedPage,
  isFinalSubmissionControl,
  isSafeApplicationUrl,
  runApplication,
} from "../applicationRunner.js";
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

type MockControl = { name: string; type?: "button" | "submit"; onClick?: () => void };

const pageWith = (fields: DetectedApplicationField[], controls: MockControl[] = []) => {
  const locators = new Map(fields.map((field) => [field.elementId, locator()]));
  const page = {
    url: () => "https://jobs.example.test/apply",
    waitForTimeout: async () => undefined,
    locator: (selector: string) => {
      const id = fields.find(
        (field) => (field.id && selector.includes(field.id)) || (field.name && selector.includes(field.name)),
      )?.elementId;
      return locators.get(id ?? "") ?? locator();
    },
    getByRole: (_role: string, options: { name: RegExp }) => {
      const control = controls.find((item) => options.name.test(item.name));
      return {
        count: async () => (control ? 1 : 0),
        click: async () => {
          if (control?.onClick) control.onClick();
          else throw new Error("submit must never be clicked");
        },
      };
    },
  };
  const originalLocator = page.locator;
  page.locator = ((selector: string) => {
    if (selector.includes("type=\"submit\"")) {
      return {
        evaluateAll: async () => controls.filter((control) => control.type === "submit").map((control) => control.name),
        count: async () => controls.filter((control) => control.type === "submit").length,
      };
    }
    return originalLocator(selector);
  }) as typeof page.locator;
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
    const { page } = pageWith([], [{ name: "Submit Application", type: "submit" }]);
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

  it("rejects private and local application destinations", () => {
    for (const url of [
      "http://localhost:3000/apply",
      "http://127.0.0.1/apply",
      "http://10.0.0.1/apply",
      "http://172.16.0.1/apply",
      "http://192.168.0.1/apply",
      "http://169.254.169.254/",
      "http://[::1]/apply",
    ]) {
      assert.equal(isSafeApplicationUrl(url), false, url);
    }
    assert.equal(isSafeApplicationUrl("https://jobs.example.com/apply"), true);
  });

  it("classifies submit-type navigation controls as navigation", () => {
    for (const name of ["Continue", "Next", "Save & Continue", "Review Application"]) {
      assert.equal(isFinalSubmissionControl(name), false, name);
    }
    for (const name of ["Submit Application", "Apply Now", "Finish Application"]) {
      assert.equal(isFinalSubmissionControl(name), true, name);
    }
  });

  it("clicks submit-type Continue and Next navigation without stopping", async () => {
    for (const name of ["Continue", "Next", "Save & Continue", "Review Application"]) {
      let clicked = 0;
      const { page } = pageWith([], [{ name, type: "submit", onClick: () => { clicked += 1; } }]);
      const result = await fillObservedPage(page as never, input(), {
        inspectFields: async () => [],
        getPageText: async () => "changed application page",
      });
      assert.notEqual(result.status, "READY_FOR_SUBMISSION", name);
      assert.equal(clicked, 1, name);
    }
  });

  it("detects actual submit controls without clicking them", async () => {
    for (const name of ["Submit Application", "Apply Now", "Finish Application"]) {
      let clicked = 0;
      const { page } = pageWith([], [{ name, type: "submit", onClick: () => { clicked += 1; } }]);
      const result = await fillObservedPage(page as never, input(), {
        inspectFields: async () => [],
        getPageText: async () => "review",
      });
      assert.equal(result.status, "READY_FOR_SUBMISSION", name);
      assert.equal(clicked, 0, name);
    }
  });

  it("processes an intermediate page before stopping at final submission", async () => {
    let pageIndex = 0;
    let nextClicks = 0;
    let submitClicks = 0;
    const pages = [
      [
        { elementId: "first", type: "text", id: "first-name", label: "First Name", required: true, options: [] },
        { elementId: "email", type: "email", id: "email", label: "Email", required: true, options: [] },
      ],
      [{ elementId: "resume", type: "file", id: "resume", label: "Resume", required: false, options: [] }],
    ] satisfies DetectedApplicationField[][];
    const page = {
      url: () => `https://jobs.example.test/apply/${pageIndex + 1}`,
      locator: (selector: string) => {
        if (selector.includes("type=\"submit\"")) {
          const controls = pageIndex === 0
            ? [{ name: "Continue", type: "submit" as const }]
            : [{ name: "Submit Application", type: "submit" as const }];
          return {
            evaluateAll: async () => controls.map((control) => control.name),
            count: async () => controls.length,
          };
        }
        return locator();
      },
      getByLabel: () => locator(),
      getByRole: (_role: string, options: { name: RegExp }) => {
        const name = pageIndex === 0 ? "Continue" : "Submit Application";
        return {
          count: async () => (options.name.test(name) ? 1 : 0),
          click: async () => {
            if (pageIndex === 0) {
              nextClicks += 1;
              pageIndex = 1;
            } else {
              submitClicks += 1;
            }
          },
        };
      },
      waitForTimeout: async () => undefined,
    };
    const result = await fillObservedPage(page as never, input(), {
      inspectFields: async () => pages[pageIndex]!,
      getPageText: async () => `page ${pageIndex + 1}`,
    });
    assert.equal(result.status, "READY_FOR_SUBMISSION");
    assert.equal(result.pagesProcessed, 2);
    assert.equal(nextClicks, 1);
    assert.equal(submitClicks, 0);
  });
});
