import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import { readState, writeState } from "../state";
import { fetchNewClaudeCodeVideos, fetchCreatorVideos } from "../services/youtube";
import { postVideoAlert } from "../services/slack-videos";

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const TRIGGER_PHRASE = "go fetch videos";
const CREATOR_FETCH_REGEX = /^go fetch (\S+) (.+) videos$/;
const AI_VIDEOS_CHANNEL = process.env.SLACK_AI_VIDEOS_CHANNEL ?? "#ai-videos";

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

  if (videos.length === 0) {
    await slack.chat.postMessage({ channel, text: `No videos found for *${query}* by *${creator}*.` });
    return;
  }

  for (const video of videos) {
    try {
      await postVideoAlert(video);
    } catch (err) {
      console.error(`Failed to post ${video.id}:`, err);
    }
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
        types: "public_channel,private_channel",
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

  const targetChannelId = await resolveChannelId(AI_VIDEOS_CHANNEL);
  if (targetChannelId) {
    console.log(`[YouTube watcher] Listening for "${TRIGGER_PHRASE}" in channel ${targetChannelId}`);
  } else {
    console.warn(`[YouTube watcher] Could not resolve channel "${AI_VIDEOS_CHANNEL}" — will accept trigger from any channel`);
  }

  socketClient.on("message", async ({ event, ack }: any) => {
    await ack();

    const text: string = (event.text ?? "").trim().toLowerCase();
    const creatorMatch = text.match(CREATOR_FETCH_REGEX);
    const isTrigger = text === TRIGGER_PHRASE;

    if (!isTrigger && !creatorMatch) return;

    // If we resolved a target channel, enforce it; otherwise accept from anywhere
    if (targetChannelId && event.channel !== targetChannelId) return;

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
