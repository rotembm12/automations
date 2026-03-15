import { WebClient } from "@slack/web-api";
import { LinkedInJob, LinkedInPost, SearchState } from "./linkedin";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export const LINKEDIN_CHANNEL = process.env.SLACK_LINKEDIN_CHANNEL ?? "#linkedin-search";

const DATE_OPTIONS = [
  { text: { type: "plain_text" as const, text: "Any time" }, value: "any" },
  { text: { type: "plain_text" as const, text: "Past 24h" }, value: "past-day" },
  { text: { type: "plain_text" as const, text: "Past week" }, value: "past-week" },
  { text: { type: "plain_text" as const, text: "Past month" }, value: "past-month" },
];

const REMOTE_OPTIONS = [
  { text: { type: "plain_text" as const, text: "Any work type" }, value: "any" },
  { text: { type: "plain_text" as const, text: "Remote only" }, value: "remote" },
];

const COUNT_OPTIONS = [
  { text: { type: "plain_text" as const, text: "5 results" }, value: "5" },
  { text: { type: "plain_text" as const, text: "10 results" }, value: "10" },
  { text: { type: "plain_text" as const, text: "20 results" }, value: "20" },
];

function selectWithInitial(
  actionId: string,
  options: { text: { type: "plain_text"; text: string }; value: string }[],
  placeholder: string,
  currentValue: string
) {
  const initial = currentValue !== "any" && currentValue !== "10"
    ? options.find((o) => o.value === currentValue)
    : undefined;
  return {
    type: "static_select" as const,
    action_id: actionId,
    placeholder: { type: "plain_text" as const, text: placeholder },
    options,
    ...(initial ? { initial_option: initial } : {}),
  };
}

export function buildJobsFilterBlocks(state: SearchState): any[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔍 *LinkedIn Jobs: "${state.keywords}"*\nChoose your filters and click Search:`,
      },
    },
    {
      type: "actions",
      block_id: "li_jobs_filters",
      elements: [
        selectWithInitial("li_date", DATE_OPTIONS, "Any time", state.date),
        selectWithInitial("li_remote", REMOTE_OPTIONS, "Any work type", state.remote),
        selectWithInitial("li_count", COUNT_OPTIONS, "10 results", String(state.count)),
        {
          type: "button",
          action_id: "li_search",
          text: { type: "plain_text", text: "Search" },
          style: "primary",
          value: JSON.stringify(state),
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "💡 Tip: include location in your keywords (e.g. `linkedin jobs developer Tel Aviv`)",
        },
      ],
    },
  ];
}

export function buildPostsFilterBlocks(state: SearchState): any[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔍 *LinkedIn Posts: "${state.keywords}"*\nChoose your filters and click Search:`,
      },
    },
    {
      type: "actions",
      block_id: "li_posts_filters",
      elements: [
        selectWithInitial("li_date", DATE_OPTIONS, "Any time", state.date),
        selectWithInitial("li_count", COUNT_OPTIONS, "10 results", String(state.count)),
        {
          type: "button",
          action_id: "li_search",
          text: { type: "plain_text", text: "Search" },
          style: "primary",
          value: JSON.stringify(state),
        },
      ],
    },
  ];
}

export async function postFilterForm(channel: string, state: SearchState): Promise<string | undefined> {
  const blocks = state.type === "jobs"
    ? buildJobsFilterBlocks(state)
    : buildPostsFilterBlocks(state);

  const result = await slack.chat.postMessage({
    channel,
    text: `LinkedIn ${state.type} search: ${state.keywords}`,
    blocks,
  });
  return result.ts as string | undefined;
}

export async function updateFilterForm(channel: string, ts: string, state: SearchState): Promise<void> {
  const blocks = state.type === "jobs"
    ? buildJobsFilterBlocks(state)
    : buildPostsFilterBlocks(state);

  await slack.chat.update({
    channel,
    ts,
    text: `LinkedIn ${state.type} search: ${state.keywords}`,
    blocks,
  });
}

export async function postJobResults(
  channel: string,
  threadTs: string,
  jobs: LinkedInJob[],
  keywords: string
): Promise<void> {
  if (jobs.length === 0) {
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `No LinkedIn jobs found for *${keywords}*.`,
    });
    return;
  }

  const headerBlock = {
    type: "section",
    text: { type: "mrkdwn", text: `*Found ${jobs.length} job(s) for "${keywords}":*` },
  };

  const jobBlocks = jobs.flatMap((job) => {
    const meta = [
      job.company,
      job.location,
      job.isRemote ? "Remote" : null,
      job.postedAt,
      job.salary,
    ]
      .filter(Boolean)
      .join("  •  ");

    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${job.link}|${job.title}>*\n${meta}${job.description ? `\n_${job.description.slice(0, 200)}_` : ""}`,
        },
      },
      { type: "divider" },
    ];
  });

  // Slack limit: 50 blocks per message. Chunk if needed.
  const allBlocks = [headerBlock, { type: "divider" }, ...jobBlocks];
  for (let i = 0; i < allBlocks.length; i += 50) {
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `LinkedIn jobs: ${keywords}`,
      blocks: allBlocks.slice(i, i + 50),
    });
  }
}

export async function postPostResults(
  channel: string,
  threadTs: string,
  posts: LinkedInPost[],
  keywords: string
): Promise<void> {
  if (posts.length === 0) {
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `No LinkedIn posts found for *${keywords}*.`,
    });
    return;
  }

  const headerBlock = {
    type: "section",
    text: { type: "mrkdwn", text: `*Found ${posts.length} post(s) for "${keywords}":*` },
  };

  const postBlocks = posts.flatMap((post) => {
    const meta = [post.author, post.date].filter(Boolean).join("  •  ");
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${post.link}|${post.title || "LinkedIn Post"}>*\n${meta ? meta + "\n" : ""}_${post.snippet}_`,
        },
      },
      { type: "divider" },
    ];
  });

  const allBlocks = [headerBlock, { type: "divider" }, ...postBlocks];
  for (let i = 0; i < allBlocks.length; i += 50) {
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `LinkedIn posts: ${keywords}`,
      blocks: allBlocks.slice(i, i + 50),
    });
  }
}
