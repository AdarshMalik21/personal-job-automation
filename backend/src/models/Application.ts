import { Schema, model, type InferSchemaType } from "mongoose";

const applicationSchema = new Schema(
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
        "prepared",
        "ready_for_review",
        "submitting",
        "submitted",
        "submission_failed",
        "submission_unknown",
        "cancelled",
        "failed",
        "rejected",
        "interview",
        "offer",
        "withdrawn",
        "follow_up_required",
      ],
      default: "prepared",
    },
    applicationUrl: String,
    appliedDate: Date,
    resumeUsed: { type: Schema.Types.Mixed, default: {} },
    coverLetter: String,
    generatedAnswers: { type: [Schema.Types.Mixed], default: [] },
    formFields: { type: Schema.Types.Mixed, default: {} },
    submission: { type: Schema.Types.Mixed, default: {} },
    failure: { type: Schema.Types.Mixed, default: {} },
    followUpDate: Date,
    followUpStatus: String,
    lastStatusCheck: Date,
  },
  { timestamps: true, strict: true },
);

applicationSchema.index({ jobId: 1, candidateProfileId: 1 }, { unique: true });
export type ApplicationDocument = InferSchemaType<typeof applicationSchema>;
export const ApplicationModel = model("Application", applicationSchema);
