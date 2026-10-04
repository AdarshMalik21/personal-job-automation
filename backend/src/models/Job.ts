import { Schema, model, type InferSchemaType } from "mongoose";

const jobSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    description: String,
    location: String,
    remoteStatus: { type: String, enum: ["remote", "hybrid", "onsite", "any"] },
    experienceRequirement: String,
    requiredSkills: { type: [String], default: [] },
    preferredSkills: { type: [String], default: [] },
    relatedSkills: { type: [String], default: [] },
    source: { type: String, required: true },
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
