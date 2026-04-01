import { and, eq, desc, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users, InsertUser,
  projects, InsertProject, Project,
  onboardingSamples, InsertOnboardingSample,
  documents, InsertDocument, Document,
  transcriptions, InsertTranscription,
  jobs, InsertJob,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

import { ENV } from "./_core/env";

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
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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
  const result = await db.insert(projects).values(data);
  return result[0];
}

export async function updateProject(id: number, userId: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projects).set(data).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function getProjectStats(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  // Verify ownership
  const project = await getProjectById(projectId, userId);
  if (!project) return null;
  const statusCounts = await db.select({
    status: documents.status,
    count: count(),
  }).from(documents).where(eq(documents.projectId, projectId)).groupBy(documents.status);
  const total = statusCounts.reduce((sum, r) => sum + Number(r.count), 0);
  const reviewed = statusCounts.find(r => r.status === "reviewed")?.count ?? 0;
  const flagged = statusCounts.find(r => r.status === "flagged")?.count ?? 0;
  const needsReview = statusCounts.find(r => r.status === "needs_review")?.count ?? 0;
  const processing = statusCounts.find(r => r.status === "processing")?.count ?? 0;
  const pending = statusCounts.find(r => r.status === "pending")?.count ?? 0;
  const errors = statusCounts.find(r => r.status === "error")?.count ?? 0;
  return { total, reviewed: Number(reviewed), flagged: Number(flagged), needsReview: Number(needsReview), processing: Number(processing), pending: Number(pending), errors: Number(errors) };
}

// ─── Onboarding Samples ───────────────────────────────────────────────────────

export async function createOnboardingSample(data: InsertOnboardingSample) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(onboardingSamples).values(data);
  return result[0];
}

export async function getSamplesByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(onboardingSamples).where(eq(onboardingSamples.projectId, projectId)).orderBy(onboardingSamples.createdAt);
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
  const result = await db.insert(documents).values(data);
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
  if (status === "needs_review" || status === "reviewed" || status === "error") {
    update.processedAt = new Date();
  }
  if (errorMessage) update.errorMessage = errorMessage;
  await db.update(documents).set(update).where(eq(documents.id, id));
}

// ─── Transcriptions ───────────────────────────────────────────────────────────

export async function createTranscription(data: InsertTranscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(transcriptions).values(data);
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
  await db.update(transcriptions).set({ reviewedJson, reviewedAt: new Date() }).where(eq(transcriptions.id, id));
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
  const result = await db.insert(jobs).values(data);
  return result[0];
}

export async function getJobsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(desc(jobs.createdAt)).limit(20);
}

export async function updateJob(id: number, data: Partial<InsertJob>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(jobs).set(data).where(eq(jobs.id, id));
}
