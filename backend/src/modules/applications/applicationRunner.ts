import { access } from "node:fs/promises";
import { isIP } from "node:net";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import { mapApplicationField } from "./applicationFormMapper.js";
import {
  hasCaptchaFrame,
  inspectApplicationFields,
  pageText,
  selectApplicationFrame,
  waitForApplicationFrame,
  type ApplicationSurface,
} from "./applicationPageInspector.js";
import type { BrowserRunResult, DetectedApplicationField, ReviewedApplicationField } from "./browserRunTypes.js";
import type { PreparationResult } from "./types.js";

export type BrowserFactory = () => Promise<Browser>;
export type BrowserRunHooks = {
  onBrowserCreated?: (browser: Browser, context: BrowserContext) => void;
  onHeld?: (session: { browser: Browser; context: BrowserContext; page: Page }) => void;
  isStopped?: () => boolean;
  holdForReview?: boolean;
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
export const pageSecurityStatus = (text: string): BrowserRunResult["status"] | undefined => {
  if (/\bcaptcha\b|cloudflare|security challenge/.test(text)) return "CAPTCHA_REQUIRED";
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

const fieldLocator = (page: ApplicationSurface, field: DetectedApplicationField) => {
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

const submitControlNames = async (page: ApplicationSurface): Promise<string[]> => {
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
  let releaseBrowser = true;
  try {
    browser = await browserFactory();
    context = await browser.newContext();
    hooks.onBrowserCreated?.(browser, context);
    const page = await context.newPage();
    await page.goto(input.job.officialApplicationUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page
      .waitForSelector("input, textarea, select", { state: "attached", timeout: 10_000 })
      .catch(() => undefined);
    await waitForApplicationFrame(page);
    const result = await fillObservedPage(page, input);
    if (
      hooks.holdForReview &&
      !hooks.isStopped?.() &&
      retainsBrowserForReview(result.status) &&
      browser &&
      context
    ) {
      releaseBrowser = false;
      hooks.onHeld?.({ browser, context, page });
    }
    return result;
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
    if (releaseBrowser) {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }
};

export const retainsBrowserForReview = (status: BrowserRunResult["status"]): boolean =>
  status === "PAUSED_FOR_REVIEW" || status === "READY_FOR_SUBMISSION";

export const writeApplicationField = async (
  surface: ApplicationSurface,
  field: DetectedApplicationField,
  value: string,
): Promise<boolean> => {
  const locator = fieldLocator(surface, field);
  if (field.type === "radio") {
    await locator.check();
    return typeof locator.isChecked === "function" ? locator.isChecked() : true;
  }
  if (field.type === "checkbox" || field.type === "file") return false;
  if (field.type === "select-one") await locator.selectOption({ label: value });
  else await locator.fill(value);
  return (await locator.inputValue()) === value;
};

export const findFinalControl = async (surface: ApplicationSurface): Promise<string | undefined> => {
  const named = (await submitControlNames(surface)).map((name) => name.trim()).find((name) => isFinalSubmissionControl(name));
  if (named) return named;
  const submit = surface.getByRole("button", { name: finalButtonPattern });
  return (await count(submit)) ? "Submit" : undefined;
};

export const clickFinalControl = async (surface: ApplicationSurface, name: string): Promise<boolean> => {
  if (!isFinalSubmissionControl(name)) return false;
  const pattern = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  const button = surface.getByRole("button", { name: pattern });
  if (!(await count(button))) return false;
  await button.click();
  return true;
};

export const fillObservedPage = async (
  page: Page,
  input: BrowserRunnerInput,
  dependencies: {
    inspectFields?: (page: ApplicationSurface) => Promise<DetectedApplicationField[]>;
    getPageText?: (page: ApplicationSurface) => Promise<string>;
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
    fields: [],
    pagesProcessed: 0,
  };
  for (let pageNumber = 0; pageNumber < MAX_APPLICATION_PAGES; pageNumber += 1) {
    result.pagesProcessed = pageNumber + 1;
    result.url = page.url();
    const surface = await selectApplicationFrame(page);
    const main = typeof page.mainFrame === "function" ? page.mainFrame() : page;
    const usingFrame = surface !== page && surface !== main;
    if (usingFrame) {
      result.applicationFrameDetected = true;
      result.frameUrl = surface.url();
    }
    const pageStatus = pageSecurityStatus(await getPageText(surface));
    if (pageStatus) return { ...result, status: pageStatus };
    const fields = await inspectFields(surface);
    if (fields.length === 0 && !usingFrame && hasCaptchaFrame(page)) {
      return {
        ...result,
        status: "CAPTCHA_REQUIRED",
        reason: "Security challenge frame detected; it was not interacted with",
      };
    }
    result.fieldsDetected += fields.length;
    const mappings = fields.map((field) =>
      mapApplicationField(field, input.candidate, input.preparation.generatedAnswers),
    );
    const recordField = (
      mapping: (typeof mappings)[number],
      reviewStatus: ReviewedApplicationField["reviewStatus"],
      currentValue?: string,
    ) => {
      result.fields?.push({
        ...mapping.field,
        ...(currentValue ? { currentValue } : {}),
        source: mapping.source,
        reviewStatus,
      });
    };
    for (const mapping of mappings) {
      const locator = fieldLocator(surface, mapping.field);
      if (mapping.value === undefined || mapping.field.type === "checkbox" ||
        (mapping.field.type === "radio" && mapping.value === undefined)) {
        if (mapping.field.type === "file") continue;
        result.fieldsSkipped.push(mapping.field.elementId);
        recordField(
          mapping,
          mapping.reason === "Sensitive field requires explicit user-approved information"
            ? "requires_review"
            : mapping.field.required ? "missing" : "unknown",
        );
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
        recordField(mapping, "requires_review", mapping.value);
      } else {
        result.fieldsFilled.push(mapping.field.elementId);
        recordField(mapping, "filled", mapping.value);
      }
    }
    const resumePath = await filePath(input.preparation.tailoredResume?.filePath);
    const coverLetterPath =
      input.preparation.coverLetter?.status === "ready_for_review"
        ? await filePath(input.preparation.coverLetter.filePath)
        : undefined;
    for (const field of fields.filter((item) => item.type === "file")) {
      const path = /cover|motivation/i.test(field.label ?? "") ? coverLetterPath : resumePath;
      const mapping = mappings.find((item) => item.field.elementId === field.elementId);
      if (!path) {
        result.fields?.push({
          ...field,
          source: "browser-detected",
          reviewStatus: field.required ? "missing" : "unknown",
        });
        if (field.required) result.reviewItems.push({ reason: "Required prepared file is unavailable", field });
        continue;
      }
      await fieldLocator(surface, field).setInputFiles(path);
      result.uploads.push(field.elementId);
      result.fields?.push({
        ...field,
        currentValue: path,
        source: mapping?.source ?? "browser-detected",
        reviewStatus: "filled",
      });
    }
    const namedSubmitControls = await submitControlNames(surface);
    const submit = surface.getByRole("button", { name: finalButtonPattern });
    const finalControl = namedSubmitControls.find((name) => isFinalSubmissionControl(name))?.trim()
      || ((await count(submit)) ? "Submit" : undefined);
    if (finalControl) {
      result.finalControl = finalControl;
      return {
        ...result,
        status: result.reviewItems.length ? "PAUSED_FOR_REVIEW" : "READY_FOR_SUBMISSION",
        reason: "Final submission control detected; it was not clicked",
      };
    }
    if (result.reviewItems.length) return { ...result, status: "PAUSED_FOR_REVIEW" };
    const next = surface.getByRole("button", { name: navigationButtonPattern });
    if (!(await count(next))) return result;
    const beforeUrl = page.url();
    const beforeFrameUrl = surface.url();
    const beforeText = await getPageText(surface);
    await next.click();
    try {
      if (typeof surface.waitForLoadState === "function") {
        await surface.waitForLoadState("domcontentloaded", { timeout: 3_000 });
      } else if (typeof surface.waitForTimeout === "function") {
        await surface.waitForTimeout(300);
      }
    } catch {
      if (typeof surface.waitForTimeout === "function") await surface.waitForTimeout(300);
    }
    const afterSurface = await selectApplicationFrame(page);
    const afterText = await getPageText(afterSurface);
    if (page.url() === beforeUrl && afterSurface.url() === beforeFrameUrl && afterText === beforeText) {
      return { ...result, status: "PAUSED_FOR_REVIEW", reason: "Continue action could not be verified" };
    }
  }
  return { ...result, status: "PAUSED_FOR_REVIEW", reason: "Maximum application page limit reached." };
};
