import type { Frame, Page } from "playwright";
import type { DetectedApplicationField } from "./browserRunTypes.js";

export type ApplicationSurface = Page | Frame;

const captchaFramePattern =
  /recaptcha|hcaptcha|challenges\.cloudflare|\/captcha|captcha\./i;
const embeddedApplicationFramePattern =
  /(?:job-boards|boards)\.greenhouse\.io\/embed\/job_app|jobs\.lever\.co\/[^/?#]+\/[^/?#]+\/apply|jobs\.ashbyhq\.com\/[^/?#]+\/[^/?#]+\/application/i;

export const isCaptchaFrameUrl = (url: string): boolean => captchaFramePattern.test(url);

export const isCaptchaFrame = (frame: { url: () => string; name?: () => string }): boolean =>
  isCaptchaFrameUrl(frame.url()) ||
  /recaptcha|hcaptcha|captcha/i.test(typeof frame.name === "function" ? frame.name() : "");

export const isEmbeddedApplicationFrameUrl = (url: string): boolean =>
  embeddedApplicationFramePattern.test(url);

const controlCount = async (surface: ApplicationSurface): Promise<number> => {
  const locator = surface.locator("input, textarea, select");
  return typeof locator.count === "function" ? locator.count() : 0;
};

export const selectApplicationFrame = async (
  page: Page,
): Promise<ApplicationSurface> => {
  if (typeof page.frames !== "function") return page;
  const main = typeof page.mainFrame === "function" ? page.mainFrame() : page;
  const children = page
    .frames()
    .filter((frame) => frame !== main && !isCaptchaFrame(frame));
  const embedded = children.filter((frame) => isEmbeddedApplicationFrameUrl(frame.url()));
  if (embedded.length > 0) {
    const ranked = await Promise.all(
      embedded.map(async (frame) => ({ frame, count: await controlCount(frame) })),
    );
    ranked.sort((left, right) => right.count - left.count);
    return ranked[0]?.frame ?? embedded[0]!;
  }
  if ((await controlCount(page)) > 0) return page;
  const rankedChildren = await Promise.all(
    children.map(async (frame) => ({ frame, count: await controlCount(frame) })),
  );
  rankedChildren.sort((left, right) => right.count - left.count);
  return rankedChildren[0]?.count ? rankedChildren[0].frame : page;
};

export const hasCaptchaFrame = (page: Page): boolean =>
  typeof page.frames === "function" &&
  page.frames().some((frame) => isCaptchaFrame(frame));

export const waitForApplicationFrame = async (page: Page, timeoutMs = 10_000): Promise<void> => {
  if (typeof page.frames !== "function") return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const main = typeof page.mainFrame === "function" ? page.mainFrame() : page;
    const children = page.frames().filter((frame) => frame !== main && !isCaptchaFrame(frame));
    if (children.some((frame) => isEmbeddedApplicationFrameUrl(frame.url()))) return;
    if (children.length === 0 && (await controlCount(page)) > 0) return;
    if (typeof page.waitForTimeout === "function") await page.waitForTimeout(250);
    else await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

export const inspectApplicationFields = async (
  page: ApplicationSurface,
): Promise<DetectedApplicationField[]> =>
  page.locator("input, textarea, select").evaluateAll((elements) =>
    elements.flatMap((element, index) => {
      const html = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (
        html.type === "hidden" ||
        html.disabled ||
        html.getAttribute("aria-hidden") === "true"
      ) return [];
      const style = getComputedStyle(html);
      if (style.display === "none" || style.visibility === "hidden") return [];
      const id = html.id || undefined;
      const labelNode =
        (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null) ??
        html.closest("label");
      let label: string | undefined;
      if (labelNode) {
        const clone = labelNode.cloneNode(true) as HTMLElement;
        const hidden = clone.querySelectorAll("[aria-hidden='true']");
        for (let hiddenIndex = 0; hiddenIndex < hidden.length; hiddenIndex += 1) {
          hidden[hiddenIndex]?.remove();
        }
        label = clone.textContent ?? undefined;
      }
      const options =
        html instanceof HTMLSelectElement
          ? Array.from(html.options).map((option) => option.textContent?.trim() ?? "")
          : [];
      return [{
        elementId: `application-field-${index}`,
        type: html.type || html.tagName.toLowerCase(),
        ...(label?.trim() ? { label: label.trim() } : {}),
        ...(html.name ? { name: html.name } : {}),
        ...((html as HTMLInputElement).value ? { value: (html as HTMLInputElement).value } : {}),
        ...(id ? { id } : {}),
        ...(html.getAttribute("placeholder")
          ? { placeholder: html.getAttribute("placeholder")! }
          : {}),
        required: html.required || html.getAttribute("aria-required") === "true",
        options,
        visible: true,
        enabled: !html.disabled,
        ...(html instanceof HTMLInputElement && html.name ? { group: html.name } : {}),
      }];
    }),
  );

export const pageText = async (page: ApplicationSurface): Promise<string> =>
  (await page.locator("body").innerText()).toLowerCase();
