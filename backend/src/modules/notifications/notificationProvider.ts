export type DailyReportJob = {
  rank: number;
  jobId: string;
  title: string;
  company: string;
  location?: string;
  remoteStatus?: string;
  matchScore: number;
  decision: "APPLY" | "REVIEW";
  reasons: string[];
  missingRequirements: string[];
  freshness: "fresh" | "stale" | "unknown";
  officialApplicationUrl?: string;
  applicationStatus: string;
  preparationAvailable: boolean;
  rankingReason: string;
};

export type DailyJobReport = {
  dateKey: string;
  timezone: "Asia/Kolkata";
  jobs: DailyReportJob[];
};

export interface NotificationProvider {
  sendDailyJobReport(report: DailyJobReport): Promise<void>;
}

export class LoggingNotificationProvider implements NotificationProvider {
  constructor(private readonly dashboardUrl = "") {}

  async sendDailyJobReport(report: DailyJobReport): Promise<void> {
    const dashboard = this.dashboardUrl ? ` dashboard=${this.dashboardUrl.replace(/\/$/, "")}/dashboard` : "";
    console.info(`Daily job report date=${report.dateKey} timezone=${report.timezone} jobs=${report.jobs.length}${dashboard}`);
    for (const job of report.jobs) {
      const review = this.dashboardUrl ? ` review=${this.dashboardUrl.replace(/\/$/, "")}/jobs/${job.jobId}/review` : "";
      console.info(
        `Daily job report rank=${job.rank} title=${job.title} company=${job.company} location=${job.location ?? ""} remote=${job.remoteStatus ?? ""} score=${job.matchScore} decision=${job.decision} freshness=${job.freshness} status=${job.applicationStatus} prepared=${job.preparationAvailable} url=${job.officialApplicationUrl ?? ""}${review}`,
      );
    }
  }
}

export class UnavailableNotificationProvider implements NotificationProvider {
  constructor(private readonly reason: string) {}

  async sendDailyJobReport(): Promise<void> {
    throw new Error(this.reason);
  }
}

export const createNotificationProvider = (
  source: Record<string, string | undefined> = process.env,
): NotificationProvider => {
  const mode = source.NOTIFICATION_PROVIDER?.trim().toLowerCase() || "log";
  const dashboardUrl = source.FRONTEND_URL?.trim() ?? "";
  if (mode === "log") return new LoggingNotificationProvider(dashboardUrl);
  if (mode === "smtp") {
    return new UnavailableNotificationProvider(
      "Email notification is not configured. The report was not sent.",
    );
  }
  return new UnavailableNotificationProvider(`Unknown notification provider: ${mode}`);
};
