"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiJson } from "@/lib/api";

/**
 * Тонкий клиентский гард: дёргает /auth/me и редиректит залогиненного
 * пользователя без phone на /auth/phone. Не блокирует рендер dashboard,
 * чтобы анонимные сессии (без логина) продолжали работать как раньше.
 */
export default function PhoneRequiredGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    void apiJson<{ success: boolean; needsPhone?: boolean }>("/auth/me", { method: "GET" })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.needsPhone && pathname !== "/auth/phone") {
          router.replace("/auth/phone");
        }
      })
      .catch(() => {
        // 401 — анонимный пользователь, ничего не делаем.
      });
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  return null;
}
