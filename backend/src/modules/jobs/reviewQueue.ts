export type ReviewAttentionJob = {
  decision?: string;
  reviewStatus?: string | null;
};

export const needsReviewAttention = (job: ReviewAttentionJob): boolean =>
  job.decision === "REVIEW" && job.reviewStatus !== "reviewed" && job.reviewStatus !== "skipped";

export const activeReviewQueueFilter = () => ({
  "match.decision": "REVIEW",
  reviewStatus: { $nin: ["reviewed", "skipped"] },
});
