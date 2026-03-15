import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import { readState, writeState } from "../state";
import { fetchNewClaudeCodeVideos, fetchCreatorVideos } from "../services/youtube";
import { generateHebrewBlogPost } from "../services/blog";
import { postVideoAlert } from "../services/slack-videos";
import {
  LINKEDIN_CHANNEL,
  buildJobsFilterBlocks,
  buildPostsFilterBlocks,
  postFilterForm,
  updateFilterForm,
  postJobResults,
  postPostResults,
} from "../services/slack-linkedin";
import {
  SearchState,
  defaultJobsState,
  defaultPostsState,
  searchLinkedInJobs,
  searchLinkedInPosts,
} from "../services/linkedin";
import { findBusinessesWithoutWebsite } from "../services/google-places";
import { LOCAL_BIZ_CHANNEL, postLocalBizResults } from "../services/slack-local-biz";

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TRIGGER_PHRASE = "go fetch videos";
const CREATOR_FETCH_REGEX = /^go fetch (\S+) (.+) videos$/;
const LINKEDIN_JOBS_REGEX = /^linkedin jobs (.+)$/;
const LINKEDIN_POSTS_REGEX = /^linkedin posts (.+)$/;
const LOCAL_BIZ_REGEX = /^local biz (.+),\s*(.+)$/;
const AI_VIDEOS_CHANNEL = process.env.SLACK_AI_VIDEOS_CHANNEL ?? "#ai-videos";

// In-memory filter state for pending LinkedIn searches.
// Key: "channelId:messageTs", Value: current filter selections.
const linkedInFilterStates = new Map<string, SearchState>();

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

async function check(replyChannel?: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Checking for new Claude Code videos...`);

  const state = readState();
  const seenIds = new Set(state.seenIds);

  let newVideos: Awaited<ReturnType<typeof fetchNewClaudeCodeVideos>>;
  try {
    newVideos = await fetchNewClaudeCodeVideos(state.lastChecked, seenIds);
  } catch (err) {
    console.error("Failed to fetch from YouTube:", err);
    return;
  }

  if (newVideos.length === 0) {
    console.log("No new videos.");
    writeState({ ...state, lastChecked: new Date().toISOString() });
    if (replyChannel) {
      await slack.chat.postMessage({
        channel: replyChannel,
        text: "No new Claude Code videos found since the last check.",
      });
    }
    return;
  }

  console.log(`Found ${newVideos.length} new video(s). Posting to Slack...`);

  for (const video of newVideos) {
    try {
      await postVideoAlert(video);
      seenIds.add(video.id);
      console.log(`  Posted: "${video.title}" by ${video.channelTitle}`);
    } catch (err) {
      console.error(`  Failed to post ${video.id}:`, err);
    }
  }

  writeState({ lastChecked: new Date().toISOString(), seenIds: [...seenIds] });
}

async function handleCreatorFetch(channel: string, creator: string, query: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Creator fetch: creator="${creator}" query="${query}"`);
  await slack.chat.postMessage({
    channel,
    text: `On it! Searching for *${query}* videos by *${creator}*...`,
  });

  let videos: Awaited<ReturnType<typeof fetchCreatorVideos>>;
  try {
    videos = await fetchCreatorVideos(creator, query);
  } catch (err) {
    console.error("Failed to fetch creator videos:", err);
    await slack.chat.postMessage({ channel, text: "Failed to fetch videos from YouTube. Please try again." });
    return;
  }

  const state = readState();
  const seenIds = new Set(state.seenIds);
  const newVideos = videos.filter((v) => !seenIds.has(v.id));

  if (newVideos.length === 0) {
    await slack.chat.postMessage({ channel, text: `No new videos found for *${query}* by *${creator}* — all already posted.` });
    return;
  }

  for (const video of newVideos) {
    try {
      await postVideoAlert(video);
      seenIds.add(video.id);
    } catch (err) {
      console.error(`Failed to post ${video.id}:`, err);
    }
  }

  writeState({ ...state, seenIds: [...seenIds] });
}

async function handleLinkedInSearch(channel: string, type: "jobs" | "posts", keywords: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] LinkedIn ${type} search: "${keywords}"`);
  const state = type === "jobs" ? defaultJobsState(keywords) : defaultPostsState(keywords);
  const ts = await postFilterForm(channel, state);
  if (ts) linkedInFilterStates.set(`${channel}:${ts}`, state);
}

async function handleLocalBizSearch(channel: string, city: string, country: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Local biz search: city="${city}" country="${country}"`);
  await slack.chat.postMessage({
    channel,
    text: `Searching for businesses without a website in *${city}, ${country}*...`,
  });

  let businesses: Awaited<ReturnType<typeof findBusinessesWithoutWebsite>>;
  try {
    businesses = await findBusinessesWithoutWebsite(city.trim(), country.trim());
  } catch (err) {
    console.error("Local biz search failed:", err);
    await slack.chat.postMessage({ channel, text: `Local biz search failed: ${(err as Error).message}` });
    return;
  }

  try {
    await postLocalBizResults(LOCAL_BIZ_CHANNEL, city.trim(), country.trim(), businesses);
  } catch (err) {
    console.error("Failed to post local biz results:", err);
    await slack.chat.postMessage({ channel, text: `Failed to post results: ${(err as Error).message}` });
  }
}

