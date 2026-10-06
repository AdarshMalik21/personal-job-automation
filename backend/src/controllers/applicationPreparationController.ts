import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationPreparationModel } from "../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../models/CandidateProfile.js";
import { JobModel } from "../models/Job.js";
import { prepareApplication } from "../modules/applications/applicationPreparation.js";
import type { CandidateProfile } from "@personal-job-automation/shared/types";

const notFound = (response: Parameters<RequestHandler>[1], message: string) => {
  response.status(404).json({ success: false, message });
};

const isEligible = (job: Record<string, any>): boolean =>
  job.status !== "closed" && job.match?.decision !== "SKIP";

const profileForPreparation = (profile: Record<string, any>): CandidateProfile => ({
  isActive: Boolean(profile.isActive),
  personal: {
    ...(profile.personal?.firstName ? { firstName: profile.personal.firstName } : {}),
    ...(profile.personal?.lastName ? { lastName: profile.personal.lastName } : {}),
    ...(profile.personal?.professionalSummary
      ? { professionalSummary: profile.personal.professionalSummary }
      : {}),
  },
  contact: {
    ...(profile.contact?.email ? { email: profile.contact.email } : {}),
    ...(profile.contact?.phone ? { phone: profile.contact.phone } : {}),
    ...(profile.contact?.website ? { website: profile.contact.website } : {}),
    ...(profile.contact?.linkedin ? { linkedin: profile.contact.linkedin } : {}),
    ...(profile.contact?.github ? { github: profile.contact.github } : {}),
  },
  ...(profile.location
    ? {
        location: {
          ...(profile.location.city ? { city: profile.location.city } : {}),
          ...(profile.location.region ? { region: profile.location.region } : {}),
          ...(profile.location.country ? { country: profile.location.country } : {}),
        },
      }
    : {}),
  ...(typeof profile.yearsOfExperience === "number"
    ? { yearsOfExperience: profile.yearsOfExperience }
    : {}),
  experience: Array.isArray(profile.experience) ? profile.experience : [],
  education: Array.isArray(profile.education) ? profile.education : [],
  skills: Array.isArray(profile.skills) ? profile.skills : [],
  technologies: Array.isArray(profile.technologies) ? profile.technologies : [],
  projects: Array.isArray(profile.projects) ? profile.projects : [],
  certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
  ...(profile.resume
    ? {
        resume: {
          ...(profile.resume.fileName ? { fileName: profile.resume.fileName } : {}),
          ...(profile.resume.storageKey
            ? { storageKey: profile.resume.storageKey }
            : {}),
          ...(profile.resume.version ? { version: profile.resume.version } : {}),
        },
      }
    : {}),
  preferredRoles: Array.isArray(profile.preferredRoles) ? profile.preferredRoles : [],
  preferredLocations: Array.isArray(profile.preferredLocations)
    ? profile.preferredLocations
    : [],
  remotePreference: profile.remotePreference ?? "any",
  verifiedInformation: profile.verifiedInformation ?? {},
  relatedTechnology: Array.isArray(profile.relatedTechnology)
    ? profile.relatedTechnology
    : [],
  unknownInformation: Array.isArray(profile.unknownInformation)
    ? profile.unknownInformation
    : [],
});

const serialize = (preparation: Record<string, any>) => ({
  ...preparation,
  id: String(preparation._id),
  jobId: String(preparation.jobId),
  candidateProfileId: String(preparation.candidateProfileId),
});

export const prepare: RequestHandler = async (request, response, next) => {
  try {
    const { jobId } = request.params;
    if (!isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const job = await JobModel.findById(jobId).lean();
    if (!job) {
      notFound(response, "Job not found");
      return;
    }
    if (!isEligible(job)) {
      response
        .status(409)
        .json({ success: false, message: "Job is not eligible for preparation" });
      return;
    }
    const candidate = await CandidateProfileModel.findOne({
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (!candidate) {
      notFound(response, "Active candidate profile not found");
      return;
    }
    const result = await prepareApplication(
      profileForPreparation(candidate),
      { ...job, id: String(job._id) } as never,
    );
    const preparation = await ApplicationPreparationModel.findOneAndUpdate(
      { jobId: job._id, candidateProfileId: candidate._id },
      {
        $set: {
          ...result,
          preparedAt: new Date(),
        },
        $setOnInsert: {
          jobId: job._id,
          candidateProfileId: candidate._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    response.json({ success: true, data: { preparation: serialize(preparation) } });
  } catch (error) {
    next(error);
  }
};

export const getPreparation: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const { jobId } = request.params;
    if (!isValidObjectId(jobId)) {
      notFound(response, "Preparation not found");
      return;
    }
    const candidate = await CandidateProfileModel.findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .lean();
    if (!candidate) {
      notFound(response, "Active candidate profile not found");
      return;
    }
    const preparation = await ApplicationPreparationModel.findOne({
      jobId,
      candidateProfileId: candidate._id,
    }).lean();
    if (!preparation) {
      notFound(response, "Preparation not found");
      return;
    }
    response.json({ success: true, data: { preparation: serialize(preparation) } });
  } catch (error) {
    next(error);
  }
};
