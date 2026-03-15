export interface LinkedInJob {
  title: string;
  company: string;
  location: string;
  postedAt: string;
  link: string;
  description: string;
  salary?: string;
  isRemote: boolean;
}

export interface LinkedInPost {
  title: string;
  author: string;
  snippet: string;
  link: string;
  date?: string;
}

export interface SearchState {
  keywords: string;
  type: "jobs" | "posts";
  date: "any" | "past-day" | "past-week" | "past-month";
  remote: "any" | "remote";
  count: number;
}

export function defaultJobsState(keywords: string): SearchState {
  return { keywords, type: "jobs", date: "any", remote: "any", count: 10 };
}

export function defaultPostsState(keywords: string): SearchState {
  return { keywords, type: "posts", date: "any", remote: "any", count: 10 };
}

export async function searchLinkedInJobs(state: SearchState): Promise<LinkedInJob[]> {
  const params = new URLSearchParams({
    engine: "google_jobs",
    q: state.keywords,
    api_key: process.env.SERPAPI_KEY!,
  });

  const chips: string[] = [];
  if (state.date !== "any") {
    const dateMap: Record<string, string> = {
      "past-day": "date_posted:today",
      "past-week": "date_posted:week",
      "past-month": "date_posted:month",
    };
    chips.push(dateMap[state.date]);
  }
  if (state.remote === "remote") chips.push("work_from_home:1");
  if (chips.length) params.set("chips", chips.join(","));

  const res = await fetch(`https://serpapi.com/search?${params}`);
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`);

  const data: any = await res.json();
  const jobs: any[] = (data.jobs_results ?? []).slice(0, state.count);

  return jobs.map((j) => ({
    title: j.title ?? "Untitled",
    company: j.company_name ?? "",
    location: j.location ?? "",
    postedAt: j.detected_extensions?.posted_at ?? "",
    link:
      j.related_links?.find((l: any) => l.link?.includes("linkedin.com"))?.link ??
      j.share_link ??
      "#",
    description: (j.description ?? "").slice(0, 300),
    salary: j.detected_extensions?.salary,
    isRemote: j.detected_extensions?.work_from_home ?? false,
  }));
}

export async function searchLinkedInPosts(state: SearchState): Promise<LinkedInPost[]> {
  const params = new URLSearchParams({
    engine: "google",
    q: `site:linkedin.com/posts ${state.keywords}`,
    api_key: process.env.SERPAPI_KEY!,
    num: String(state.count),
  });

  if (state.date !== "any") {
    const tbsMap: Record<string, string> = {
      "past-day": "qdr:d",
      "past-week": "qdr:w",
      "past-month": "qdr:m",
    };
    params.set("tbs", tbsMap[state.date]);
  }

  const res = await fetch(`https://serpapi.com/search?${params}`);
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`);

  const data: any = await res.json();
  const results: any[] = data.organic_results ?? [];

  return results.slice(0, state.count).map((r) => ({
    title: r.title ?? "",
    author: extractAuthor(r.link ?? ""),
    snippet: r.snippet ?? "",
    link: r.link ?? "#",
    date: r.date,
  }));
}

function extractAuthor(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? m[1].replace(/-/g, " ") : "LinkedIn";
}
