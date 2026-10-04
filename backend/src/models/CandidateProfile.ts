import { Schema, model, type InferSchemaType } from "mongoose";

const candidateProfileSchema = new Schema(
  {
    isActive: { type: Boolean, default: true, index: true },
    personal: {
      firstName: String,
      lastName: String,
      professionalSummary: String,
    },
    contact: {
      email: String,
      phone: String,
      website: String,
      linkedin: String,
      github: String,
    },
    location: { city: String, region: String, country: String },
    yearsOfExperience: Number,
    experience: { type: [Schema.Types.Mixed], default: [] },
    education: { type: [Schema.Types.Mixed], default: [] },
    skills: { type: [String], default: [] },
    technologies: { type: [String], default: [] },
    projects: { type: [Schema.Types.Mixed], default: [] },
    certifications: { type: [Schema.Types.Mixed], default: [] },
    resume: { fileName: String, storageKey: String, version: String },
    preferredRoles: { type: [String], default: [] },
    preferredLocations: { type: [String], default: [] },
    remotePreference: {
      type: String,
      enum: ["remote", "hybrid", "onsite", "any"],
      default: "any",
    },
    verifiedInformation: { type: Schema.Types.Mixed, default: {} },
    relatedTechnology: { type: [String], default: [] },
    unknownInformation: { type: [String], default: [] },
  },
  { timestamps: true, strict: true },
);

export type CandidateProfileDocument = InferSchemaType<
  typeof candidateProfileSchema
>;
export const CandidateProfileModel = model(
  "CandidateProfile",
  candidateProfileSchema,
);
