import { Suspense } from "react";
import PhoneCaptureClient from "@/components/phone-capture-client";

export default function PhonePage() {
  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4 py-8 sm:px-6 lg:min-h-[70vh]">
      <Suspense
        fallback={
          <div className="rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground">
            Загрузка…
          </div>
        }
      >
        <PhoneCaptureClient />
      </Suspense>
    </div>
  );
}
