export type ApiResponse<T> = {
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
};
export type RemotePreference = "remote" | "hybrid" | "onsite" | "any";
export type CandidateProfile = {
    id?: string;
    isActive: boolean;
    personal: {
        firstName?: string;
        lastName?: string;
        professionalSummary?: string;
    };
    contact: {
        email?: string;
        phone?: string;
        website?: string;
        linkedin?: string;
        github?: string;
    };
    location?: {
        city?: string;
        region?: string;
        country?: string;
    };
    yearsOfExperience?: number;
    experience: Array<Record<string, unknown>>;
    education: Array<Record<string, unknown>>;
    skills: string[];
    technologies: string[];
    projects: Array<Record<string, unknown>>;
    certifications: Array<Record<string, unknown>>;
    resume?: {
        fileName?: string;
        storageKey?: string;
        version?: string;
    };
    preferredRoles: string[];
    preferredLocations: string[];
    remotePreference: RemotePreference;
    verifiedInformation: Record<string, unknown>;
    relatedTechnology: string[];
    unknownInformation: string[];
};
export type JobStatus = "discovered" | "verified" | "archived" | "closed";
export type Job = {
    id?: string;
    title: string;
    company: string;
    description?: string;
    location?: string;
    remoteStatus?: RemotePreference;
    experienceRequirement?: string;
    requiredSkills: string[];
    preferredSkills: string[];
    relatedSkills: string[];
    source: string;
    sourceUrl?: string;
    officialApplicationUrl?: string;
    externalJobId?: string;
    postedDate?: string;
    discoveredDate?: string;
    lastVerifiedDate?: string;
    status: JobStatus;
    deduplication?: Record<string, unknown>;
    match?: {
        score?: number;
        reasoning?: string;
        qualificationStatus?: string;
    };
    analysis?: Record<string, unknown>;
    applicationStatus?: string;
};
export type ApplicationStatus = "prepared" | "ready_for_review" | "submitted" | "failed" | "rejected" | "interview" | "offer" | "withdrawn" | "follow_up_required";
export type Application = {
    id?: string;
    jobId: string;
    candidateProfileId: string;
    status: ApplicationStatus;
    applicationUrl?: string;
    appliedDate?: string;
    resumeUsed?: Record<string, unknown>;
    coverLetter?: string;
    generatedAnswers: Array<Record<string, unknown>>;
    formFields: Record<string, unknown>;
    submission?: Record<string, unknown>;
    failure?: Record<string, unknown>;
    followUpDate?: string;
    followUpStatus?: string;
    lastStatusCheck?: string;
};
export type AuthSession = {
    token: string;
    user: {
        email: string;
        role: "admin";
    };
};
//# sourceMappingURL=index.d.ts.map