import type { Page } from "playwright";
import type { DetectedApplicationField } from "./browserRunTypes.js";

export const inspectApplicationFields = async (
  page: Page,
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
      const label =
        (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : undefined) ??
        html.closest("label")?.textContent ??
        undefined;
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
        required: html.required,
        options,
        visible: true,
        enabled: !html.disabled,
        ...(html instanceof HTMLInputElement && html.name ? { group: html.name } : {}),
      }];
    }),
  );

export const pageText = async (page: Page): Promise<string> =>
  (await page.locator("body").innerText()).toLowerCase();
