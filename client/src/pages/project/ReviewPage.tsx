import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import type { Project } from "../../../../drizzle/schema";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2, Flag, ChevronLeft, ChevronRight, Loader2,
  Clock, AlertCircle, XCircle, Eye, Filter
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  projectId: number;
  project: Project;
  docId?: string;
}

type SchemaField = {
  type: "string" | "boolean" | "array" | "number";
  description?: string;
  nullable?: boolean;
  displayHint?: "short_text" | "long_text" | "tag_list";
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "status-pending" },
    processing: { label: "Processing", cls: "status-processing" },
    needs_review: { label: "Needs review", cls: "status-needs-review" },
    reviewed: { label: "Reviewed", cls: "status-reviewed" },
    flagged: { label: "Flagged", cls: "status-flagged" },
    error: { label: "Error", cls: "status-error" },
  };
  const info = map[status] ?? { label: status, cls: "" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
      {info.label}
    </span>
  );
}

function DynamicField({
  fieldName,
  fieldDef,
  value,
  onChange,
}: {
  fieldName: string;
  fieldDef: SchemaField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (fieldDef.type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">{fieldName}</Label>
          {fieldDef.description && <p className="text-xs text-muted-foreground">{fieldDef.description}</p>}
        </div>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  if (fieldDef.type === "array" || fieldDef.displayHint === "tag_list") {
    const arr = Array.isArray(value) ? value : [];
    const [tagInput, setTagInput] = useState("");
    return (
      <div>
        <Label className="text-sm mb-1.5 block">{fieldName}</Label>
        {fieldDef.description && <p className="text-xs text-muted-foreground mb-2">{fieldDef.description}</p>}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {arr.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs cursor-pointer hover:bg-destructive/15 hover:text-destructive"
              onClick={() => onChange(arr.filter((_, j) => j !== i))}
            >
              {String(tag)} ×
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && tagInput.trim()) {
                e.preventDefault();
                onChange([...arr, tagInput.trim()]);
                setTagInput("");
              }
            }}
            placeholder="Type and press Enter to add"
            className="bg-background text-sm h-8"
          />
        </div>
      </div>
    );
  }

  if (fieldDef.displayHint === "long_text" || (typeof value === "string" && value.length > 100)) {
    return (
      <div>
        <Label className="text-sm mb-1.5 block">{fieldName}</Label>
        {fieldDef.description && <p className="text-xs text-muted-foreground mb-2">{fieldDef.description}</p>}
        <Textarea
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value)}
          className="bg-background text-sm resize-none"
          rows={4}
        />
      </div>
    );
  }

  return (
    <div>
      <Label className="text-sm mb-1.5 block">{fieldName}</Label>
      {fieldDef.description && <p className="text-xs text-muted-foreground mb-2">{fieldDef.description}</p>}
      <Input
        value={String(value ?? "")}
        onChange={e => onChange(e.target.value)}
        className="bg-background text-sm"
      />
    </div>
  );
}

