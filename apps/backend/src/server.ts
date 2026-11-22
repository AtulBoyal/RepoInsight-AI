import app from "./app.js";
import { env } from "./config/env.js";
import { initDatabase } from "./db/database.js";

const PORT = Number(process.env.PORT ?? 5000);

try {
  const database = await initDatabase();

  console.log(
    database
      ? "🗄️  Database: connected (saved reports and share links enabled)"
      : "🗄️  Database: not configured (reports cached in memory, sharing disabled)",
  );
} catch (error) {
  console.error(
    "❌ Could not connect to DATABASE_URL:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}

app.listen(PORT, () => {
  console.log("🚀 RepoInsight-AI Backend");
  console.log(`🚪 Listening on port ${PORT}`);
  console.log(`🤖 Gemini Model: ${env.GEMINI_MODEL}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV ?? "development"}`);
});
