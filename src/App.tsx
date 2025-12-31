import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SecurityShieldProvider } from "@/components/security/SecurityShieldProvider";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AgentDetails from "./pages/AgentDetails";
import AgentDashboard from "./pages/AgentDashboard";
import Unauthorized from "./pages/Unauthorized";
import BootstrapAdmin from "./pages/BootstrapAdmin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SecurityShieldProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/bootstrap" element={<BootstrapAdmin />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/agents/:agentId" element={<AgentDetails />} />
              <Route path="/agent" element={<AgentDashboard />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SecurityShieldProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
