import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Megaphone,
  List,
  Plus,
  Building2,
  SlidersHorizontal,
  RefreshCcwDot,
  ShieldAlert,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff,
  Pin,
  PinOff,
} from "lucide-react";
import { QueueOverviewBanner } from "@/components/adops/ops-queue/QueueOverviewBanner";
import { usePersistentState } from "@/lib/usePersistentState";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/insercoes", label: "Inserções", icon: List },
  { href: "/sincronizacao", label: "Sincronização", icon: RefreshCcwDot },
  { href: "/auditoria-prints", label: "Falhas de Prints", icon: ShieldAlert },
  { href: "/captura-config", label: "Configuração de Captura", icon: Cpu },
  { href: "/configuracoes", label: "Configurações", icon: SlidersHorizontal },
];

const MOBILE_NAV_ITEMS = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/insercoes", label: "Evidências", icon: List },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = usePersistentState<boolean>(
    "adops.ui.sidebar-collapsed.v1",
    false,
  );
  const [queueVisible, setQueueVisible] = usePersistentState<boolean>(
    "adops.ui.queue-visible.v1",
    true,
  );
  const [queuePinned, setQueuePinned] = usePersistentState<boolean>(
    "adops.ui.queue-pinned.v1",
    true,
  );

  const queueControlButtons = (
    <>
      <button
        type="button"
        onClick={() => setQueueVisible((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded border border-border bg-background/50 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        title={queueVisible ? "Ocultar andamento" : "Mostrar andamento"}
      >
        {queueVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {queueVisible ? "Ocultar andamento" : "Mostrar andamento"}
      </button>
      <button
        type="button"
        onClick={() => setQueuePinned((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded border border-border bg-background/50 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title={queuePinned ? "Desfixar andamento" : "Fixar andamento"}
        disabled={!queueVisible}
      >
        {queuePinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        {queuePinned ? "Desfixar" : "Fixar"}
      </button>
    </>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex md:flex-col",
          desktopSidebarCollapsed ? "w-16" : "w-52",
        )}
      >
        {/* Brand */}
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className={cn("flex items-center gap-2.5", desktopSidebarCollapsed && "justify-center")}>
            <div className="w-7 h-7 bg-primary rounded-sm flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className={cn(desktopSidebarCollapsed && "hidden")}>
              <div className="text-sm font-bold text-foreground tracking-tight">AdOps</div>
              <div className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase">Manager</div>
            </div>
            <button
              type="button"
              onClick={() => setDesktopSidebarCollapsed((prev) => !prev)}
              className={cn(
                "ml-auto inline-flex items-center justify-center rounded border border-sidebar-border bg-sidebar-accent/50 p-1.5 text-sidebar-foreground hover:text-foreground",
                desktopSidebarCollapsed && "ml-0 mt-2",
              )}
              title={desktopSidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            >
              {desktopSidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors",
                  desktopSidebarCollapsed && "justify-center px-2",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
                title={desktopSidebarCollapsed ? label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className={cn(desktopSidebarCollapsed && "hidden")}>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Quick action */}
        <div className="px-2 py-3 border-t border-sidebar-border">
          <Link
            href="/campanhas/nova"
            className={cn(
              "flex items-center gap-2 px-2.5 py-2 text-sm text-primary hover:bg-sidebar-accent rounded transition-colors font-medium",
              desktopSidebarCollapsed && "justify-center px-2",
            )}
            title={desktopSidebarCollapsed ? "Nova Campanha" : undefined}
          >
            <Plus className="w-4 h-4" />
            <span className={cn(desktopSidebarCollapsed && "hidden")}>Nova Campanha</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm md:hidden">
          <div>
            <div className="text-sm font-bold text-foreground">AdOps</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidências de campanha</div>
          </div>
          <button
            type="button"
            onClick={() => setQueueVisible((prev) => !prev)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-border bg-background/60 p-2 text-foreground"
            aria-label={queueVisible ? "Ocultar andamento" : "Mostrar andamento"}
            title={queueVisible ? "Ocultar andamento" : "Mostrar andamento"}
          >
            {queueVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="hidden items-center justify-end gap-2 border-b border-border bg-card/35 px-4 py-2 md:flex md:px-6">
          <span className="text-[11px] font-medium text-muted-foreground">Andamento:</span>
          {queueControlButtons}
        </div>

        {queueVisible && queuePinned ? (
          <QueueOverviewBanner />
        ) : null}

        <main className="min-h-0 flex-1 overflow-auto pb-24 md:pb-0">
          {queueVisible && !queuePinned ? (
            <QueueOverviewBanner
              className="mb-3 border-b border-border md:mb-4"
            />
          ) : null}
          {children}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-lg backdrop-blur md:hidden"
          aria-label="Navegação principal"
        >
          <div className="grid grid-cols-3 gap-1">
            {MOBILE_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="z-10 border-b border-border bg-card/50 px-3 py-3 backdrop-blur-sm sm:px-4 md:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
        <h1 className="text-lg font-bold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
}
