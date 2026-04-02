import { and, eq, desc, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  users, InsertUser,
  projects, InsertProject, Project,
  onboardingSamples, InsertOnboardingSample,
  documents, InsertDocument, Document,
  transcriptions, InsertTranscription,
  jobs, InsertJob,
  documentEmbeddings, InsertDocumentEmbedding,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// ─── Database Connection ──────────────────────────────────────────────────────

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export async function getDb() {
  if (!_db) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) {
      console.warn("[Database] SUPABASE_DATABASE_URL not set");
      return null;
    }
    try {
      const isPgBouncer = url.includes("pgbouncer=true");
      _client = postgres(url, {
        max: isPgBouncer ? 10 : 5,
        prepare: !isPgBouncer,
        connect_timeout: 15,
      });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const v = user[field];
    if (v !== undefined) { values[field] = v ?? null; updateSet[field] = v ?? null; }
  }
  if (user.lastSignedIn) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: updateSet,
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getProjectsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}

export async function getProjectById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values(data).returning();
  return result[0];
}

export async function updateProject(id: number, userId: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projects)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function deleteProject(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function getProjectStats(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, reviewed: 0, flagged: 0, needsReview: 0, processing: 0, pending: 0, errors: 0 };
  const project = await getProjectById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const statusCounts = await db
    .select({ status: documents.status, count: count() })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .groupBy(documents.status);
  const total = statusCounts.reduce((sum, r) => sum + Number(r.count), 0);
  const get = (s: string) => Number(statusCounts.find(r => r.status === s)?.count ?? 0);
  return {
    total,
    reviewed: get("reviewed"),
    flagged: get("flagged"),
    needsReview: get("needs_review"),
    processing: get("processing"),
    pending: get("pending"),
    errors: get("error"),
  };
}

// ─── Onboarding Samples ───────────────────────────────────────────────────────

export async function createOnboardingSample(data: InsertOnboardingSample) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(onboardingSamples).values(data).returning();
  return result[0];
}

export async function getSamplesByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(onboardingSamples)
    .where(eq(onboardingSamples.projectId, projectId))
    .orderBy(onboardingSamples.createdAt);
}

export async function updateSampleAiOutput(id: number, aiOutput: unknown, validationScore: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(onboardingSamples).set({ aiOutput, validationScore }).where(eq(onboardingSamples.id, id));
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data).returning();
  return result[0];
}

export async function getDocumentsByProjectId(projectId: number, status?: Document["status"]) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(documents.projectId, projectId)];
  if (status) conditions.push(eq(documents.status, status));
  return db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.uploadedAt));
}

export async function getDocumentById(id: number, projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents)
    .where(and(eq(documents.id, id), eq(documents.projectId, projectId)))
    .limit(1);
  return result[0];
}

export async function updateDocumentStatus(id: number, status: Document["status"], errorMessage?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const update: Partial<InsertDocument> = { status };
  if (["needs_review", "reviewed", "error"].includes(status)) update.processedAt = new Date();
  if (errorMessage !== undefined) update.errorMessage = errorMessage;
  await db.update(documents).set(update).where(eq(documents.id, id));
}

// ─── Transcriptions ───────────────────────────────────────────────────────────

export async function createTranscription(data: InsertTranscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(transcriptions).values(data).returning();
  return result[0];
}

export async function getTranscriptionByDocumentId(documentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(transcriptions)
    .where(eq(transcriptions.documentId, documentId))
    .orderBy(desc(transcriptions.createdAt))
    .limit(1);
  return result[0];
}

export async function updateReviewedJson(id: number, reviewedJson: unknown) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(transcriptions)
    .set({ reviewedJson, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(transcriptions.id, id));
}

export async function getReviewedTranscriptions(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    transcription: transcriptions,
    document: documents,
  }).from(transcriptions)
    .innerJoin(documents, eq(transcriptions.documentId, documents.id))
    .where(and(
      eq(transcriptions.projectId, projectId),
      sql`${documents.status} IN ('reviewed', 'flagged')`
    ))
    .orderBy(desc(transcriptions.reviewedAt));
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function createJob(data: InsertJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(jobs).values(data).returning();
  return result[0];
}

export async function getJobsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs)
    .where(eq(jobs.projectId, projectId))
    .orderBy(desc(jobs.createdAt))
    .limit(20);
}

export async function updateJob(id: number, data: Partial<InsertJob>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(jobs).set(data).where(eq(jobs.id, id));
}

// ─── Document Embeddings (pgvector) ──────────────────────────────────────────

export async function createEmbedding(data: InsertDocumentEmbedding) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documentEmbeddings).values(data).returning();
  return result[0];
}

export async function deleteEmbeddingsByDocumentId(documentId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(documentEmbeddings).where(eq(documentEmbeddings.documentId, documentId));
}

/**
 * Semantic similarity search using pgvector cosine distance.
 * Strictly scoped to projectId for tenant isolation.
 */
export async function searchEmbeddings(
  projectId: number,
  queryEmbedding: number[],
  limit = 5
): Promise<Array<{
  id: string;
  documentId: number;
  transcriptionId: number | null;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const results = await db.execute(
    sql`
      SELECT
        de.id::text,
        de."documentId",
        de."transcriptionId",
        de.content,
        de.metadata,
        1 - (de.embedding <=> ${vectorStr}::vector) AS similarity
      FROM document_embeddings de
      WHERE de."projectId" = ${projectId}
      ORDER BY de.embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `
  );
  return (results as unknown) as Array<{
    id: string;
    documentId: number;
    transcriptionId: number | null;
    content: string;
    metadata: Record<string, unknown> | null;
    similarity: number;
  }>;
}
