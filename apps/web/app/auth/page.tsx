import { Suspense } from "react";
import AuthClient from "@/components/auth-client";

export default function AuthPage() {
  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4 py-8 sm:px-6 lg:min-h-[70vh]">
      <Suspense
        fallback={
          <div className="rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground">
            Загрузка формы входа…
          </div>
        }
      >
        <AuthClient />
      </Suspense>
    </div>
  );
}
