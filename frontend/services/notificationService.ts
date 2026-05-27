/**
 * Notification configuration API service (standalone).
 * For use in hooks/components that don't import from services/index.ts
 */
import api from "@/lib/api-client";
import type { NotificationConfig } from "@/types";

export const notificationService = {
  getConfig: async (): Promise<NotificationConfig> => {
    const { data } = await api.get<NotificationConfig>("/notification-config");
    return data;
  },
  updateConfig: async (body: Partial<NotificationConfig>): Promise<NotificationConfig> => {
    const { data } = await api.put<NotificationConfig>("/notification-config", body);
    return data;
  },
  testTelegram: async (message?: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post("/notification-config/test-telegram", { message });
    return data;
  },
  testEmail: async (message?: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post("/notification-config/test-email", { message });
    return data;
  },
};
