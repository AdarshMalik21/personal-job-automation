import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchLike } from "../adapters/JobSourceAdapter.js";
import { CompanyCareerPageAdapter } from "../adapters/company/CompanyCareerPageAdapter.js";

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

describe("CompanyCareerPageAdapter", () => {
  it("uses an isolated company parser and preserves official URLs", async () => {
    const fetcher: FetchLike = async () =>
      response({ positions: [{ id: "company-1", title: "Engineer", apply: "https://acme.test/apply/1" }] });
    const adapter = new CompanyCareerPageAdapter({
      companyName: "Acme",
      endpoint: "https://acme.test/careers.json",
      fetcher,
      parser: (value, config) => {
        if (!value || typeof value !== "object" || !("positions" in value))
          throw new Error("company response is malformed");
        const positions = value.positions;
        if (!Array.isArray(positions)) throw new Error("company response is malformed");
        return positions.flatMap((position) => {
          if (!position || typeof position !== "object") return [];
          const record = position as Record<string, unknown>;
          if (typeof record.id !== "string" || typeof record.title !== "string") return [];
          return [{
            source: "company",
            externalJobId: record.id,
            title: record.title,
            company: config.companyName,
            ...(typeof record.apply === "string"
              ? { officialApplicationUrl: record.apply }
              : {}),
          }];
        });
      },
    });
    const [job] = await adapter.fetchJobs();
    assert.equal(job?.externalJobId, "company-1");
    assert.equal(job?.officialApplicationUrl, "https://acme.test/apply/1");
    assert.equal(job?.analysis?.applicationUrlType, "COMPANY_CAREER_PAGE");
    assert.equal(job?.company, "Acme");
  });

  it("returns clear failures for malformed data and HTTP errors", async () => {
    const adapter = (fetcher: FetchLike) =>
      new CompanyCareerPageAdapter({
        companyName: "Acme",
        endpoint: "https://acme.test/careers.json",
        fetcher,
        parser: () => { throw new Error("company response is malformed"); },
      });
    await assert.rejects(() => adapter(async () => response({})).fetchJobs(), /company response is malformed/);
    await assert.rejects(() => adapter(async () => response({}, false, 404)).fetchJobs(), /HTTP 404/);
  });

  it("reports fetch timeouts", async () => {
    await assert.rejects(
      () =>
        new CompanyCareerPageAdapter({
          companyName: "Acme",
          endpoint: "https://acme.test/careers.json",
          fetcher: (_url, init) =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
            ),
          parser: () => [],
        }).fetchJobs({ timeoutMs: 1 }),
      /timed out after 1ms/,
    );
  });
});
