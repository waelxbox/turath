import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["onboarding", "validating", "active", "archived"])
    .default("onboarding")
    .notNull(),

  // AI Engine Configuration
  modelProvider: varchar("modelProvider", { length: 64 }).default("gemini").notNull(),
  modelName: varchar("modelName", { length: 128 }).default("gemini-2.5-flash").notNull(),
  pipelineType: mysqlEnum("pipelineType", ["single_pass", "two_pass"])
    .default("single_pass")
    .notNull(),
  temperature: float("temperature").default(0.1).notNull(),
  maxTokens: int("maxTokens").default(4096).notNull(),

  // Generated configuration (from AI onboarding agent)
  systemPrompt: text("systemPrompt"),
  pass2Prompt: text("pass2Prompt"),       // Only for two_pass pipelines
  jsonSchema: json("jsonSchema"),          // { fieldName: { type, description, nullable, displayHint } }
  glossary: json("glossary"),             // { term: definition }
  postProcessing: json("postProcessing"), // [{ type, field, ... }]
  outputFormats: json("outputFormats"),   // ["json", "csv", "tei_xml"]

  // Onboarding reasoning from AI agent
  onboardingReasoning: text("onboardingReasoning"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("projects_userId_idx").on(t.userId),
]);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Onboarding Samples ───────────────────────────────────────────────────────

export const onboardingSamples = mysqlTable("onboarding_samples", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  imagePath: text("imagePath").notNull(),        // S3/storage path
  imageUrl: text("imageUrl"),                    // Public URL for display
  filename: varchar("filename", { length: 255 }),
  manualTranscription: json("manualTranscription").notNull(), // Researcher's gold standard
  aiOutput: json("aiOutput"),                    // AI output during validation
  validationScore: float("validationScore"),     // 0-100 similarity score
  isHeldOut: boolean("isHeldOut").default(false).notNull(), // Used for validation
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("samples_projectId_idx").on(t.projectId),
]);

export type OnboardingSample = typeof onboardingSamples.$inferSelect;
export type InsertOnboardingSample = typeof onboardingSamples.$inferInsert;

// ─── Documents ────────────────────────────────────────────────────────────────

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  storagePath: text("storagePath").notNull(),    // S3/storage path
  storageUrl: text("storageUrl"),                // Public URL
  mimeType: varchar("mimeType", { length: 64 }).default("image/jpeg"),
  fileSizeBytes: int("fileSizeBytes"),
  status: mysqlEnum("status", [
    "pending",
    "processing",
    "needs_review",
    "reviewed",
    "flagged",
    "error",
  ])
    .default("pending")
    .notNull(),
  errorMessage: text("errorMessage"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
}, (t) => [
  index("documents_projectId_idx").on(t.projectId),
  index("documents_status_idx").on(t.status),
]);

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Transcriptions ───────────────────────────────────────────────────────────

export const transcriptions = mysqlTable("transcriptions", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull().references(() => documents.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  modelUsed: varchar("modelUsed", { length: 128 }).notNull(),
  rawJson: json("rawJson").notNull(),            // Unmodified AI output
  reviewedJson: json("reviewedJson"),            // Human-edited version
  originalText: text("originalText"),            // Pass 1 output for two_pass pipelines
  confidenceNotes: text("confidenceNotes"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("transcriptions_documentId_idx").on(t.documentId),
  index("transcriptions_projectId_idx").on(t.projectId),
]);

export type Transcription = typeof transcriptions.$inferSelect;
export type InsertTranscription = typeof transcriptions.$inferInsert;

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  documentId: int("documentId").references(() => documents.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["transcribe", "batch_transcribe", "validate_config"]).notNull(),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed"]).default("queued").notNull(),
  progress: int("progress").default(0),          // 0-100
  totalItems: int("totalItems").default(1),
  completedItems: int("completedItems").default(0),
  errorMessage: text("errorMessage"),
  metadata: json("metadata"),                    // Extra job-specific data
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("jobs_projectId_idx").on(t.projectId),
  index("jobs_status_idx").on(t.status),
]);

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;
