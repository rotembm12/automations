import "dotenv/config";
import app from "./app";
import { startSlackBot } from "./jobs/slack-bot";

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

startSlackBot();
