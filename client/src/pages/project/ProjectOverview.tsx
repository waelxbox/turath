import type { Project } from "../../../../drizzle/schema";
import { CheckCircle2, Clock, AlertCircle, XCircle, Layers, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface Props {
  projectId: number;
  project: Project;
  stats?: {
    total: number;
    reviewed: number;
    flagged: number;
    needsReview: number;
    processing: number;
    pending: number;
    errors: number;
  } | null;
}

export default function ProjectOverview({ projectId, project, stats }: Props) {
  const [, navigate] = useLocation();

  const statCards = [
    { label: "Total documents", value: stats?.total ?? 0, icon: FileText, color: "text-foreground" },
    { label: "Reviewed", value: stats?.reviewed ?? 0, icon: CheckCircle2, color: "text-green-400" },
    { label: "Needs review", value: stats?.needsReview ?? 0, icon: Clock, color: "text-yellow-400" },
    { label: "Flagged", value: stats?.flagged ?? 0, icon: AlertCircle, color: "text-orange-400" },
    { label: "Processing", value: stats?.processing ?? 0, icon: Layers, color: "text-amber-400" },
    { label: "Errors", value: stats?.errors ?? 0, icon: XCircle, color: "text-red-400" },
  ];

  const schema = project.jsonSchema as Record<string, { type: string; description: string }> | null;
  const glossary = project.glossary as Record<string, string> | null;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-serif font-semibold mb-1">{project.name}</h2>
        {project.description && <p className="text-muted-foreground text-sm">{project.description}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <Icon className={`w-4 h-4 ${color} mb-2`} />
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => navigate(`/projects/${projectId}/upload`)}
          className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 transition-colors group"
        >
          <div className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">Upload documents</div>
          <div className="text-xs text-muted-foreground">Add new scans to the transcription queue</div>
        </button>
        <button
          onClick={() => navigate(`/projects/${projectId}/review`)}
          className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 transition-colors group"
        >
          <div className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">
            Review queue
            {(stats?.needsReview ?? 0) > 0 && (
              <span className="ml-2 text-xs text-yellow-400">({stats?.needsReview} pending)</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">Review and correct AI transcriptions</div>
        </button>
        <button
          onClick={() => navigate(`/projects/${projectId}/export`)}
          className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 transition-colors group"
        >
          <div className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">Export data</div>
          <div className="text-xs text-muted-foreground">Download reviewed transcriptions as CSV or JSON</div>
        </button>
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI config */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">AI configuration</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pipeline</span>
              <span className="font-medium capitalize">{project.pipelineType.replace("_", " ")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Model</span>
              <span className="font-mono text-xs">{project.modelName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Temperature</span>
              <span className="font-mono text-xs">{project.temperature}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Schema fields</span>
              <span>{schema ? Object.keys(schema).length : 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Glossary terms</span>
              <span>{glossary ? Object.keys(glossary).length : 0}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 bg-transparent"
            onClick={() => navigate(`/projects/${projectId}/settings`)}
          >
            Edit configuration
          </Button>
        </div>

        {/* Schema fields */}
        {schema && Object.keys(schema).length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Output schema</h3>
            <div className="space-y-2">
              {Object.entries(schema).slice(0, 8).map(([field, def]) => (
                <div key={field} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">{def.type}</span>
                  <div className="min-w-0">
                    <span className="font-medium">{field}</span>
                    {def.description && <span className="text-muted-foreground text-xs ml-2">— {def.description}</span>}
                  </div>
                </div>
              ))}
              {Object.keys(schema).length > 8 && (
                <div className="text-xs text-muted-foreground">+{Object.keys(schema).length - 8} more fields</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
