import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AshbyAdapter } from "../adapters/ashby/AshbyAdapter.js";
import { CompanyCareerPageAdapter } from "../adapters/company/CompanyCareerPageAdapter.js";
import { GreenhouseAdapter } from "../adapters/greenhouse/GreenhouseAdapter.js";
import type { FetchLike } from "../adapters/JobSourceAdapter.js";
import { LeverAdapter } from "../adapters/lever/LeverAdapter.js";
import {
  configuredJobSources,
  createJobSourceAdapters,
  type JobSourceConfig,
} from "../sources/jobSourceConfig.js";

const response = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe("job source configuration", () => {
  it("loads enabled sources and skips disabled sources", () => {
    const adapters = createJobSourceAdapters([
      { id: "off", enabled: false, type: "greenhouse", boardToken: "groww", companyName: "Groww" },
      { id: "on", enabled: true, type: "lever", site: "cred", companyName: "CRED" },
    ]);
    assert.equal(adapters.length, 1);
    assert.equal(adapters[0]?.source, "lever");
    assert.ok(adapters[0] instanceof LeverAdapter);
  });

  it("rejects invalid source configuration", () => {
    assert.throws(
      () => createJobSourceAdapters([{ id: "blank", enabled: true, type: "greenhouse", boardToken: " " }]),
      /boardToken/,
    );
    assert.throws(
      () => createJobSourceAdapters([{ id: "lever", enabled: true, type: "lever", site: "cred", companyName: "" }]),
      /companyName/,
    );
    assert.throws(
      () => createJobSourceAdapters([{ id: "ashby", enabled: true, type: "ashby", boardName: "", companyName: "Linear" }]),
      /boardName/,
    );
    assert.throws(
      () => createJobSourceAdapters([{ id: "dup", enabled: true, type: "ashby", boardName: "linear", companyName: "Linear" }, { id: "dup", enabled: false, type: "lever", site: "cred", companyName: "CRED" }]),
      /duplicate id/,
    );
    assert.throws(
      () => createJobSourceAdapters([{ id: "other", enabled: true, type: "linkedin" } as unknown as JobSourceConfig]),
      /unsupported type/,
    );
  });

  it("selects the adapter that matches each source type", async () => {
    const seen: string[] = [];
    const fetcher: FetchLike = async (url) => {
      seen.push(url);
      if (url.includes("greenhouse.io")) return response({ jobs: [] });
      if (url.includes("lever.co")) return response([]);
      if (url.includes("ashbyhq.com")) return response({ jobs: [] });
      return response({ positions: [] });
    };
    const adapters = createJobSourceAdapters([
      { id: "greenhouse", enabled: true, type: "greenhouse", boardToken: "groww", companyName: "Groww" },
      { id: "lever", enabled: true, type: "lever", site: "cred", companyName: "CRED" },
      { id: "ashby", enabled: true, type: "ashby", boardName: "linear", companyName: "Linear" },
      {
        id: "company",
        enabled: true,
        type: "company",
        companyName: "Acme",
        endpoint: "https://acme.test/careers.json",
        parser: () => [],
      },
    ], { fetcher });
    assert.ok(adapters[0] instanceof GreenhouseAdapter);
    assert.ok(adapters[1] instanceof LeverAdapter);
    assert.ok(adapters[2] instanceof AshbyAdapter);
    assert.ok(adapters[3] instanceof CompanyCareerPageAdapter);
    await Promise.all(adapters.map((adapter) => adapter.fetchJobs()));
    assert.equal(seen.some((url) => url.includes("/boards/groww/jobs")), true);
    assert.equal(seen.some((url) => url.includes("/cred?mode=json")), true);
    assert.equal(seen.some((url) => url.includes("/linear")), true);
    assert.equal(seen.some((url) => url === "https://acme.test/careers.json"), true);
  });

  it("builds the initial production sources from Greenhouse, Lever, and Ashby", () => {
    const adapters = createJobSourceAdapters();
    assert.deepEqual(configuredJobSources.map((source) => source.enabled), [true, true, true, true, true]);
    assert.equal(adapters.length, 5);
    assert.deepEqual(adapters.map((adapter) => adapter.source), ["greenhouse", "greenhouse", "lever", "ashby", "naukri"]);
  });
});
