import "../styles/builder.global.css";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { checkSession } from "../server/auth";
import { AppShell } from "../components/app-shell";
import { CreateServiceWizard } from "../components/services/create-service-wizard";

export const Route = createFileRoute("/services_/new")({
  beforeLoad: async () => {
    if (import.meta.env.DEV) return { user: { login: "dev" } };
    const user = await checkSession();
    if (!user) throw redirect({ to: "/auth/github" });
    return { user };
  },
  head: () => ({ meta: [{ title: "Create a service · Form Builder" }] }),
  component: CreateServicePage,
});

function CreateServicePage() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell section="services" user={user.login} title="Create a service">
      <div className="ui-scroll-native h-full overflow-y-auto bg-ui-canvas">
        <CreateServiceWizard />
      </div>
    </AppShell>
  );
}
