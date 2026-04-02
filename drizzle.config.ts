import { defineConfig } from "drizzle-kit";

const directUrl = process.env.SUPABASE_DIRECT_URL;
if (!directUrl) {
  throw new Error("SUPABASE_DIRECT_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: directUrl,
  },
});
