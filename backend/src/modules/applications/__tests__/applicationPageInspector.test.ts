import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import {
  inspectApplicationFields,
  isCaptchaFrame,
  isEmbeddedApplicationFrameUrl,
  selectApplicationFrame,
} from "../applicationPageInspector.js";

const frame = (url: string, controls: number, name = "") => ({
  url: () => url,
  name: () => name,
  locator: () => ({ count: async () => controls }),
});

const host = (topControls: number, children: ReturnType<typeof frame>[]) => {
  const page = {
    url: () => "https://www.mongodb.com/careers/jobs/7993984",
    locator: () => ({ count: async () => topControls }),
    mainFrame: () => page,
    frames: () => [page, ...children],
  };
  return page;
};

describe("application frame selection", () => {
  it("recognizes embedded greenhouse, lever, and ashby application frames", () => {
    assert.equal(
      isEmbeddedApplicationFrameUrl("https://job-boards.greenhouse.io/embed/job_app?token=7993984"),
      true,
    );
    assert.equal(
      isEmbeddedApplicationFrameUrl("https://boards.greenhouse.io/embed/job_app?token=1"),
      true,
    );
    assert.equal(
      isEmbeddedApplicationFrameUrl("https://jobs.lever.co/example/123/apply"),
      true,
    );
    assert.equal(
      isEmbeddedApplicationFrameUrl("https://jobs.ashbyhq.com/example/123/application"),
      true,
    );
    assert.equal(isEmbeddedApplicationFrameUrl("https://www.mongodb.com/careers/jobs/7993984"), false);
  });

  it("keeps a top-level form when no application frame is present", async () => {
    const page = host(2, [frame("https://cdn.example.test/widget", 0)]);
    const selected = await selectApplicationFrame(page as never);
    assert.equal(selected, page);
  });

  it("selects a greenhouse embed over the marketing page, captcha, and unrelated frames", async () => {
    const application = frame(
      "https://job-boards.greenhouse.io/embed/job_app?for=mongodb&token=7993984",
      2,
    );
    const page = host(1, [
      frame("https://www.recaptcha.net/recaptcha/enterprise/anchor", 4, "a-recaptcha"),
      frame("https://cdn.example.test/analytics", 9),
      application,
    ]);
    const selected = await selectApplicationFrame(page as never);
    assert.equal(selected, application);
    assert.equal(isCaptchaFrame(page.frames()[1] as never), true);
  });

  it("uses the only child form when the top document has no controls", async () => {
    const application = frame("about:srcdoc", 3, "application");
    const page = host(0, [frame("https://cdn.example.test/empty", 0), application]);
    const selected = await selectApplicationFrame(page as never);
    assert.equal(selected, application);
  });
});

const applicationDocument = `<!doctype html>
<html><body>
  <iframe name="analytics" src="https://cdn.example.test/widget"></iframe>
  <iframe name="a-recaptcha" src="https://www.recaptcha.net/recaptcha/enterprise/anchor"></iframe>
  <iframe id="application" src="https://job-boards.greenhouse.io/embed/job_app?token=7993984"></iframe>
</body></html>`;

const applicationFrameHtml = `<!doctype html>
<html><body>
  <form>
    <label for="first_name">First Name<span aria-hidden="true">*</span></label>
    <input id="first_name" name="first_name" aria-required="true">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" placeholder="name@example.com" required>
    <input type="hidden" name="token" value="secret">
    <input name="disabled_field" disabled>
    <button type="submit">Submit Application</button>
  </form>
</body></html>`;

const openEmbeddedPage = async (): Promise<{ browser: Awaited<ReturnType<typeof chromium.launch>>; page: Page } | undefined> => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    return undefined;
  }
  const page = await browser.newPage();
  await page.route("https://job-boards.greenhouse.io/**", (route) =>
    route.fulfill({ contentType: "text/html", body: applicationFrameHtml }),
  );
  await page.route("https://www.recaptcha.net/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body><input name='g-recaptcha-response'></body></html>",
    }),
  );
  await page.route("https://cdn.example.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body><input name='unrelated'></body></html>",
    }),
  );
  await page.setContent(applicationDocument);
  await page.waitForSelector("iframe#application");
  await page.frameLocator("#application").locator("#first_name").waitFor();
  return { browser, page };
};

describe("embedded application inspection", () => {
  it("detects application fields inside the greenhouse frame only", async (t) => {
    const opened = await openEmbeddedPage();
    if (!opened) {
      t.skip("Chromium is not installed");
      return;
    }
    const { browser, page } = opened;
    try {
      const surface = await selectApplicationFrame(page);
      assert.match(surface.url(), /job-boards\.greenhouse\.io\/embed\/job_app/);
      const fields = await inspectApplicationFields(surface);
      assert.deepEqual(
        fields.map((field) => field.label),
        ["First Name", "Email"],
      );
      assert.equal(fields[0]?.required, true);
      const email = fields.find((field) => field.label === "Email");
      assert.equal(email?.type, "email");
      assert.equal(email?.name, "email");
      assert.equal(email?.placeholder, "name@example.com");
      assert.equal(email?.required, true);
      assert.equal(email?.visible, true);
      assert.equal(email?.enabled, true);
      assert.equal(fields.some((field) => field.name === "token"), false);
      assert.equal(fields.some((field) => field.name === "disabled_field"), false);
      assert.equal(fields.some((field) => field.name === "unrelated"), false);
      assert.equal(fields.some((field) => field.name === "g-recaptcha-response"), false);
    } finally {
      await browser.close();
    }
  });
});
