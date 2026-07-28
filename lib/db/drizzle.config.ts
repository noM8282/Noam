import { defineConfig } from "drizzle-kit";
import path from "path";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;

  const badHosts = new Set(["base", "localhost", "127.0.0.1", ""]);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!badHosts.has(parsed.hostname)) return url;
    } catch {
      // fall through
    }
  }

  const host = process.env.PGHOST;
  const port = process.env.PGPORT ?? "5432";
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;

  if (host && user && database) {
    const auth = password ? `${user}:${encodeURIComponent(password)}` : user;
    return `postgresql://${auth}@${host}:${port}/${database}`;
  }

  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: getConnectionString(),
  },
});
