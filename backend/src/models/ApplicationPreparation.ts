import { Schema, model, type InferSchemaType } from "mongoose";

const applicationPreparationSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    candidateProfileId: {
      type: Schema.Types.ObjectId,
      ref: "CandidateProfile",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "not_started",
        "preparing",
        "ready_for_review",
        "needs_information",
        "failed",
      ],
      default: "not_started",
    },
    tailoredResume: { type: Schema.Types.Mixed, default: {} },
    coverLetter: { type: Schema.Types.Mixed, default: {} },
    generatedAnswers: { type: [Schema.Types.Mixed], default: [] },
    missingInformation: { type: [String], default: [] },
    generationMetadata: { type: Schema.Types.Mixed, default: {} },
    preparedAt: Date,
  },
  { timestamps: true, strict: true },
);

applicationPreparationSchema.index(
  { jobId: 1, candidateProfileId: 1 },
  { unique: true },
);

export type ApplicationPreparationDocument = InferSchemaType<
  typeof applicationPreparationSchema
>;
export const ApplicationPreparationModel = model(
  "ApplicationPreparation",
  applicationPreparationSchema,
);
