const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN!;
const GITHUB_PAGES_REPO = () => process.env.GITHUB_PAGES_REPO!; // e.g. "youruser/landing-pages"
const GITHUB_PAGES_BRANCH = () => process.env.GITHUB_PAGES_BRANCH ?? "main";

const API = "https://api.github.com";

function githubHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN()}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "enpitech-automations",
  };
}

/** Push an HTML file to the GitHub Pages repo and return its public URL. */
export async function publishToGitHubPages(html: string, slug: string): Promise<string> {
  if (!GITHUB_TOKEN()) throw new Error("GITHUB_TOKEN is not set");
  if (!GITHUB_PAGES_REPO()) throw new Error("GITHUB_PAGES_REPO is not set");

  const repo = GITHUB_PAGES_REPO();
  const branch = GITHUB_PAGES_BRANCH();
  const filename = `${slug}-${Date.now()}.html`;
  const apiPath = `${API}/repos/${repo}/contents/${filename}`;

  // Check if the file already exists so we can pass its SHA (required for updates)
  let sha: string | undefined;
  const checkRes = await fetch(apiPath, { headers: githubHeaders() });
  if (checkRes.ok) {
    const existing: any = await checkRes.json();
    sha = existing.sha;
  }

  const body: Record<string, string> = {
    message: `Add landing page: ${slug}`,
    content: Buffer.from(html).toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(apiPath, {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err: any = await putRes.json();
    throw new Error(`GitHub API error ${putRes.status}: ${err.message ?? JSON.stringify(err)}`);
  }

  // Derive GitHub Pages URL: https://<owner>.github.io/<repo>/<file>
  const [owner, repoName] = repo.split("/");
  return `https://${owner}.github.io/${repoName}/${filename}`;
}
