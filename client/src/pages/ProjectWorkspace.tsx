import { useParams, useLocation, Route, Switch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Loader2, BookOpen, Upload, Eye, Download, Settings, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import UploadPage from "./project/UploadPage";
import ReviewPage from "./project/ReviewPage";
import ExportPage from "./project/ExportPage";
import ProjectSettings from "./project/ProjectSettings";
import ProjectOverview from "./project/ProjectOverview";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: BookOpen, path: "" },
  { id: "upload", label: "Upload", icon: Upload, path: "/upload" },
  { id: "review", label: "Review", icon: Eye, path: "/review" },
  { id: "export", label: "Export", icon: Download, path: "/export" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
];

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id ?? "0");
  const [location, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const { data: project, isLoading } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId && isAuthenticated }
  );
  const { data: stats } = trpc.projects.stats.useQuery(
    { id: projectId },
    { enabled: !!projectId && isAuthenticated }
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) { window.location.href = getLoginUrl(); return null; }
  if (!project) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Project not found</div>;

  // Determine active nav item
  const basePath = `/projects/${projectId}`;
  const subPath = location.replace(basePath, "") || "";
  const activeNav = NAV_ITEMS.find(n => n.path !== "" && subPath.startsWith(n.path))?.id ?? "overview";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header */}
      <header className="border-b border-border bg-card/50 flex-shrink-0">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2 text-sm">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-muted-foreground">Projects</span>
            <ChevronRight className="w-3 h-3 text-border" />
            <span className="font-medium">{project.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{stats.total} docs</span>
                <span className="text-green-400">{stats.reviewed} reviewed</span>
                {stats.needsReview > 0 && <span className="text-yellow-400">{stats.needsReview} pending review</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 border-r border-border bg-sidebar flex-shrink-0 flex flex-col">
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{project.name}</div>
                <div className="text-[10px] text-sidebar-foreground/50 capitalize">{project.pipelineType.replace("_", " ")}</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-2 space-y-0.5">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`${basePath}${item.path}`)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left
                    ${isActive
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                  {item.id === "review" && stats && stats.needsReview > 0 && (
                    <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                      {stats.needsReview}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Progress */}
          {stats && stats.total > 0 && (
            <div className="p-4 border-t border-sidebar-border">
              <div className="flex items-center justify-between text-[10px] text-sidebar-foreground/50 mb-1.5">
                <span>Progress</span>
                <span>{Math.round((stats.reviewed / stats.total) * 100)}%</span>
              </div>
              <div className="h-1 bg-sidebar-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.round((stats.reviewed / stats.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Switch>
            <Route path={`${basePath}/upload`} component={() => <UploadPage projectId={projectId} project={project} />} />
            <Route path={`${basePath}/review/:docId`} component={() => <ReviewPage projectId={projectId} project={project} />} />
            <Route path={`${basePath}/review`} component={() => <ReviewPage projectId={projectId} project={project} />} />
            <Route path={`${basePath}/export`} component={() => <ExportPage projectId={projectId} project={project} />} />
            <Route path={`${basePath}/settings`} component={() => <ProjectSettings projectId={projectId} project={project} />} />
            <Route component={() => <ProjectOverview projectId={projectId} project={project} stats={stats} />} />
          </Switch>
        </main>
      </div>
    </div>
  );
}
