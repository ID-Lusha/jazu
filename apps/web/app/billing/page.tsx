import BillingClient from "@/components/billing-client";
import { PageContainer } from "@/components/page-container";

export default function BillingPage() {
  return (
    <PageContainer>
      <div className="mb-10 sm:mb-12">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Тарифы
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Платите за уникального клиента в месяц.
        </p>
      </div>
      <BillingClient />
    </PageContainer>
  );
}
