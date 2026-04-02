import { useState, useRef, useCallback } from "react";
import type { Project } from "../../../../drizzle/schema";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, XCircle, Play, Zap, FileImage } from "lucide-react";

interface Props {
  projectId: number;
  project: Project;
}

interface QueuedFile {
  id: string;
  file: File;
  status: "queued" | "uploading" | "transcribing" | "done" | "error";
  error?: string;
}

/** Read a File as a base64 string (data URL split) */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Limit concurrency to `limit` simultaneous promises */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export default function UploadPage({ projectId, project }: Props) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const uploadDoc = trpc.documents.upload.useMutation();
  const transcribeDoc = trpc.documents.transcribe.useMutation();
  const batchTranscribe = trpc.documents.batchTranscribe.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.projects.stats.invalidate({ id: projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const entries: QueuedFile[] = Array.from(files)
      .filter(f => f.type.startsWith("image/") || f.type === "application/pdf")
      .map(f => ({
        id: crypto.randomUUID(),
        file: f,
        status: "queued" as const,
      }));
    setQueue(prev => [...prev, ...entries]);
  }, []);

  const updateStatus = useCallback((id: string, status: QueuedFile["status"], error?: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, status, error } : q));
  }, []);

  /**
   * Process all queued files in parallel with a concurrency cap of 3.
   * Each task: read base64 → upload → transcribe
   */
  const processQueue = async () => {
    const pending = queue.filter(q => q.status === "queued");
    if (pending.length === 0) return;
    setIsProcessing(true);

    const tasks = pending.map(item => async () => {
      updateStatus(item.id, "uploading");
      const base64 = await readFileAsBase64(item.file);

      const doc = await uploadDoc.mutateAsync({
        projectId,
        filename: item.file.name,
        fileBase64: base64,
        mimeType: item.file.type,
        fileSizeBytes: item.file.size,
      });

      updateStatus(item.id, "transcribing");

      if (doc) {
        await transcribeDoc.mutateAsync({ documentId: doc.id, projectId });
      }

      updateStatus(item.id, "done");
    });

    // Run up to 3 files simultaneously
    const results = await runWithConcurrency(tasks, 3);

    // Mark any failures
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const err = result.reason;
        updateStatus(pending[i].id, "error", err instanceof Error ? err.message : String(err));
      }
    });

    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    setIsProcessing(false);
    utils.projects.stats.invalidate({ id: projectId });
    utils.documents.list.invalidate({ projectId });

    if (failed === 0) {
      toast.success(`${succeeded} document${succeeded !== 1 ? "s" : ""} transcribed successfully`);
    } else {
      toast.warning(`${succeeded} succeeded, ${failed} failed`);
    }
  };

  const clearDone = () => setQueue(prev => prev.filter(q => q.status !== "done"));

  const statusIcon = (status: QueuedFile["status"]) => {
    switch (status) {
      case "queued": return <div className="w-4 h-4 rounded-full border border-border" />;
      case "uploading": return <Loader2 className="w-4 h-4 animate-spin text-amber-400" />;
      case "transcribing": return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "done": return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case "error": return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const statusLabel = (status: QueuedFile["status"]) => {
    switch (status) {
      case "queued": return <span className="text-muted-foreground">Queued</span>;
      case "uploading": return <span className="text-amber-400">Uploading…</span>;
      case "transcribing": return <span className="text-primary">Transcribing…</span>;
      case "done": return <span className="text-green-400">Done</span>;
      case "error": return <span className="text-red-400">Error</span>;
    }
  };

  const queuedCount = queue.filter(q => q.status === "queued").length;
  const processingCount = queue.filter(q => q.status === "uploading" || q.status === "transcribing").length;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-serif font-semibold mb-1">Upload documents</h2>
        <p className="text-muted-foreground text-sm">
          Upload scanned document images. Up to 3 files are transcribed simultaneously using your project's AI configuration.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-12 text-center mb-6 hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium mb-1">Drop document images here or click to browse</p>
        <p className="text-sm text-muted-foreground">JPEG, PNG, TIFF — multiple files supported</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">{queue.length} file{queue.length !== 1 ? "s" : ""} in queue</h3>
              {processingCount > 0 && (
                <span className="text-xs text-primary flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {processingCount} processing in parallel
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {queue.some(q => q.status === "done") && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearDone}>
                  Clear done
                </Button>
              )}
            </div>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {queue.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <FileImage className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 truncate">{item.file.name}</span>
                <span className="text-xs text-muted-foreground">{(item.file.size / 1024).toFixed(0)} KB</span>
                <div className="flex items-center gap-1.5">
                  {statusIcon(item.status)}
                  <span className="text-xs">{statusLabel(item.status)}</span>
                </div>
                {item.error && (
                  <span className="text-xs text-red-400 max-w-32 truncate" title={item.error}>{item.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {queuedCount > 0 && (
          <Button onClick={processQueue} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isProcessing
              ? `Processing… (${processingCount} active)`
              : `Transcribe ${queuedCount} file${queuedCount !== 1 ? "s" : ""}`
            }
          </Button>
        )}
        <Button
          variant="outline"
          className="gap-2 bg-transparent"
          onClick={() => batchTranscribe.mutate({ projectId })}
          disabled={batchTranscribe.isPending}
        >
          {batchTranscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Batch transcribe pending
        </Button>
      </div>

      {/* Config info */}
      <div className="mt-8 bg-card border border-border rounded-xl p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Active configuration</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Pipeline</div>
            <div className="font-medium capitalize">{project.pipelineType.replace("_", " ")}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Model</div>
            <div className="font-mono text-xs">{project.modelName}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Schema fields</div>
            <div>{project.jsonSchema ? Object.keys(project.jsonSchema as object).length : 0}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Concurrency</div>
            <div className="font-mono text-xs">3 parallel</div>
          </div>
        </div>
      </div>
    </div>
  );
}
