'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** App-wide toast hook. Falls back to a no-op outside the provider. */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  return ctx ?? { toast: () => undefined };
}

const ICONS: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="size-5 text-muted-foreground" />,
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <AlertCircle className="size-5 text-destructive" />,
  warning: <AlertCircle className="size-5 text-warning" />,
};

export function Toaster({ children }: { children?: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback<ToastContextValue['toast']>(({ title, description, variant = 'default' }) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, title, description, variant }]);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            onOpenChange={(open) => !open && dismiss(item.id)}
            className={cn(
              'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border bg-card p-4 shadow-lg',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80',
              'data-[state=open]:slide-in-from-top-full data-[state=closed]:slide-out-to-right-full',
              item.variant === 'error' && 'border-destructive/40',
              item.variant === 'success' && 'border-success/40',
              item.variant === 'warning' && 'border-warning/40',
            )}
          >
            {ICONS[item.variant]}
            <div className="flex-1 space-y-1">
              <ToastPrimitive.Title className="text-sm font-semibold">{item.title}</ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="text-sm text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:top-auto sm:w-96 ltr:right-0 rtl:left-0" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
