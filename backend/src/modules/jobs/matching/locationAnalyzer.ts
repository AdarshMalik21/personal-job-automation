import type {
  CandidateProfile,
  Job,
} from "@personal-job-automation/shared/types";
import type { LocationAnalysis } from "./types.js";

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/gurugram/g, "gurgaon")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const locationMatches = (
  jobLocation: string,
  preferredLocation: string,
): boolean => {
  const job = normalize(jobLocation);
  const preferred = normalize(preferredLocation);
  return job.includes(preferred) || preferred.includes(job);
};

export const analyzeLocation = (
  candidate: CandidateProfile,
  job: Job,
): LocationAnalysis => {
  const location = job.location ?? job.normalizedLocation;
  const preferred = candidate.preferredLocations ?? [];
  if (
    !location &&
    job.remoteStatus !== "remote" &&
    job.remoteStatus !== "hybrid"
  ) {
    return { status: "unknown", reason: "Job location is not available" };
  }
  if (job.remoteStatus === "remote") {
    const remoteText = normalize(location ?? "");
    const foreignOnly =
      /\b(us|usa|united states|uk|united kingdom|eu|europe|canada|australia)\b/.test(
        remoteText,
      );
    const candidateSupportsRemote =
      candidate.remotePreference === "remote" ||
      candidate.remotePreference === "any";
    if (
      foreignOnly &&
      !preferred.some((item) => /us|uk|eu|canada|australia/i.test(item))
    ) {
      return {
        status: "incompatible",
        reason:
          "Remote role is restricted to a geography outside the candidate profile",
      };
    }
    if (
      candidateSupportsRemote &&
      (!location || /india|india eligible|remote india/i.test(remoteText))
    ) {
      return {
        status: "compatible",
        reason:
          "Remote role is compatible with the candidate's remote preference",
      };
    }
    return {
      status: "unknown",
      reason: "Remote geography or candidate remote eligibility is unclear",
    };
  }
  if (!location)
    return { status: "unknown", reason: "Job location is not available" };
  if (preferred.some((item) => locationMatches(location, item))) {
    return {
      status: "compatible",
      reason: "Job location matches a candidate preferred location",
    };
  }
  if (job.remoteStatus === "hybrid" && preferred.length === 0) {
    return {
      status: "unknown",
      reason:
        "Hybrid location cannot be compared without candidate preferences",
    };
  }
  return {
    status: "incompatible",
    reason:
      "Onsite or hybrid location is outside candidate preferred locations",
  };
};
