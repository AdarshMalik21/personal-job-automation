import { access } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import { mapApplicationField } from "./applicationFormMapper.js";
import { inspectApplicationFields, pageText } from "./applicationPageInspector.js";
import type { BrowserRunResult, DetectedApplicationField } from "./browserRunTypes.js";
import type { PreparationResult } from "./types.js";

export type BrowserFactory = () => Promise<Browser>;
export type BrowserRunnerInput = {
  job: Pick<Job, "officialApplicationUrl" | "status"> & { match?: { decision?: string } };
  candidate: CandidateProfile;
  preparation: PreparationResult & {
    tailoredResume?: PreparationResult["tailoredResume"] & { filePath?: string };
    coverLetter?: PreparationResult["coverLetter"] & { filePath?: string };
  };
};

const defaultBrowserFactory: BrowserFactory = () => chromium.launch({ headless: true });
const finalButtonPattern = /\b(submit|apply|finish|complete|send)\b/i;
const statusFromPage = (text: string): BrowserRunResult["status"] | undefined => {
  if (/captcha|cloudflare|security challenge/.test(text)) return "CAPTCHA_REQUIRED";
  if (/one time password|\botp\b/.test(text)) return "OTP_REQUIRED";
  if (/two factor|2fa|authenticator/.test(text)) return "TWO_FACTOR_REQUIRED";
  if (/\blog ?in\b|sign in|password/.test(text)) return "LOGIN_REQUIRED";
  return undefined;
};

const validUrl = (value: string | undefined): value is string => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const filePath = async (candidatePath: string | undefined): Promise<string | undefined> => {
  if (!candidatePath) return undefined;
  try {
    await access(candidatePath);
    return candidatePath;
  } catch {
    return undefined;
  }
};

const fieldLocator = (page: Page, field: DetectedApplicationField) => {
  if (field.id) return page.locator(`#${field.id}`);
  if (field.name) return page.locator(`[name="${field.name}"]`);
  return page.locator(`[data-application-field-id="${field.elementId}"]`);
};

export const runApplication = async (
  input: BrowserRunnerInput,
  browserFactory: BrowserFactory = defaultBrowserFactory,
): Promise<BrowserRunResult> => {
  if (!validUrl(input.job.officialApplicationUrl)) {
    return {
      status: "FAILED",
      fieldsDetected: 0,
      fieldsFilled: [],
      fieldsSkipped: [],
      uploads: [],
      reviewItems: [],
      reason: "Official application URL is invalid",
    };
  }
  if (input.job.status === "closed" || input.job.match?.decision === "SKIP") {
    return {
      status: "FAILED",
      fieldsDetected: 0,
      fieldsFilled: [],
      fieldsSkipped: [],
      uploads: [],
      reviewItems: [],
      reason: "Job is not eligible for browser filling",
    };
  }
  if (input.preparation.status === "failed") {
    return {
      status: "FAILED",
      fieldsDetected: 0,
      fieldsFilled: [],
      fieldsSkipped: [],
      uploads: [],
      reviewItems: [],
      reason: "Application preparation failed",
    };
  }
  if (input.preparation.status === "needs_information") {
    return {
      status: "MISSING_INFORMATION",
      fieldsDetected: 0,
      fieldsFilled: [],
      fieldsSkipped: [],
      uploads: [],
      reviewItems: [],
      reason: "Application preparation has unresolved information",
    };
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  try {
    browser = await browserFactory();
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(input.job.officialApplicationUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    return await fillObservedPage(page, input);
  } catch (error) {
    return {
      status: "FAILED",
      fieldsDetected: 0,
      fieldsFilled: [],
      fieldsSkipped: [],
      uploads: [],
      reviewItems: [],
      reason: error instanceof Error ? error.message : "Browser run failed",
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
};

export const fillObservedPage = async (
  page: Page,
  input: BrowserRunnerInput,
  dependencies: {
    inspectFields?: (page: Page) => Promise<DetectedApplicationField[]>;
    getPageText?: (page: Page) => Promise<string>;
  } = {},
): Promise<BrowserRunResult> => {
  const inspectFields = dependencies.inspectFields ?? inspectApplicationFields;
  const getPageText = dependencies.getPageText ?? pageText;
  const fields = await inspectFields(page);
  const result: BrowserRunResult = {
    status: "RUNNING",
    url: page.url(),
    fieldsDetected: fields.length,
    fieldsFilled: [],
    fieldsSkipped: [],
    uploads: [],
    reviewItems: [],
  };
  const pageStatus = statusFromPage(await getPageText(page));
  if (pageStatus) return { ...result, status: pageStatus };

  const mappings = fields.map((field) =>
    mapApplicationField(field, input.candidate, input.preparation.generatedAnswers),
  );
  for (const mapping of mappings) {
    const locator = fieldLocator(page, mapping.field);
    if (mapping.value === undefined) {
      result.fieldsSkipped.push(mapping.field.elementId);
      if (mapping.field.required) {
        result.reviewItems.push({ reason: mapping.reason ?? "Required field needs review", field: mapping.field });
      }
      continue;
    }
    if (mapping.field.type === "file") continue;
    if (mapping.field.type === "select-one") {
      await locator.selectOption({ label: mapping.value });
    } else if (mapping.field.type === "checkbox" || mapping.field.type === "radio") {
      await locator.check();
    } else {
      await locator.fill(mapping.value);
    }
    const verified = mapping.field.type === "checkbox" || mapping.field.type === "radio"
      ? await locator.isChecked()
      : await locator.inputValue() === mapping.value;
    if (!verified) {
      result.reviewItems.push({ reason: "Field value could not be verified", field: mapping.field });
    } else {
      result.fieldsFilled.push(mapping.field.elementId);
    }
  }
  const resumePath = await filePath(input.preparation.tailoredResume?.filePath);
  const coverLetterPath = await filePath(input.preparation.coverLetter?.filePath);
  for (const field of fields.filter((item) => item.type === "file")) {
    const path = /cover|motivation/i.test(field.label ?? "")
      ? coverLetterPath
      : resumePath;
    if (!path) {
      if (field.required) result.reviewItems.push({ reason: "Required prepared file is unavailable", field });
      continue;
    }
    const locator = fieldLocator(page, field);
    await locator.setInputFiles(path);
    if ((await locator.inputValue()) === "") {
      result.reviewItems.push({ reason: "File upload could not be verified", field });
    } else {
      result.uploads.push(field.elementId);
    }
  }
  const submit = page.getByRole("button", { name: finalButtonPattern });
  if (await submit.count()) {
    return {
      ...result,
      status: result.reviewItems.length ? "PAUSED_FOR_REVIEW" : "READY_FOR_SUBMISSION",
      reason: "Final submission control detected; it was not clicked",
    };
  }
  if (result.reviewItems.length) return { ...result, status: "PAUSED_FOR_REVIEW" };
  const next = page.getByRole("button", { name: /\b(next|continue|save and continue)\b/i });
  if (await next.count()) {
    const before = page.url();
    await next.click();
    await page.waitForTimeout(100);
    if (page.url() === before && (await getPageText(page)).includes("continue")) {
      return { ...result, status: "PAUSED_FOR_REVIEW", reason: "Continue action could not be verified" };
    }
  }
  return result;
};
