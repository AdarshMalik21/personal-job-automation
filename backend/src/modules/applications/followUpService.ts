import { ApplicationModel } from "../../models/Application.js";
import { planFollowUps, type TrackedApplication } from "./applicationTracking.js";

export const evaluateFollowUps = async (now = new Date()) => {
  const applications = await ApplicationModel.find({ status: "submitted" }).lean();
  const plans = planFollowUps(applications as TrackedApplication[], now);
  await Promise.all(plans.map((plan) => ApplicationModel.updateOne(
    { _id: plan.id },
    {
      $set: {
        status: "follow_up_required",
        followUpDate: plan.eligibleAt,
        followUpStatus: "required",
        followUp: {
          eligible: true,
          eligibleAt: plan.eligibleAt,
          status: "required",
          reason: plan.event.note,
        },
      },
      $push: { history: plan.event },
    },
  )));
  return { updated: plans.length };
};
