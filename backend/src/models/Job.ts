import { Schema, model, type InferSchemaType } from "mongoose";
import { SUPPORTED_JOB_SOURCES } from "../modules/jobs/types/jobSource.js";

const jobSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    normalizedCompany: { type: String, required: true, trim: true },
    description: String,
    location: String,
    normalizedLocation: String,
    remoteStatus: { type: String, enum: ["remote", "hybrid", "onsite", "any", "unknown"] },
    employmentType: String,
    experienceRequirement: String,
    requiredSkills: { type: [String], default: [] },
    preferredSkills: { type: [String], default: [] },
    relatedSkills: { type: [String], default: [] },
    source: { type: String, required: true, enum: SUPPORTED_JOB_SOURCES },
    sourceUrl: String,
    officialApplicationUrl: String,
    externalJobId: String,
    postedDate: Date,
    discoveredDate: { type: Date, default: Date.now },
    lastVerifiedDate: Date,
    status: {
      type: String,
      enum: ["discovered", "verified", "archived", "closed"],
      default: "discovered",
    },
    canonicalIdentity: { type: Schema.Types.Mixed, required: true },
    deduplication: { type: Schema.Types.Mixed, default: {} },
    match: { type: Schema.Types.Mixed, default: {} },
    analysis: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, strict: true },
);

jobSchema.index(
  { source: 1, externalJobId: 1 },
  { unique: true, sparse: true },
);
export type JobDocument = InferSchemaType<typeof jobSchema>;
export const JobModel = model("Job", jobSchema);
