import { NaukriClient } from "../src/modules/jobs/adapters/naukri/NaukriClient.js";
import { resolveApplicationDestination } from "../src/modules/jobs/adapters/naukri/applicationUrl.js";
import { mapNaukriJob } from "../src/modules/jobs/adapters/naukri/NaukriMapper.js";

const client = new NaukriClient();
const queries = [
  { keyword: "MERN Developer", location: "Delhi NCR" },
  { keyword: "Full Stack Developer", location: "Delhi NCR" },
  { keyword: "React Node Developer", location: "Noida" },
];

const summarize = (jobs: Awaited<ReturnType<NaukriClient["search"]>>) =>
  jobs.slice(0, 3).map((job) => ({
    jobId: String(job.jobId ?? ""),
    title: job.title ?? "",
    company: job.companyName ?? "",
    location: job.placeholders?.find((item) => item.type === "location")?.label ?? "",
    experience: job.experienceText ?? "",
    posted: String(job.createdDate ?? ""),
    url: job.jdURL ?? "",
    companyApplyJob: job.companyApplyJob === true,
  }));

let firstPage: Awaited<ReturnType<NaukriClient["search"]>> = [];
for (const query of queries) {
  const page = await client.search({
    ...query,
    pageNo: 1,
    pageSize: 20,
    experienceYears: 1,
    jobAgeDays: 15,
    timeoutMs: 15_000,
    maxRetries: 1,
  });
  if (firstPage.length === 0) firstPage = page;
  console.info(JSON.stringify({ ...query, page: 1, jobs: page.length, sample: summarize(page) }));
}

const second = await client.search({
  keyword: "MERN Developer",
  location: "Delhi NCR",
  pageNo: 2,
  pageSize: 20,
  experienceYears: 1,
  jobAgeDays: 15,
  timeoutMs: 15_000,
  maxRetries: 1,
});
const firstIds = new Set(firstPage.map((job) => String(job.jobId)));
console.info(JSON.stringify({
  pagination: "MERN Developer",
  page: 2,
  jobs: second.length,
  newJobs: second.filter((job) => !firstIds.has(String(job.jobId))).length,
}));

const sample = [...firstPage, ...second].filter((job) => mapNaukriJob(job)?.sourceUrl).slice(0, 6);
const resolutions = [];
for (const job of sample) {
  const mapped = mapNaukriJob(job);
  if (!mapped?.sourceUrl) continue;
  const resolved = await resolveApplicationDestination(mapped.sourceUrl, { fetcher: fetch, timeoutMs: 12_000 });
  resolutions.push({
    jobId: mapped.externalJobId,
    company: mapped.company,
    naukriUrl: mapped.sourceUrl,
    finalUrl: resolved.finalUrl ?? mapped.sourceUrl,
    applicationUrlType: resolved.type,
  });
}
console.info(JSON.stringify({ resolutions }, null, 2));
