export type LeverJob = {
  id: string;
  text: string;
  description?: string;
  descriptionPlain?: string;
  categories?: {
    location?: string;
    commitment?: string;
  };
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  updatedAt?: number;
  workplaceType?: string;
};
