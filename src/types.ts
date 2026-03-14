export interface LeadFormSubmission {
  name: string;
  company: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  companySize?: string;
  source?: string;
  interest?: string;
  submittedAt: string;
}
