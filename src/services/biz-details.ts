export interface BizDetails {
  name: string;
  description?: string;
  images: string[];
  sources: { title: string; link: string; snippet: string }[];
}

export async function fetchBizDetails(name: string, address: string): Promise<BizDetails> {
  const query = `${name} ${address}`;
  const apiKey = process.env.SERPAPI_KEY!;

  const [searchData, imageData] = await Promise.all([
    fetchSearchResults(query, apiKey),
    fetchImageResults(query, apiKey),
  ]);

  const description =
    searchData.knowledge_graph?.description ??
    searchData.answer_box?.answer ??
    searchData.answer_box?.snippet ??
    searchData.organic_results?.[0]?.snippet;

  const sources: BizDetails["sources"] = (searchData.organic_results ?? [])
    .slice(0, 3)
    .map((r: any) => ({
      title: r.title ?? "",
      link: r.link ?? "#",
      snippet: (r.snippet ?? "").slice(0, 200),
    }));

  const images: string[] = (imageData.images_results ?? [])
    .slice(0, 3)
    .map((img: any) => img.thumbnail as string)
    .filter(Boolean);

  return { name, description, images, sources };
}

async function fetchSearchResults(query: string, apiKey: string): Promise<any> {
  const params = new URLSearchParams({ engine: "google", q: query, api_key: apiKey, num: "5" });
  const res = await fetch(`https://serpapi.com/search?${params}`);
  if (!res.ok) throw new Error(`SerpAPI search error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchImageResults(query: string, apiKey: string): Promise<any> {
  const params = new URLSearchParams({ engine: "google_images", q: query, api_key: apiKey, num: "3" });
  const res = await fetch(`https://serpapi.com/search?${params}`);
  if (!res.ok) throw new Error(`SerpAPI images error ${res.status}: ${await res.text()}`);
  return res.json();
}
