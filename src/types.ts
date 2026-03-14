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

export interface VideoMetadata {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  videoUrl: string;
  duration: string;
  viewCount: number;
  likeCount: number;
  subscriberCount: number;
}

export interface State {
  lastChecked: string;
  seenIds: string[];
}
