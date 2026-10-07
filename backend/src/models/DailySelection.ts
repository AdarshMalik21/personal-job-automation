import { Schema, model, type InferSchemaType } from "mongoose";

const dailySelectionSchema = new Schema(
  {
    dateKey: { type: String, required: true, unique: true },
    timezone: { type: String, required: true, default: "Asia/Kolkata" },
    jobs: { type: [Schema.Types.Mixed], default: [] },
    notificationStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    notificationError: String,
  },
  { timestamps: true, strict: true },
);

export type DailySelectionDocument = InferSchemaType<typeof dailySelectionSchema>;
export const DailySelectionModel = model("DailySelection", dailySelectionSchema);
