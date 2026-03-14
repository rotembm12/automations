import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import { readState, writeState } from "../state";
import { fetchNewClaudeCodeVideos } from "../services/youtube";
import { postVideoAlert } from "../services/slack-videos";

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const TRIGGER_PHRASE = "go fetch videos";
const AI_VIDEOS_CHANNEL = process.env.SLACK_AI_VIDEOS_CHANNEL ?? "#ai-videos";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

async function check(): Promise<void> {
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

async function startSocketListener(): Promise<void> {
  const socketClient = new SocketModeClient({
    appToken: process.env.SLACK_APP_TOKEN!,
  });

  socketClient.on("message", async ({ event, ack }: any) => {
    await ack();

    const text: string = (event.text ?? "").trim().toLowerCase();
    console.log(text);
    if (text !== TRIGGER_PHRASE) return;

    // Resolve channel name to ID if needed, then compare
    const eventChannel: string = event.channel;
    const targetChannel = AI_VIDEOS_CHANNEL.startsWith("#")
      ? AI_VIDEOS_CHANNEL.slice(1)
      : AI_VIDEOS_CHANNEL;

    // Check if the message came from the right channel
    let channelName: string | undefined;
    try {
      const info = await slack.conversations.info({ channel: eventChannel });
      channelName = (info.channel as any)?.name;
    } catch {
      // If we can't resolve, skip
      return;
    }

    if (channelName !== targetChannel) return;

    console.log(`[${new Date().toISOString()}] Manual trigger received from #${channelName}`);

    await slack.chat.postMessage({
      channel: eventChannel,
      text: "On it! Fetching latest Claude Code videos...",
    });

    await check();
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
