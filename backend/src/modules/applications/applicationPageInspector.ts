import type { Page } from "playwright";
import type { DetectedApplicationField } from "./browserRunTypes.js";

export const inspectApplicationFields = async (
  page: Page,
): Promise<DetectedApplicationField[]> =>
  page.locator("input, textarea, select").evaluateAll((elements) =>
    elements.map((element, index) => {
      const html = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const id = html.id || undefined;
      const label =
        (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : undefined) ??
        html.closest("label")?.textContent ??
        undefined;
      const options =
        html instanceof HTMLSelectElement
          ? Array.from(html.options).map((option) => option.textContent?.trim() ?? "")
          : [];
      return {
        elementId: `application-field-${index}`,
        type: html.type || html.tagName.toLowerCase(),
        ...(label?.trim() ? { label: label.trim() } : {}),
        ...(html.name ? { name: html.name } : {}),
        ...(id ? { id } : {}),
        ...(html.getAttribute("placeholder")
          ? { placeholder: html.getAttribute("placeholder")! }
          : {}),
        required: html.required,
        options,
      };
    }),
  );

export const pageText = async (page: Page): Promise<string> =>
  (await page.locator("body").innerText()).toLowerCase();
