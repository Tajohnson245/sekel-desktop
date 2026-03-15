import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import "./layout.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  if (!adminEmails.includes(user.email?.toLowerCase() ?? "")) {
    await db.auth.signOut();

    redirect("/dashboard/login");
  }

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <nav className="dashboard-nav">
          <a href="/dashboard" className="dashboard-nav__link">Overview</a>
          <a href="/dashboard/responses" className="dashboard-nav__link">Responses</a>
        </nav>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="dashboard-signout">Sign out</button>
        </form>
      </aside>
      <div className="dashboard-content">{children}</div>
    </div>
  );
}
