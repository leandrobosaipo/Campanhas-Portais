import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Megaphone,
  List,
  Plus,
  Building2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/insercoes", label: "Inserções", icon: List },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-sm flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground tracking-tight">AdOps</div>
              <div className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase">Manager</div>
            </div>
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
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Quick action */}
        <div className="px-2 py-3 border-t border-sidebar-border">
          <Link
            href="/campanhas/nova"
            className="flex items-center gap-2 px-2.5 py-2 text-sm text-primary hover:bg-sidebar-accent rounded transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Nova Campanha
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-bold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
