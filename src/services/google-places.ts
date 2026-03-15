export interface LocalBusiness {
  name: string;
  address: string;
  phone?: string;
  types: string[];
  rating?: number;
  totalRatings?: number;
  placeId: string;
  mapsUrl: string;
}

const PLACES_API_KEY = () => process.env.GOOGLE_PLACES_API_KEY;

async function textSearch(city: string, country: string, pageToken?: string): Promise<{ placeIds: string[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    query: `businesses in ${city}, ${country}`,
    key: PLACES_API_KEY()!,
  });
  if (pageToken) params.set("pagetoken", pageToken);

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
  if (!res.ok) throw new Error(`Places Text Search HTTP error ${res.status}`);

  const data: any = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Places Text Search error: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`);
  }

  return {
    placeIds: (data.results ?? []).map((r: any) => r.place_id as string),
    nextPageToken: data.next_page_token,
  };
}

async function getPlaceDetails(placeId: string): Promise<any> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "name,formatted_address,formatted_phone_number,website,types,rating,user_ratings_total,url",
    key: PLACES_API_KEY()!,
  });

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  if (!res.ok) throw new Error(`Place Details HTTP error ${res.status}`);

  const data: any = await res.json();
  if (data.status !== "OK") {
    throw new Error(`Place Details error: ${data.status}`);
  }
  return data.result;
}

/** Returns businesses in the given city/country that have no website in their Google Business profile. */
export async function findBusinessesWithoutWebsite(city: string, country: string, maxResults = 20): Promise<LocalBusiness[]> {
  if (!PLACES_API_KEY()) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  // Collect place IDs (up to 2 pages = ~40 candidates)
  const placeIds: string[] = [];
  let nextPageToken: string | undefined;
  let pages = 0;

  do {
    // Google requires a short delay before using a next_page_token
    if (nextPageToken) await new Promise((r) => setTimeout(r, 2000));
    const result = await textSearch(city, country, nextPageToken);
    placeIds.push(...result.placeIds);
    nextPageToken = result.nextPageToken;
    pages++;
  } while (nextPageToken && pages < 2);

  const businesses: LocalBusiness[] = [];

  for (const placeId of placeIds) {
    if (businesses.length >= maxResults) break;
    try {
      const details = await getPlaceDetails(placeId);
      if (!details.website) {
        businesses.push({
          name: details.name,
          address: details.formatted_address ?? "",
          phone: details.formatted_phone_number,
          types: (details.types ?? []).filter((t: string) => t !== "point_of_interest" && t !== "establishment"),
          rating: details.rating,
          totalRatings: details.user_ratings_total,
          placeId,
          mapsUrl: details.url ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        });
      }
    } catch (err) {
      console.error(`[google-places] Failed to get details for ${placeId}:`, err);
    }
  }

  return businesses;
}
