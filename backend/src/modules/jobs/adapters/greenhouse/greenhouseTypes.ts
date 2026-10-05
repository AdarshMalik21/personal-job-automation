export type GreenhouseJob = {
  id: number;
  title: string;
  location?: { name?: string };
  content?: string;
  absolute_url?: string;
  first_published?: string;
  updated_at?: string;
};

export type GreenhouseJobsResponse = {
  jobs: GreenhouseJob[];
};

export type GreenhouseBoardResponse = {
  name: string;
};