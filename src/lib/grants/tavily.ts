export type LiveCandidate = {
  title: string;
  url: string;
  snippet: string;
};

export type LiveContext = {
  candidates: LiveCandidate[];
  queriesRun: number;
  errors: string[];
};

// Env-configured fetch URLs (TAVILY_API_URL, AI_GATEWAY_URL) must not become
// an SSRF vector: only these hosts may be fetched, overridable via
// FETCH_HOST_ALLOWLIST (comma-separated) without a redeploy.
function allowedFetchHosts(): string[] {
  const raw =
    process.env.FETCH_HOST_ALLOWLIST || "api.tavily.com,ai.tcetcercd.in";
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^www\./, ""))
    .filter((h) => h.length > 0);
}

export function assertAllowedFetchUrl(url: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label}: misconfigured URL ${url}`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (parsed.protocol !== "https:") {
    throw new Error(`${label}: refusing non-https fetch ${url}`);
  }
  if (!allowedFetchHosts().some((d) => host === d || host.endsWith("." + d))) {
    throw new Error(`${label}: host not in FETCH_HOST_ALLOWLIST: ${host}`);
  }
  return url;
}

// Open-internet discovery queries — deliberately NOT domain-restricted.
// The URL trust check in automation.ts (trusted registry only) is what
// keeps aggregators and unknown domains out of the published grants.
function buildQueries(month: string): string[] {
  return [
    `India government research grants fellowships applications open ${month}`,
    `India engineering student scholarships applications open ${month} DST AICTE UGC SERB`,
    `India startup innovation grant funding apply ${month} DPIIT MeitY`,
  ];
}

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
};

async function runQuery(
  apiUrl: string,
  apiKey: string,
  query: string
): Promise<LiveCandidate[]> {
  const res = await fetch(assertAllowedFetchUrl(apiUrl, "Tavily"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic", // 1 credit/query — explicit so auto-params can't upgrade it to advanced (2)
      max_results: 10,
      include_answer: false,
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `Tavily API error ${res.status}: ${
        raw.trim().startsWith("<")
          ? "unexpected HTML response"
          : raw.slice(0, 300)
      }`
    );
  }
  let data: { results?: TavilyResult[] };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Tavily API error ${res.status}: response was not JSON`
    );
  }
  const results: TavilyResult[] = Array.isArray(data.results) ? data.results : [];
  const out: LiveCandidate[] = [];
  for (const r of results) {
    if (!r.url || !r.title) continue;
    if (!r.url.startsWith("https://")) continue;
    out.push({
      title: r.title.slice(0, 200),
      url: r.url.split("#")[0],
      snippet: (r.content || "").slice(0, 300),
    });
  }
  return out;
}

export async function fetchLiveGrantContext(month: string): Promise<LiveContext> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("NOT_CONFIGURED: TAVILY_API_KEY not configured");
  const apiUrl = process.env.TAVILY_API_URL;
  if (!apiUrl) throw new Error("NOT_CONFIGURED: TAVILY_API_URL not configured");

  const candidates: LiveCandidate[] = [];
  const errors: string[] = [];
  let queriesRun = 0;

  for (const query of buildQueries(month)) {
    try {
      const found = await runQuery(apiUrl, apiKey, query);
      queriesRun++;
      for (const c of found) {
        if (candidates.length >= 30) break;
        if (!candidates.some((e) => e.url.toLowerCase() === c.url.toLowerCase())) {
          candidates.push(c);
        }
      }
    } catch (err) {
      errors.push(`Tavily: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { candidates, queriesRun, errors };
}
