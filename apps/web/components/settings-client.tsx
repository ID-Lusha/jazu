"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type MeResponse = {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    telegramChatId?: string | null;
  } | null;
  agent?: {
    id: string;
    name: string;
    status: string;
    currentPrompt?: string;
  } | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground",
        "focus:border-foreground focus:ring-1 focus:ring-foreground/10"
      )}
    />
  );
}

export default function SettingsClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<MeResponse>("/settings")
      .then((res) => {
        setMe(res);
        setTelegramChatId(res.user?.telegramChatId ?? "");
        setDisplayName(res.user?.name ?? "");
      })
      .catch(() => toast.error("Не удалось загрузить профиль"));
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await apiJson<MeResponse>("/settings", {
        method: "PATCH",
        body: JSON.stringify({ telegramChatId, displayName })
      });
      setMe(res);
      toast.success("Настройки сохранены");
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Аккаунт</TabsTrigger>
          <TabsTrigger value="notifications">Уведомления</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>

        {/* Account tab */}
        <TabsContent value="account">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Профиль</h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-secondary px-4 py-3 text-sm">
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="mt-0.5 font-medium">{me?.user?.email ?? "Не авторизован"}</div>
              </div>
              <Field label="Имя">
                <Input value={displayName} onChange={setDisplayName} placeholder="Иван" />
              </Field>
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? "Сохраняю…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Notifications tab */}
        <TabsContent value="notifications">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Telegram для горячих лидов</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Когда AI определяет горячий лид, он пришлёт summary вам в Telegram.
            </p>
            <div className="mt-4">
              <Field label="Telegram Chat ID">
                <Input
                  value={telegramChatId}
                  onChange={setTelegramChatId}
                  placeholder="123456789"
                  type="text"
                />
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Узнать chat id: напишите @userinfobot в Telegram.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? "Сохраняю…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Workspace tab */}
        <TabsContent value="workspace">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Агент</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="rounded-lg bg-secondary px-4 py-3">
                <div className="text-xs text-muted-foreground">Название</div>
                <div className="mt-0.5 font-medium">{me?.agent?.name ?? "Нет активного агента"}</div>
              </div>
              <div className="rounded-lg bg-secondary px-4 py-3">
                <div className="text-xs text-muted-foreground">Статус</div>
                <div className="mt-0.5">
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    me?.agent?.status === "active"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-secondary text-muted-foreground"
                  )}>
                    {me?.agent?.status ?? "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" asChild>
                <a href="/whatsapp">WhatsApp</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/dashboard">Dashboard</a>
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
