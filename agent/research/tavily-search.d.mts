export type TavilySearchOptions = {
  maxResults?: number;
  topic?: "general" | "news";
  timeRange?: "day" | "week" | "month" | "year";
};

export type TavilySearchResult = {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
  publishedDate: string | null;
};

export type TavilySearchResponse = {
  query: string;
  provider: "Tavily";
  searchDepth: "basic";
  searchedAt: string;
  usageCredits: number | null;
  limitations: string[];
  results: TavilySearchResult[];
};

export function searchTavily(
  query: string,
  options?: TavilySearchOptions,
): Promise<TavilySearchResponse>;
