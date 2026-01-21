import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: number;
  type: NotificationType;
  message: string;
}

interface NotificationContextValue {
  notify: (message: string, type?: NotificationType, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

let globalId = 1;

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const remove = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notifyBase = useCallback(
    (message: string, type: NotificationType = 'info', durationMs: number = 4000) => {
      const id = globalId++;
      setNotifications((prev) => [...prev, { id, type, message }]);
      if (durationMs > 0) {
        setTimeout(() => remove(id), durationMs);
      }
    },
    [remove]
  );

  const value: NotificationContextValue = {
    notify: notifyBase,
    success: (message, durationMs) => notifyBase(message, 'success', durationMs ?? 3000),
    error: (message, durationMs) => notifyBase(message, 'error', durationMs ?? 6000),
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="notification-container">
        {notifications.map((n) => (
          <div key={n.id} className={`notification notification-${n.type}`}>
            <span>{n.message}</span>
            <button
              type="button"
              className="notification-close"
              onClick={() => remove(n.id)}
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return ctx;
}

