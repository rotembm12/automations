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
  subscriberCount: number;
}

export interface State {
  lastChecked: string;
  seenIds: string[];
}
