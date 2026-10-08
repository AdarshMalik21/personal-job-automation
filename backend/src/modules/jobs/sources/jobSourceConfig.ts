import { AshbyAdapter } from "../adapters/ashby/AshbyAdapter.js";
import {
  CompanyCareerPageAdapter,
  type CompanyCareerPageParser,
} from "../adapters/company/CompanyCareerPageAdapter.js";
import { GreenhouseAdapter } from "../adapters/greenhouse/GreenhouseAdapter.js";
import type { FetchLike, JobSourceAdapter } from "../adapters/JobSourceAdapter.js";
import { LeverAdapter } from "../adapters/lever/LeverAdapter.js";
import { NaukriAdapter } from "../adapters/naukri/NaukriAdapter.js";
import { readNaukriConfig } from "../adapters/naukri/naukriConfig.js";

export type GreenhouseSourceConfig = {
  id: string;
  enabled: boolean;
  type: "greenhouse";
  boardToken: string;
  companyName?: string;
};

export type LeverSourceConfig = {
  id: string;
  enabled: boolean;
  type: "lever";
  site: string;
  companyName: string;
};

export type AshbySourceConfig = {
  id: string;
  enabled: boolean;
  type: "ashby";
  boardName: string;
  companyName: string;
};

export type NaukriSourceConfig = {
  id: string;
  enabled: boolean;
  type: "naukri";
};

export type CompanyCareerSourceConfig = {
  id: string;
  enabled: boolean;
  type: "company";
  companyName: string;
  endpoint: string;
  parser: CompanyCareerPageParser;
};

export type JobSourceConfig =
  | GreenhouseSourceConfig
  | LeverSourceConfig
  | AshbySourceConfig
  | CompanyCareerSourceConfig
  | NaukriSourceConfig;

/**
 * Public job-board identifiers only. Add another entry to extend discovery.
 * Company career pages need a parser for that company's known JSON shape.
 */
export const configuredJobSources: readonly JobSourceConfig[] = [
  {
    id: "groww",
    enabled: true,
    type: "greenhouse",
    companyName: "Groww",
    boardToken: "groww",
  },
  {
    id: "razorpay",
    enabled: true,
    type: "greenhouse",
    companyName: "Razorpay",
    boardToken: "razorpaysoftwareprivatelimited",
  },
  {
    id: "cred",
    enabled: true,
    type: "lever",
    companyName: "CRED",
    site: "cred",
  },
  {
    id: "linear",
    enabled: true,
    type: "ashby",
    companyName: "Linear",
    boardName: "linear",
  },
  {
    id: "naukri",
    enabled: true,
    type: "naukri",
  },
];

const requireText = (value: string | undefined, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Job source configuration is invalid: ${label} is required`);
  }
  return value.trim();
};

export const assertJobSourceConfig = (source: JobSourceConfig): void => {
  requireText(source.id, "id");
  if (typeof source.enabled !== "boolean") {
    throw new Error(`Job source configuration is invalid: enabled must be boolean for ${source.id}`);
  }
  switch (source.type) {
    case "greenhouse":
      requireText(source.boardToken, `boardToken for ${source.id}`);
      return;
    case "lever":
      requireText(source.site, `site for ${source.id}`);
      requireText(source.companyName, `companyName for ${source.id}`);
      return;
    case "ashby":
      requireText(source.boardName, `boardName for ${source.id}`);
      requireText(source.companyName, `companyName for ${source.id}`);
      return;
    case "company":
      requireText(source.companyName, `companyName for ${source.id}`);
      requireText(source.endpoint, `endpoint for ${source.id}`);
      if (typeof source.parser !== "function") {
        throw new Error(`Job source configuration is invalid: parser for ${source.id} is required`);
      }
      return;
    case "naukri":
      return;
    default: {
      const unknownType = (source as { type?: string }).type ?? "unknown";
      throw new Error(`Job source configuration is invalid: unsupported type ${unknownType}`);
    }
  }
};

const createAdapter = (source: JobSourceConfig, fetcher: FetchLike | undefined): JobSourceAdapter => {
  switch (source.type) {
    case "greenhouse":
      return new GreenhouseAdapter({
        boardToken: source.boardToken.trim(),
        ...(source.companyName?.trim() ? { companyName: source.companyName.trim() } : {}),
        ...(fetcher ? { fetcher } : {}),
      });
    case "lever":
      return new LeverAdapter({
        site: source.site.trim(),
        companyName: source.companyName.trim(),
        ...(fetcher ? { fetcher } : {}),
      });
    case "ashby":
      return new AshbyAdapter({
        boardName: source.boardName.trim(),
        companyName: source.companyName.trim(),
        ...(fetcher ? { fetcher } : {}),
      });
    case "company":
      return new CompanyCareerPageAdapter({
        companyName: source.companyName.trim(),
        endpoint: source.endpoint.trim(),
        parser: source.parser,
        ...(fetcher ? { fetcher } : {}),
      });
    case "naukri":
      return new NaukriAdapter({
        config: readNaukriConfig(),
        ...(fetcher ? { fetcher } : {}),
      });
    default:
      throw new Error("Job source configuration is invalid: unsupported type");
  }
};

export const createJobSourceAdapters = (
  sources: readonly JobSourceConfig[] = configuredJobSources,
  options: { fetcher?: FetchLike } = {},
): JobSourceAdapter[] => {
  const seen = new Set<string>();
  const adapters: JobSourceAdapter[] = [];
  for (const source of sources) {
    assertJobSourceConfig(source);
    const id = source.id.trim();
    if (seen.has(id)) {
      throw new Error(`Job source configuration is invalid: duplicate id ${id}`);
    }
    seen.add(id);
    if (!source.enabled) continue;
    if (source.type === "naukri" && !readNaukriConfig().enabled) continue;
    adapters.push(createAdapter(source, options.fetcher));
  }
  return adapters;
};
