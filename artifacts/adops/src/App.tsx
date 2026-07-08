import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/adops/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Campaigns } from "@/pages/Campaigns";
import { NewCampaign } from "@/pages/NewCampaign";
import { CampaignDetail } from "@/pages/CampaignDetail";
import { Insertions } from "@/pages/Insertions";
import { InsertionDetail } from "@/pages/InsertionDetail";
import { Settings } from "@/pages/Settings";
import { SyncCenter } from "@/pages/SyncCenter";
import { CaptureAuditQueue } from "@/pages/CaptureAuditQueue";
import { CaptureConfig } from "@/pages/CaptureConfig";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/campanhas/nova" component={NewCampaign} />
        <Route path="/campanhas/:id" component={CampaignDetail} />
        <Route path="/campanhas" component={Campaigns} />
        <Route path="/sincronizacao" component={SyncCenter} />
        <Route path="/auditoria-prints" component={CaptureAuditQueue} />
        <Route path="/captura-config" component={CaptureConfig} />
        <Route path="/configuracoes" component={Settings} />
        <Route path="/insercoes/:id" component={InsertionDetail} />
        <Route path="/insercoes" component={Insertions} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
