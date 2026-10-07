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
  async sendDailyJobReport(report: DailyJobReport): Promise<void> {
    console.info(`Daily job report date=${report.dateKey} timezone=${report.timezone} jobs=${report.jobs.length}`);
    for (const job of report.jobs) {
      console.info(
        `Daily job report rank=${job.rank} title=${job.title} company=${job.company} location=${job.location ?? ""} remote=${job.remoteStatus ?? ""} score=${job.matchScore} decision=${job.decision} freshness=${job.freshness} status=${job.applicationStatus} prepared=${job.preparationAvailable} url=${job.officialApplicationUrl ?? ""}`,
      );
    }
  }
}
