import { access } from "node:fs/promises";
import { isIP } from "node:net";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import { mapApplicationField } from "./applicationFormMapper.js";
import { inspectApplicationFields, pageText } from "./applicationPageInspector.js";
import type { BrowserRunResult, DetectedApplicationField } from "./browserRunTypes.js";
import type { PreparationResult } from "./types.js";

export type BrowserFactory = () => Promise<Browser>;
export type BrowserRunHooks = {
  onBrowserCreated?: (browser: Browser, context: BrowserContext) => void;
  isStopped?: () => boolean;
};
export type BrowserRunnerInput = {
  job: Pick<Job, "officialApplicationUrl" | "status"> & { match?: { decision?: string } };
  candidate: CandidateProfile;
  preparation: PreparationResult & {
    tailoredResume?: PreparationResult["tailoredResume"] & { filePath?: string };
    coverLetter?: PreparationResult["coverLetter"] & { filePath?: string };
  };
};

const defaultBrowserFactory: BrowserFactory = () => chromium.launch({ headless: true });
const MAX_APPLICATION_PAGES = 10;
const finalButtonPattern = /^\s*(submit(?: application)?|apply(?: now)?|finish(?: application)?|complete(?: application)?|send application)\s*$/i;
const navigationButtonPattern =
  /^\s*(next(?: step)?|continue(?: to application| application)?|save\s*(?:&|and)\s*continue|proceed|review(?: application)?|previous|back)\s*$/i;
const statusFromPage = (text: string): BrowserRunResult["status"] | undefined => {
  if (/captcha|cloudflare|security challenge/.test(text)) return "CAPTCHA_REQUIRED";
  if (/one time password|\botp\b/.test(text)) return "OTP_REQUIRED";
  if (/two factor|2fa|authenticator/.test(text)) return "TWO_FACTOR_REQUIRED";
  if (/\blog ?in\b|sign in|password/.test(text)) return "LOGIN_REQUIRED";
  return undefined;
};

export const isSafeApplicationUrl = (value: string | undefined): value is string => {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "ip6-loopback"
    ) return false;
    const ipVersion = isIP(hostname);
    if (ipVersion === 4) {
      const [first = -1, second = -1] = hostname.split(".").map(Number);
      return !(
        first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)
      );
    }
    if (ipVersion === 6) {
      return hostname !== "::1" && !hostname.startsWith("fc") && !hostname.startsWith("fd") && !hostname.startsWith("fe80:");
    }
    return true;
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

const cssEscape = (value: string) => value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");

const fieldLocator = (page: Page, field: DetectedApplicationField) => {
  if (field.label && typeof (page as Page & { getByLabel?: unknown }).getByLabel === "function") {
    const labelled = page.getByLabel(field.label, { exact: true });
    if (field.id || field.name) return labelled;
  }
  if (field.id) return page.locator(`#${cssEscape(field.id)}`);
  if (field.name) return page.locator(`[name="${cssEscape(field.name)}"]`);
  return page.locator(`[data-application-field-id="${field.elementId}"]`);
};
const count = async (locator: { count?: () => Promise<number> }) =>
  typeof locator.count === "function" ? locator.count() : 0;

export const isFinalSubmissionControl = (name: string): boolean =>
  finalButtonPattern.test(name.trim()) && !navigationButtonPattern.test(name.trim());

const submitControlNames = async (page: Page): Promise<string[]> => {
  const controls = page.locator('button[type="submit"], input[type="submit"]');
  if (typeof (controls as { evaluateAll?: unknown }).evaluateAll !== "function") return [];
  return controls.evaluateAll((elements) =>
    elements.map((element) =>
      element instanceof HTMLInputElement
        ? element.value
        : element.textContent?.trim() ?? "",
    ),
  );
};

