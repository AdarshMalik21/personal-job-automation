import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";
import { ApplicationPreparationModel } from "../../../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../../../models/CandidateProfile.js";
import { JobModel } from "../../../models/Job.js";
import {
  getPreparation,
  prepare,
} from "../../../controllers/applicationPreparationController.js";

const id = new Types.ObjectId();
const request = (jobId = String(id)) => ({ params: { jobId } }) as never;
const response = () => {
  let statusCode = 200;
  let body: any;
  return {
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    status(status: number) {
      statusCode = status;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };
};
const chain = <T>(value: T) => ({
  lean: async () => value,
  sort: () => ({ lean: async () => value }),
});

describe("application preparation controller", () => {
  it("returns 404 for an unknown job", async () => {
    const original = JobModel.findById;
    (JobModel as any).findById = () => chain(null);
    try {
      const result = response();
      await prepare(request(), result as never, () => undefined);
      assert.equal(result.statusCode, 404);
      assert.equal(result.body.message, "Job not found");
    } finally {
      JobModel.findById = original;
    }
  });

  it("returns 404 when no active candidate profile exists", async () => {
    const originalJob = JobModel.findById;
    const originalCandidate = CandidateProfileModel.findOne;
    (JobModel as any).findById = () =>
      chain({ _id: id, status: "discovered", match: {} });
    (CandidateProfileModel as any).findOne = () => chain(null);
    try {
      const result = response();
      await prepare(request(), result as never, () => undefined);
      assert.equal(result.statusCode, 404);
      assert.equal(result.body.message, "Active candidate profile not found");
    } finally {
      JobModel.findById = originalJob;
      CandidateProfileModel.findOne = originalCandidate;
    }
  });

  it("persists and returns a repeatable preparation record", async () => {
    const originalJob = JobModel.findById;
    const originalCandidate = CandidateProfileModel.findOne;
    const originalUpdate = ApplicationPreparationModel.findOneAndUpdate;
    const candidateId = new Types.ObjectId();
    const saved = {
      _id: new Types.ObjectId(),
      jobId: id,
      candidateProfileId: candidateId,
      status: "needs_information",
      tailoredResume: { skills: ["Node.js"] },
      coverLetter: { status: "not_required" },
      generatedAnswers: [],
      missingInformation: ["Expected salary"],
    };
    (JobModel as any).findById = () =>
      chain({
        _id: id,
        title: "Backend Engineer",
        company: "Acme",
        description: "Build APIs.",
        requiredSkills: ["Node.js"],
        preferredSkills: [],
        relatedSkills: [],
        source: "company",
        status: "discovered",
        match: {},
      });
    (CandidateProfileModel as any).findOne = () =>
      chain({
        _id: candidateId,
        isActive: true,
        personal: {},
        contact: {},
        experience: [],
        education: [],
        skills: ["Node.js"],
        technologies: [],
        projects: [],
        certifications: [],
        preferredRoles: [],
        preferredLocations: [],
        remotePreference: "any",
        verifiedInformation: {},
        relatedTechnology: [],
        unknownInformation: [],
      });
    (ApplicationPreparationModel as any).findOneAndUpdate = () => chain(saved);
    try {
      const result = response();
      await prepare(request(), result as never, () => undefined);
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.data.preparation.id, String(saved._id));
      assert.equal(
        result.body.data.preparation.candidateProfileId,
        String(candidateId),
      );
    } finally {
      JobModel.findById = originalJob;
      CandidateProfileModel.findOne = originalCandidate;
      ApplicationPreparationModel.findOneAndUpdate = originalUpdate;
    }
  });

  it("returns a persisted preparation by job ID", async () => {
    const originalCandidate = CandidateProfileModel.findOne;
    const originalPreparation = ApplicationPreparationModel.findOne;
    const candidateId = new Types.ObjectId();
    const saved = { _id: new Types.ObjectId(), jobId: id, candidateProfileId: candidateId };
    (CandidateProfileModel as any).findOne = () => chain({ _id: candidateId });
    (ApplicationPreparationModel as any).findOne = () => chain(saved);
    try {
      const result = response();
      await getPreparation(request(), result as never, () => undefined);
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.data.preparation.jobId, String(id));
    } finally {
      CandidateProfileModel.findOne = originalCandidate;
      ApplicationPreparationModel.findOne = originalPreparation;
    }
  });
});