async function resolveChannelId(nameOrId: string): Promise<string | undefined> {
  // If it's already a Slack channel ID (e.g. C012AB3CD), use it directly
  if (/^[A-Z][A-Z0-9]{6,}$/.test(nameOrId)) return nameOrId;

  const name = nameOrId.replace(/^#/, "");
  try {
    const info = await slack.conversations.info({ channel: name });
    return (info.channel as any)?.id;
  } catch {
    // conversations.info doesn't support name lookup — try conversations.list
  }

  try {
    let cursor: string | undefined;
    do {
      const result: any = await slack.conversations.list({
        types: "public_channel",
        limit: 200,
        cursor,
      });
      const match = (result.channels ?? []).find((c: any) => c.name === name);
      if (match) return match.id;
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);
  } catch (err) {
    console.error("[YouTube watcher] Could not resolve channel ID:", err);
  }

  return undefined;
}

async function startSocketListener(): Promise<void> {
  const socketClient = new SocketModeClient({
    appToken: process.env.SLACK_APP_TOKEN!,
  });

  // Resolve channel IDs in the background — don't block socket startup.
  // Until resolved, commands are accepted from any channel.
  let aiVideosChannelId: string | undefined;
  let linkedInChannelId: string | undefined;
  let localBizChannelId: string | undefined;

  resolveChannelId(AI_VIDEOS_CHANNEL).then((id) => {
    aiVideosChannelId = id;
    console.log(`[YouTube watcher] Channel resolved: ${AI_VIDEOS_CHANNEL} → ${id ?? "not found, accepting from any channel"}`);
  });

  resolveChannelId(LINKEDIN_CHANNEL).then((id) => {
    linkedInChannelId = id;
    console.log(`[LinkedIn watcher] Channel resolved: ${LINKEDIN_CHANNEL} → ${id ?? "not found, accepting from any channel"}`);
  });

  resolveChannelId(LOCAL_BIZ_CHANNEL).then((id) => {
    localBizChannelId = id;
    console.log(`[Local biz watcher] Channel resolved: ${LOCAL_BIZ_CHANNEL} → ${id ?? "not found, accepting from any channel"}`);
  });

  socketClient.on("message", async ({ event, ack }: any) => {
    await ack();

    // Ignore bot messages (including our own) to prevent feedback loops.
    if (event.subtype || event.bot_id) return;

    const text: string = (event.text ?? "").trim().toLowerCase();
    console.log(`[DEBUG] message event: channel=${event.channel} text="${text}"`);

    const creatorMatch = text.match(CREATOR_FETCH_REGEX);
    const linkedInJobsMatch = text.match(LINKEDIN_JOBS_REGEX);
    const linkedInPostsMatch = text.match(LINKEDIN_POSTS_REGEX);
    const localBizMatch = text.match(LOCAL_BIZ_REGEX);
    const isTrigger = text === TRIGGER_PHRASE;
    console.log(`[DEBUG] linkedInChannelId=${linkedInChannelId} jobsMatch=${!!linkedInJobsMatch} postsMatch=${!!linkedInPostsMatch} localBizMatch=${!!localBizMatch}`);

    // YouTube commands — enforce AI videos channel
    if (isTrigger || creatorMatch) {
      if (aiVideosChannelId && event.channel !== aiVideosChannelId) return;

      if (isTrigger) {
        console.log(`[${new Date().toISOString()}] Manual trigger received from channel ${event.channel}`);
        await slack.chat.postMessage({
          channel: event.channel,
          text: "On it! Fetching latest Claude Code videos...",
        });
        await check(event.channel);
      } else if (creatorMatch) {
        const [, creator, query] = creatorMatch;
        await handleCreatorFetch(event.channel, creator, query);
      }
      return;
    }

    // LinkedIn commands — enforce LinkedIn channel
    if (linkedInJobsMatch || linkedInPostsMatch) {
      if (linkedInChannelId && event.channel !== linkedInChannelId) return;

      try {
        if (linkedInJobsMatch) {
          await handleLinkedInSearch(event.channel, "jobs", linkedInJobsMatch[1].trim());
        } else if (linkedInPostsMatch) {
          await handleLinkedInSearch(event.channel, "posts", linkedInPostsMatch[1].trim());
        }
      } catch (err) {
        console.error("LinkedIn handleLinkedInSearch failed:", err);
        await slack.chat.postMessage({ channel: event.channel, text: `LinkedIn search failed: ${(err as Error).message}` }).catch(() => {});
      }
      return;
    }

    // Local biz command — enforce local biz channel
    if (localBizMatch) {
      if (localBizChannelId && event.channel !== localBizChannelId) return;

      const [, city, country] = localBizMatch;
      try {
        await handleLocalBizSearch(event.channel, city.trim(), country.trim());
      } catch (err) {
        console.error("Local biz search failed:", err);
        await slack.chat.postMessage({ channel: event.channel, text: `Local biz search failed: ${(err as Error).message}` }).catch(() => {});
      }
    }
  });

  socketClient.on("interactive", async ({ body, ack }: any) => {
    await ack();

    if (body?.type !== "block_actions") return;

    const action = body.actions?.[0];
    const actionId: string = action?.action_id ?? "";
    const channel: string = body.channel?.id ?? body.container?.channel_id;
    const messageTs: string = body.message?.ts ?? body.container?.message_ts;

    console.log(`[${new Date().toISOString()}] Interactive event: action=${actionId}`);

    if (!channel) {
      console.error("interactive: could not determine channel", JSON.stringify(body));
      return;
    }

    // ── LinkedIn filter select changed ──────────────────────────────────────
    if (actionId === "li_date" || actionId === "li_remote" || actionId === "li_count") {
      const stateKey = `${channel}:${messageTs}`;
      const currentState = linkedInFilterStates.get(stateKey);
      if (!currentState) return;

      const selected: string = action.selected_option?.value ?? "any";
      const updated: SearchState = { ...currentState };
      if (actionId === "li_date") updated.date = selected as SearchState["date"];
      if (actionId === "li_remote") updated.remote = selected as SearchState["remote"];
      if (actionId === "li_count") updated.count = parseInt(selected, 10);

      linkedInFilterStates.set(stateKey, updated);
      await updateFilterForm(channel, messageTs, updated);
      return;
    }

    // ── LinkedIn search button clicked ──────────────────────────────────────
    if (actionId === "li_search") {
      const stateKey = `${channel}:${messageTs}`;
      let state: SearchState;
      try {
        state = linkedInFilterStates.get(stateKey) ?? JSON.parse(action.value);
      } catch {
        await slack.chat.postMessage({ channel, thread_ts: messageTs, text: "Failed to read search state. Please try again." });
        return;
      }

      await slack.chat.postMessage({
        channel,
        thread_ts: messageTs,
        text: `Searching LinkedIn ${state.type} for *${state.keywords}*...`,
      });

      try {
        if (state.type === "jobs") {
          const jobs = await searchLinkedInJobs(state);
          await postJobResults(channel, messageTs, jobs, state.keywords);
        } else {
          const posts = await searchLinkedInPosts(state);
          await postPostResults(channel, messageTs, posts, state.keywords);
        }
        linkedInFilterStates.delete(stateKey);
      } catch (err) {
        console.error("LinkedIn search failed:", err);
        await slack.chat.postMessage({
          channel,
          thread_ts: messageTs,
          text: `LinkedIn search failed: ${(err as Error).message}`,
        });
      }
      return;
    }

    // ── Generate blog button ────────────────────────────────────────────────
    if (actionId !== "generate_blog") return;

    const threadTs: string = body.message?.ts ?? body.container?.message_ts;

    let videoData: any;
    try {
      videoData = JSON.parse(action.value);
    } catch (err) {
      console.error("generate_blog: failed to parse action value", err);
      await slack.chat.postMessage({ channel, text: "Failed to parse video data. Please try again." });
      return;
    }

    try {
      await slack.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: "✍️ Generating blog post in Hebrew, please wait...",
      });

      const blogPost = await generateHebrewBlogPost(videoData);

      await slack.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: blogPost,
      });
      console.log(`[${new Date().toISOString()}] Blog post generated for "${videoData.title}"`);
    } catch (err) {
      console.error("Failed to generate blog post:", err);
      await slack.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `Failed to generate blog post: ${(err as Error).message}`,
      });
    }
  });

  await socketClient.start();
  console.log("Slack Socket Mode listener started.");
}

export function startYouTubeWatcher(): void {
  check();
  setInterval(check, POLL_INTERVAL_MS);
  startSocketListener().catch((err) => console.error("Socket Mode failed to start:", err));
  console.log(`YouTube watcher running. Checking every ${POLL_INTERVAL_MS / 60_000} minutes.`);
}