export const runApplication = async (
  input: BrowserRunnerInput,
  browserFactory: BrowserFactory = defaultBrowserFactory,
  hooks: BrowserRunHooks = {},
): Promise<BrowserRunResult> => {
  if (!isSafeApplicationUrl(input.job.officialApplicationUrl)) {
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
    hooks.onBrowserCreated?.(browser, context);
    const page = await context.newPage();
    await page.goto(input.job.officialApplicationUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    return await fillObservedPage(page, input);
  } catch (error) {
    if (hooks.isStopped?.()) {
      return {
        status: "PAUSED_FOR_REVIEW",
        fieldsDetected: 0,
        fieldsFilled: [],
        fieldsSkipped: [],
        uploads: [],
        reviewItems: [],
        reason: "Browser run stopped by user",
      };
    }
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
  const result: BrowserRunResult = {
    status: "RUNNING",
    url: page.url(),
    fieldsDetected: 0,
    fieldsFilled: [],
    fieldsSkipped: [],
    uploads: [],
    reviewItems: [],
    pagesProcessed: 0,
  };
  for (let pageNumber = 0; pageNumber < MAX_APPLICATION_PAGES; pageNumber += 1) {
    result.pagesProcessed = pageNumber + 1;
    result.url = page.url();
    const pageStatus = statusFromPage(await getPageText(page));
    if (pageStatus) return { ...result, status: pageStatus };
    const fields = await inspectFields(page);
    result.fieldsDetected += fields.length;
    const mappings = fields.map((field) =>
      mapApplicationField(field, input.candidate, input.preparation.generatedAnswers),
    );
    for (const mapping of mappings) {
      const locator = fieldLocator(page, mapping.field);
      if (mapping.value === undefined || mapping.field.type === "checkbox" ||
        (mapping.field.type === "radio" && mapping.value === undefined)) {
        result.fieldsSkipped.push(mapping.field.elementId);
        if (mapping.field.required) {
          result.reviewItems.push({
            reason: mapping.reason ?? "Boolean or option field requires explicit review",
            field: mapping.field,
          });
        }
        continue;
      }
      if (mapping.field.type === "file") continue;
      if (mapping.field.type === "radio") await locator.check();
      else if (mapping.field.type === "select-one") await locator.selectOption({ label: mapping.value });
      else await locator.fill(mapping.value);
      if ((await locator.inputValue()) !== mapping.value) {
        result.reviewItems.push({ reason: "Field value could not be verified", field: mapping.field });
      } else {
        result.fieldsFilled.push(mapping.field.elementId);
      }
    }
    const resumePath = await filePath(input.preparation.tailoredResume?.filePath);
    const coverLetterPath =
      input.preparation.coverLetter?.status === "ready_for_review"
        ? await filePath(input.preparation.coverLetter.filePath)
        : undefined;
    for (const field of fields.filter((item) => item.type === "file")) {
      const path = /cover|motivation/i.test(field.label ?? "") ? coverLetterPath : resumePath;
      if (!path) {
        if (field.required) result.reviewItems.push({ reason: "Required prepared file is unavailable", field });
        continue;
      }
      await fieldLocator(page, field).setInputFiles(path);
      result.uploads.push(field.elementId);
    }
    const submit = page.getByRole("button", { name: finalButtonPattern });
    const namedSubmitControls = await submitControlNames(page);
    if (
      (await count(submit)) ||
      namedSubmitControls.some((name) => isFinalSubmissionControl(name))
    ) {
      return {
        ...result,
        status: result.reviewItems.length ? "PAUSED_FOR_REVIEW" : "READY_FOR_SUBMISSION",
        reason: "Final submission control detected; it was not clicked",
      };
    }
    if (result.reviewItems.length) return { ...result, status: "PAUSED_FOR_REVIEW" };
    const next = page.getByRole("button", { name: navigationButtonPattern });
    if (!(await count(next))) return result;
    const beforeUrl = page.url();
    const beforeText = await getPageText(page);
    await next.click();
    try {
      if (typeof page.waitForLoadState === "function") {
        await page.waitForLoadState("domcontentloaded", { timeout: 3_000 });
      } else {
        await page.waitForTimeout(300);
      }
    } catch {
      await page.waitForTimeout(300);
    }
    const afterText = await getPageText(page);
    if (page.url() === beforeUrl && afterText === beforeText) {
      return { ...result, status: "PAUSED_FOR_REVIEW", reason: "Continue action could not be verified" };
    }
  }
  return { ...result, status: "PAUSED_FOR_REVIEW", reason: "Maximum application page limit reached." };
};
