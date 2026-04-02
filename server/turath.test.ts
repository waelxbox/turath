import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-openid",
    email: "researcher@example.com",
    name: "Dr. Test Researcher",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe("auth", () => {
  it("returns null user when unauthenticated", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeUndefined();
  });

  it("returns user when authenticated", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.email).toBe("researcher@example.com");
    expect(user?.role).toBe("user");
  });

  it("clears session cookie on logout", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true });
  });
});

// ─── Projects router tests ────────────────────────────────────────────────────

describe("projects.list", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("projects.create", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.create({ name: "Test Archive" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("projects.get", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.get({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── Onboarding router tests ──────────────────────────────────────────────────

describe("onboarding.getSamples", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.onboarding.getSamples({ projectId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("onboarding.generateConfig", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.onboarding.generateConfig({ projectId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── Documents router tests ───────────────────────────────────────────────────

describe("documents.list", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.documents.list({ projectId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("documents.transcribe", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.documents.transcribe({ documentId: 1, projectId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── Transcriptions router tests ──────────────────────────────────────────────

describe("transcriptions.saveReview", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.transcriptions.saveReview({
      transcriptionId: 1,
      documentId: 1,
      projectId: 1,
      reviewedJson: { title: "Test" },
      status: "reviewed",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── Export router tests ──────────────────────────────────────────────────────

describe("export.csv", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.export.csv({ projectId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("export.jsonZip", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.export.jsonZip({ projectId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── Input validation tests ───────────────────────────────────────────────────

describe("input validation", () => {
  it("projects.create rejects empty name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Empty name should fail Zod validation (min 1)
    await expect(caller.projects.create({ name: "" })).rejects.toThrow();
  });

  it("projects.update rejects invalid pipeline type", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.update({
      id: 1,
      // @ts-expect-error intentionally invalid
      pipelineType: "invalid_type",
    })).rejects.toThrow();
  });

  it("transcriptions.saveReview rejects invalid status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.transcriptions.saveReview({
      transcriptionId: 1,
      documentId: 1,
      projectId: 1,
      reviewedJson: {},
      // @ts-expect-error intentionally invalid
      status: "pending",
    })).rejects.toThrow();
  });
});

// ─── RAG router tests ─────────────────────────────────────────────────────────

describe("rag.search", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.rag.search({ projectId: 1, query: "test query" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("rag.chat", () => {
  it("throws UNAUTHORIZED when not logged in", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.rag.chat({ projectId: 1, question: "What are the themes?" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects empty question", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.rag.chat({ projectId: 1, question: "" })).rejects.toThrow();
  });

  it("rejects question exceeding max length", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const longQuestion = "a".repeat(4001);
    await expect(caller.rag.chat({ projectId: 1, question: longQuestion })).rejects.toThrow();
  });
});
