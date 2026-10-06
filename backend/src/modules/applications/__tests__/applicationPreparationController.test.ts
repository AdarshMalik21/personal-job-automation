import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";
import { ApplicationPreparationModel } from "../../../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../../../models/CandidateProfile.js";
import { JobModel } from "../../../models/Job.js";
import {
  getPreparation,
  prepare,
  updatePreparation,
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
    const originalPreparation = ApplicationPreparationModel.findOne;
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
    (ApplicationPreparationModel as any).findOne = () => chain(null);
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
      ApplicationPreparationModel.findOne = originalPreparation;
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

const candidateRecord = (candidateId: Types.ObjectId) => ({
  _id: candidateId,
  isActive: true,
  personal: { firstName: "Asha" },
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

const blockingAnswers = [
  { question: "Current location", status: "missing", source: "candidate.location" },
  { question: "Why are you interested in this role?", status: "requires_review", source: "preparation provider unavailable" },
  { question: "What makes you a good fit?", status: "requires_review", source: "preparation provider unavailable" },
  { question: "Notice period", status: "missing", source: "candidate profile does not provide this information" },
  { question: "Expected salary", status: "missing", source: "candidate profile does not provide this information" },
  { question: "Work authorization", status: "missing", source: "candidate profile does not provide this information" },
  { question: "Relocation", status: "missing", source: "candidate profile does not provide this information" },
];

describe("application preparation update", () => {
  it("rejects an unauthenticated preparation update", async () => {
    process.env.JWT_SECRET ??= "test-secret";
    process.env.ADMIN_EMAIL ??= "admin@example.com";
    process.env.ADMIN_PASSWORD ??= "password";
    const { requireAuth } = await import("../../../middleware/auth.js");
    let statusCode = 0;
    let body: unknown;
    const result = {
      status(status: number) {
        statusCode = status;
        return this;
      },
      json(value: unknown) {
        body = value;
      },
    };
    requireAuth({ headers: {} } as never, result as never, () => {
      throw new Error("next should not be called");
    });
    assert.equal(statusCode, 401);
    assert.deepEqual(body, { success: false, message: "Authentication required" });
  });

  it("stores an explicit answer as known user information", async () => {
    const originalCandidate = CandidateProfileModel.findOne;
    const originalPreparation = ApplicationPreparationModel.findOne;
    const originalUpdate = ApplicationPreparationModel.findOneAndUpdate;
    const candidateId = new Types.ObjectId();
    const preparationId = new Types.ObjectId();
    let saved: any;
    (CandidateProfileModel as any).findOne = () => chain(candidateRecord(candidateId));
    (ApplicationPreparationModel as any).findOne = (filter: Record<string, unknown>) =>
      chain(
        String(filter.jobId) === String(id) &&
          String(filter.candidateProfileId) === String(candidateId)
          ? {
              _id: preparationId,
              jobId: id,
              candidateProfileId: candidateId,
              status: "needs_information",
              coverLetter: { status: "not_required", reason: "Not required" },
              generatedAnswers: blockingAnswers,
              missingInformation: blockingAnswers.map((answer) => answer.question),
            }
          : null,
      );
    (ApplicationPreparationModel as any).findOneAndUpdate = (filter: any, update: any) => {
      saved = { _id: preparationId, jobId: id, candidateProfileId: candidateId, ...update.$set };
      assert.equal(String(filter.jobId), String(id));
      assert.equal(String(filter.candidateProfileId), String(candidateId));
      return chain(saved);
    };
    try {
      const result = response();
      await updatePreparation(
        {
          params: { jobId: String(id) },
          body: { answers: [{ question: "Notice period", answer: "15 days" }] },
        } as never,
        result as never,
        () => undefined,
      );
      assert.equal(result.statusCode, 200);
      const notice = result.body.data.preparation.generatedAnswers.find(
        (answer: { question: string }) => answer.question === "Notice period",
      );
      assert.equal(notice.status, "known");
      assert.equal(notice.answer, "15 days");
      assert.equal(notice.source, "user");
      assert.equal(result.body.data.preparation.status, "needs_information");
    } finally {
      CandidateProfileModel.findOne = originalCandidate;
      ApplicationPreparationModel.findOne = originalPreparation;
      ApplicationPreparationModel.findOneAndUpdate = originalUpdate;
    }
  });

  it("rejects an unknown question and an empty answer", async () => {
    const originalCandidate = CandidateProfileModel.findOne;
    const originalPreparation = ApplicationPreparationModel.findOne;
    const candidateId = new Types.ObjectId();
    (CandidateProfileModel as any).findOne = () => chain(candidateRecord(candidateId));
    (ApplicationPreparationModel as any).findOne = () =>
      chain({
        _id: new Types.ObjectId(),
        jobId: id,
        candidateProfileId: candidateId,
        coverLetter: { status: "not_required", reason: "Not required" },
        generatedAnswers: blockingAnswers,
      });
    try {
      const unknown = response();
      await updatePreparation(
        {
          params: { jobId: String(id) },
          body: { answers: [{ question: "Favorite color", answer: "blue" }] },
        } as never,
        unknown as never,
        () => undefined,
      );
      assert.equal(unknown.statusCode, 400);
      assert.equal(unknown.body.message, "Unknown preparation question");
      const empty = response();
      await updatePreparation(
        {
          params: { jobId: String(id) },
          body: { answers: [{ question: "Expected salary", answer: "  " }] },
        } as never,
        empty as never,
        () => undefined,
      );
      assert.equal(empty.statusCode, 400);
      assert.equal(empty.body.message, "Answer must be non-empty");
    } finally {
      CandidateProfileModel.findOne = originalCandidate;
      ApplicationPreparationModel.findOne = originalPreparation;
    }
  });

  it("rejects a missing preparation and a preparation for another job", async () => {
    const originalCandidate = CandidateProfileModel.findOne;
    const originalPreparation = ApplicationPreparationModel.findOne;
    const candidateId = new Types.ObjectId();
    const otherJobId = new Types.ObjectId();
    (CandidateProfileModel as any).findOne = () => chain(candidateRecord(candidateId));
    (ApplicationPreparationModel as any).findOne = (filter: Record<string, unknown>) =>
      chain(String(filter.jobId) === String(otherJobId) ? null : {
        _id: new Types.ObjectId(),
        jobId: id,
        candidateProfileId: candidateId,
        coverLetter: { status: "not_required", reason: "Not required" },
        generatedAnswers: blockingAnswers,
      });
    try {
      const missing = response();
      await updatePreparation(
        { params: { jobId: String(otherJobId) }, body: { answers: [] } } as never,
        missing as never,
        () => undefined,
      );
      assert.equal(missing.statusCode, 404);
      assert.equal(missing.body.message, "Preparation not found");
      const absent = response();
      await updatePreparation(
        request("not-a-job"),
        absent as never,
        () => undefined,
      );
      assert.equal(absent.statusCode, 404);
    } finally {
      CandidateProfileModel.findOne = originalCandidate;
      ApplicationPreparationModel.findOne = originalPreparation;
    }
  });

  it("keeps user answers when preparation is regenerated", async () => {
    const originalJob = JobModel.findById;
    const originalCandidate = CandidateProfileModel.findOne;
    const originalPreparation = ApplicationPreparationModel.findOne;
    const originalUpdate = ApplicationPreparationModel.findOneAndUpdate;
    const candidateId = new Types.ObjectId();
    let update: any;
    (JobModel as any).findById = () =>
      chain({
        _id: id,
        title: "Backend Engineer",
        company: "Acme",
        description: "Build APIs with Node.js.",
        requiredSkills: ["Node.js"],
        preferredSkills: [],
        relatedSkills: [],
        source: "company",
        status: "discovered",
        canonicalIdentity: {
          key: "acme",
          crossSourceKey: "acme",
          confidence: "strong",
          components: { normalizedCompany: "acme", normalizedTitle: "backend engineer" },
        },
        match: {},
      });
    (CandidateProfileModel as any).findOne = () => chain(candidateRecord(candidateId));
    (ApplicationPreparationModel as any).findOne = () =>
      chain({
        generatedAnswers: [
          { question: "Expected salary", status: "known", answer: "8-10LPA", source: "user" },
          { question: "Notice period", status: "known", answer: "15 days", source: "user" },
        ],
      });
    (ApplicationPreparationModel as any).findOneAndUpdate = (_filter: unknown, next: any) => {
      update = next;
      return chain({ _id: new Types.ObjectId(), jobId: id, candidateProfileId: candidateId, ...next.$set });
    };
    try {
      const result = response();
      await prepare(request(), result as never, () => undefined);
      const answers = update.$set.generatedAnswers as Array<{ question: string; status: string; answer?: string; source?: string }>;
      const salary = answers.find((answer) => answer.question === "Expected salary");
      const notice = answers.find((answer) => answer.question === "Notice period");
      const narrative = answers.find((answer) => answer.question === "Why are you interested in this role?");
      assert.equal(salary?.status, "known");
      assert.equal(salary?.answer, "8-10LPA");
      assert.equal(salary?.source, "user");
      assert.equal(notice?.source, "user");
      assert.equal(narrative?.status, "requires_review");
      assert.equal(result.statusCode, 200);
    } finally {
      JobModel.findById = originalJob;
      CandidateProfileModel.findOne = originalCandidate;
      ApplicationPreparationModel.findOne = originalPreparation;
      ApplicationPreparationModel.findOneAndUpdate = originalUpdate;
    }
  });
});
