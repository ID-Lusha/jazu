import SettingsClient from "@/components/settings-client";
import { PageContainer } from "@/components/page-container";

export default function SettingsPage() {
  return (
    <PageContainer size="narrow">
      <div className="mb-4 sm:mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Настройки
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          Аккаунт и уведомления
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Контакт владельца, Telegram для горячих лидов и общие параметры.
        </p>
      </div>
      <SettingsClient />
    </PageContainer>
  );
}
