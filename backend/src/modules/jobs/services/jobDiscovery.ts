import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import { CandidateProfileModel } from "../../../models/CandidateProfile.js";
import type { JobSourceAdapter } from "../adapters/JobSourceAdapter.js";
import { matchCandidateToJob } from "../matching/candidateMatcher.js";
import { JobSourceOrchestrator } from "./jobIngestionOrchestrator.js";
import { persistJobs, type JobRepository } from "./jobPersistence.js";

export type DiscoveryDependencies = {
  adapters?: JobSourceAdapter[];
  repository?: JobRepository;
  candidate?: CandidateProfile | null;
  loadCandidate?: () => Promise<CandidateProfile | null>;
  validateApplicationUrls?: boolean;
};

export const loadActiveCandidate = async (): Promise<CandidateProfile | null> => {
  const profile = await CandidateProfileModel.findOne({ isActive: true }).lean();
  if (!profile) return null;
  const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value : undefined;
  const sourcePersonal = profile.personal ?? {};
  const sourceContact = profile.contact ?? {};
  const personal: CandidateProfile["personal"] = {};
  const contact: CandidateProfile["contact"] = {};
  const firstName = text(sourcePersonal.firstName);
  const lastName = text(sourcePersonal.lastName);
  const professionalSummary = text(sourcePersonal.professionalSummary);
  if (firstName) personal.firstName = firstName;
  if (lastName) personal.lastName = lastName;
  if (professionalSummary) personal.professionalSummary = professionalSummary;
  const email = text(sourceContact.email);
  const phone = text(sourceContact.phone);
  const website = text(sourceContact.website);
  const linkedin = text(sourceContact.linkedin);
  const github = text(sourceContact.github);
  if (email) contact.email = email;
  if (phone) contact.phone = phone;
  if (website) contact.website = website;
  if (linkedin) contact.linkedin = linkedin;
  if (github) contact.github = github;
  return {
    isActive: Boolean(profile.isActive),
    personal,
    contact,
    ...(typeof profile.yearsOfExperience === "number" ? { yearsOfExperience: profile.yearsOfExperience } : {}),
    experience: Array.isArray(profile.experience) ? profile.experience : [],
    education: Array.isArray(profile.education) ? profile.education : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    technologies: Array.isArray(profile.technologies) ? profile.technologies : [],
    projects: Array.isArray(profile.projects) ? profile.projects : [],
    certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
    preferredRoles: Array.isArray(profile.preferredRoles) ? profile.preferredRoles : [],
    preferredLocations: Array.isArray(profile.preferredLocations) ? profile.preferredLocations : [],
    remotePreference: profile.remotePreference ?? "any",
    verifiedInformation: profile.verifiedInformation ?? {},
    relatedTechnology: Array.isArray(profile.relatedTechnology) ? profile.relatedTechnology : [],
    unknownInformation: Array.isArray(profile.unknownInformation) ? profile.unknownInformation : [],
  };
};

export const runJobDiscovery = async (dependencies: DiscoveryDependencies = {}) => {
  const adapters = dependencies.adapters ?? [];
  const result = await new JobSourceOrchestrator(adapters).ingest({
    validateApplicationUrls: dependencies.validateApplicationUrls ?? false,
  });
  if (adapters.length > 0 && result.sources.length > 0 && result.sources.every((source) => source.status === "failed")) {
    throw new Error("Job discovery failed for every configured source");
  }
  const candidate = dependencies.candidate !== undefined
    ? dependencies.candidate
    : await (dependencies.loadCandidate ?? loadActiveCandidate)();
  const jobs: Job[] = result.jobs.map((item) => {
    const match = candidate ? matchCandidateToJob(candidate, item.job) : undefined;
    return {
      ...item.job,
      match: {
        ...(match
          ? {
              score: match.matchScore,
              matchScore: match.matchScore,
              decision: match.decision,
              confidence: match.confidence,
              reasons: match.reasons,
              hardFilterFailures: match.hardFilterFailures,
              scoreBreakdown: match.scoreBreakdown,
              roleAnalysis: match.roleAnalysis,
              experienceAnalysis: match.experienceAnalysis,
              locationAnalysis: match.locationAnalysis,
              skillAnalysis: match.skillAnalysis,
            }
          : {}),
        openStatus: item.openStatus,
      },
    };
  });
  await persistJobs(jobs, dependencies.repository);
  return {
    persisted: jobs.length,
    sources: result.sources,
    stats: result.stats,
  };
};