export default function ReviewPage({ projectId, project, docId: docIdProp }: Props) {
  const { docId: docIdParam } = useParams<{ docId: string }>();
  const docId = docIdProp ?? docIdParam;
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("needs_review");
  const [editedFields, setEditedFields] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { data: documents, refetch: refetchDocs } = trpc.documents.list.useQuery({
    projectId,
    status: statusFilter as "needs_review" | "reviewed" | "flagged" | "pending" | "processing" | "error" | undefined,
  });

  const currentDocId = docId ? parseInt(docId) : documents?.[0]?.id;
  const currentIndex = documents?.findIndex(d => d.id === currentDocId) ?? 0;

  const { data: transcription, refetch: refetchTranscription } = trpc.transcriptions.getByDocument.useQuery(
    { documentId: currentDocId ?? 0, projectId },
    { enabled: !!currentDocId }
  );

  const saveReview = trpc.transcriptions.saveReview.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      refetchDocs();
      refetchTranscription();
      // Auto-advance to next
      if (documents && currentIndex < documents.length - 1) {
        const next = documents[currentIndex + 1];
        navigate(`/projects/${projectId}/review/${next.id}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const schema = project.jsonSchema as Record<string, SchemaField> | null;
  const rawData = (transcription?.reviewedJson ?? transcription?.rawJson) as Record<string, unknown> | null;

  useEffect(() => {
    if (rawData) {
      setEditedFields({ ...rawData });
    }
  }, [transcription?.id]);

  const handleSave = async (status: "reviewed" | "flagged") => {
    if (!transcription || !currentDocId) return;
    setIsSaving(true);
    await saveReview.mutateAsync({
      transcriptionId: transcription.id,
      documentId: currentDocId,
      projectId,
      reviewedJson: editedFields,
      status,
    });
    setIsSaving(false);
  };

  const currentDoc = documents?.find(d => d.id === currentDocId);

  return (
    <div className="flex h-full">
      {/* Document list sidebar */}
      <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs bg-background">
              <Filter className="w-3 h-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="error">Errors</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {!documents || documents.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No documents with this status
            </div>
          ) : (
            documents.map(doc => (
              <button
                key={doc.id}
                onClick={() => navigate(`/projects/${projectId}/review/${doc.id}`)}
                className={`w-full text-left px-3 py-2.5 hover:bg-secondary/50 transition-colors ${doc.id === currentDocId ? "bg-secondary" : ""}`}
              >
                <div className="text-xs font-medium truncate mb-1">{doc.filename}</div>
                <StatusBadge status={doc.status} />
              </button>
            ))
          )}
        </div>
        <div className="p-3 border-t border-border text-xs text-muted-foreground">
          {documents?.length ?? 0} documents
        </div>
      </div>

      {/* Main review area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!currentDoc ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Eye className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Select a document to review</p>
            </div>
          </div>
        ) : (
          <>
            {/* Doc header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={currentIndex <= 0}
                    onClick={() => {
                      if (documents && currentIndex > 0) navigate(`/projects/${projectId}/review/${documents[currentIndex - 1].id}`);
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{currentIndex + 1} / {documents?.length ?? 0}</span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={!documents || currentIndex >= documents.length - 1}
                    onClick={() => {
                      if (documents && currentIndex < documents.length - 1) navigate(`/projects/${projectId}/review/${documents[currentIndex + 1].id}`);
                    }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <span className="text-sm font-medium">{currentDoc.filename}</span>
                <StatusBadge status={currentDoc.status} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-transparent border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                  onClick={() => handleSave("flagged")}
                  disabled={isSaving || !transcription}
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                  Flag
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleSave("reviewed")}
                  disabled={isSaving || !transcription}
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Mark reviewed
                </Button>
              </div>
            </div>

            {/* Split view */}
            <div className="flex-1 overflow-hidden flex">
              {/* Image panel */}
              <div className="w-1/2 border-r border-border overflow-auto p-4 bg-black/20">
                {currentDoc.storageUrl ? (
                  <img
                    src={currentDoc.storageUrl}
                    alt={currentDoc.filename}
                    className="w-full rounded"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Image not available
                  </div>
                )}
              </div>

              {/* Form panel */}
              <div className="w-1/2 overflow-auto p-6">
                {!transcription ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading transcription…</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Model info */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pb-3 border-b border-border">
                      <span>Model: <span className="font-mono">{transcription.modelUsed}</span></span>
                      {transcription.reviewedAt && (
                        <span>· Reviewed {new Date(transcription.reviewedAt).toLocaleDateString()}</span>
                      )}
                    </div>

                    {/* Original text (two-pass) */}
                    {transcription.originalText && (
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">
                          Original transcription (pass 1)
                        </Label>
                        <div className="bg-background rounded-lg p-3 text-sm font-mono text-muted-foreground max-h-32 overflow-y-auto">
                          {transcription.originalText}
                        </div>
                      </div>
                    )}

                    {/* Dynamic schema fields */}
                    {schema ? (
                      Object.entries(schema).map(([fieldName, fieldDef]) => (
                        <DynamicField
                          key={fieldName}
                          fieldName={fieldName}
                          fieldDef={fieldDef}
                          value={editedFields[fieldName]}
                          onChange={v => setEditedFields(prev => ({ ...prev, [fieldName]: v }))}
                        />
                      ))
                    ) : (
                      // Fallback: render raw JSON fields
                      rawData && Object.entries(rawData)
                        .filter(([k]) => !k.startsWith("_"))
                        .map(([key, val]) => (
                          <div key={key}>
                            <Label className="text-sm mb-1.5 block">{key}</Label>
                            <Input
                              value={String(val ?? "")}
                              onChange={e => setEditedFields(prev => ({ ...prev, [key]: e.target.value }))}
                              className="bg-background text-sm"
                            />
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
