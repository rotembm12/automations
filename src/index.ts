import "dotenv/config";
import app from "./app";
import { startYouTubeWatcher } from "./jobs/youtube-watcher";

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

startYouTubeWatcher();
