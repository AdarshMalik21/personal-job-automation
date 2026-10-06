import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium } from "playwright";
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

  it("fills fields inside the embedded application frame", async () => {
    const fields: DetectedApplicationField[] = [
      { elementId: "first", type: "text", id: "first-name", label: "First Name", required: true, options: [] },
      { elementId: "email", type: "email", id: "email", label: "Email", required: true, options: [] },
    ];
    const { page: application } = pageWith(fields);
    const seen: string[] = [];
    const { host } = hostWithFrames(application, [
      { url: "https://www.recaptcha.net/recaptcha/enterprise/anchor", name: "a-recaptcha", controls: 2 },
      { url: "https://cdn.example.test/analytics", controls: 4 },
    ]);
    const result = await fillObservedPage(host as never, input(), {
      inspectFields: async (surface) => {
        seen.push(surface.url());
        return surface.url().includes("job_app") ? fields : [];
      },
      getPageText: async () => "application form",
    });
    assert.equal(result.applicationFrameDetected, true);
    assert.match(result.frameUrl ?? "", /job-boards\.greenhouse\.io\/embed\/job_app/);
    assert.deepEqual(result.fieldsFilled, ["first", "email"]);
    assert.deepEqual(seen, ["https://job-boards.greenhouse.io/embed/job_app?token=7993984"]);
  });

  it("follows Continue inside the application frame", async () => {
    let step = 0;
    let text = "application step";
    const application = {
      url: () => "https://job-boards.greenhouse.io/embed/job_app?token=7993984",
      name: () => "grnhse_iframe",
      locator: () => ({ count: async () => 1, evaluateAll: async () => [] }),
      getByRole: (_role: string, options: { name: RegExp }) => ({
        count: async () => (step === 0 && options.name.test("Continue") ? 1 : 0),
        click: async () => {
          step += 1;
          text = "next application step";
        },
      }),
      waitForTimeout: async () => undefined,
    };
    const { host } = hostWithFrames(application);
    const result = await fillObservedPage(host as never, input(), {
      inspectFields: async () => [],
      getPageText: async () => text,
    });
    assert.equal(step, 1);
    assert.equal(result.pagesProcessed, 2);
    assert.equal(result.status, "RUNNING");
    assert.equal(result.applicationFrameDetected, true);
  });

  it("detects final submission inside the frame and does not click it", async () => {
    let clicked = 0;
    const application = {
      url: () => "https://boards.greenhouse.io/embed/job_app?token=7993984",
      name: () => "grnhse_iframe",
      locator: (selector: string) => {
        if (selector.includes("type=\"submit\"")) {
          return { evaluateAll: async () => ["Submit Application"], count: async () => 1 };
        }
        return { count: async () => 1, evaluateAll: async () => [] };
      },
      getByRole: (_role: string, options: { name: RegExp }) => ({
        count: async () => (options.name.test("Submit Application") ? 1 : 0),
        click: async () => {
          clicked += 1;
        },
      }),
      waitForTimeout: async () => undefined,
    };
    const { host } = hostWithFrames(application);
    const result = await fillObservedPage(host as never, input(), {
      inspectFields: async () => [],
      getPageText: async () => "review application",
    });
    assert.equal(clicked, 0);
    assert.equal(result.status, "READY_FOR_SUBMISSION");
    assert.match(result.reason ?? "", /not clicked/);
    assert.match(result.frameUrl ?? "", /embed\/job_app/);
  });

  it("does not treat a captcha frame as the application form", async () => {
    let captchaInspected = false;
    const captcha = {
      url: () => "https://www.recaptcha.net/recaptcha/enterprise/anchor",
      name: () => "a-recaptcha",
      locator: () => ({
        count: async () => 1,
        evaluateAll: async () => {
          captchaInspected = true;
          return [];
        },
        innerText: async () => "captcha",
      }),
      getByRole: () => ({
        count: async () => 0,
        click: async () => {
          throw new Error("captcha frame must not be clicked");
        },
      }),
    };
    const host = {
      url: () => "https://www.mongodb.com/careers/jobs/7993984",
      mainFrame: () => host,
      frames: () => [host, captcha],
      locator: () => ({
        count: async () => 0,
        evaluateAll: async () => [],
        innerText: async () => "careers",
      }),
      getByRole: () => ({
        count: async () => 0,
        click: async () => {
          throw new Error("top page must not be clicked");
        },
      }),
      waitForTimeout: async () => undefined,
    };
    const result = await fillObservedPage(host as never, input(), {
      getPageText: async () => "careers",
    });
    assert.equal(captchaInspected, false);
    assert.equal(result.fieldsDetected, 0);
    assert.equal(result.applicationFrameDetected, undefined);
    assert.equal(result.status, "CAPTCHA_REQUIRED");
  });

  it("fills, navigates, and stops before submit in a real embedded frame", async (t) => {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      t.skip("Chromium is not installed");
      return;
    }
    const page = await browser.newPage();
    try {
      await page.route("https://job-boards.greenhouse.io/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><body>
            <label for="first_name">First Name</label>
            <input id="first_name" name="first_name" required>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required>
            <button type="button" id="next">Continue</button>
            <script>
              document.getElementById("next").addEventListener("click", () => {
                document.body.innerHTML = '<label for="last_name">Last Name</label><input id="last_name" name="last_name" required><button type="submit" id="submit">Submit Application</button>';
                document.getElementById("submit").addEventListener("click", () => { window.__submitted = true; });
              });
            </script>
          </body></html>`,
        }),
      );
      await page.route("https://www.recaptcha.net/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<html><body><input name='g-recaptcha-response'></body></html>",
        }),
      );
      await page.setContent(`<iframe src="https://job-boards.greenhouse.io/embed/job_app?token=7993984"></iframe>
        <iframe name="a-recaptcha" src="https://www.recaptcha.net/recaptcha/enterprise/anchor"></iframe>`);
      await page.frameLocator("iframe[src*='job_app']").locator("#first_name").waitFor();
      const result = await fillObservedPage(page, input());
      const submitted = await page.frames()
        .find((frame) => frame.url().includes("job_app"))
        ?.evaluate(() => Boolean((window as Window & { __submitted?: boolean }).__submitted));
      assert.equal(submitted, false);
      assert.equal(result.applicationFrameDetected, true);
      assert.match(result.frameUrl ?? "", /embed\/job_app/);
      assert.equal(result.pagesProcessed, 2);
      assert.equal(result.status, "READY_FOR_SUBMISSION");
      assert.match(result.reason ?? "", /not clicked/);
      assert.equal(result.fieldsFilled.length, 3);
    } finally {
      await browser.close();
    }
  });
});

const hostWithFrames = (
  application: {
    url?: () => string;
    locator: (selector: string) => unknown;
    getByRole: (role: string, options: { name: RegExp }) => { count: () => Promise<number>; click: () => Promise<void> };
  },
  extras: Array<{ url: string; name?: string; controls?: number }> = [],
) => {
  const applicationFrame = {
    ...application,
    name: () => "grnhse_iframe",
    waitForTimeout: async () => undefined,
    url: () => "https://job-boards.greenhouse.io/embed/job_app?token=7993984",
  };
  const extraFrames = extras.map((extra) => ({
    url: () => extra.url,
    name: () => extra.name ?? "",
    locator: () => ({ count: async () => extra.controls ?? 0, evaluateAll: async () => [] }),
    getByRole: () => ({
      count: async () => 0,
      click: async () => {
        throw new Error("unrelated frame used");
      },
    }),
  }));
  const host = {
    url: () => "https://www.mongodb.com/careers/jobs/7993984",
    mainFrame: () => host,
    frames: () => [host, ...extraFrames, applicationFrame],
    locator: () => ({ count: async () => 0, evaluateAll: async () => [] }),
    getByRole: () => ({
      count: async () => 0,
      click: async () => {
        throw new Error("top page control used");
      },
    }),
    waitForTimeout: async () => undefined,
  };
  return { host, applicationFrame };
};
