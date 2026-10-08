import { toast } from "sonner";

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Modern, centralized toast notification utility wrapping Sonner.
 * Formats alerts with consistent styling, timing, and optional descriptions.
 */
export const showToast = {
  success: (title: string, options?: string | ToastOptions) => {
    const opts = typeof options === "string" ? { description: options } : options;
    return toast.success(title, {
      duration: opts?.duration ?? 3500,
      description: opts?.description,
      action: opts?.action,
    });
  },

  error: (title: string, options?: string | ToastOptions) => {
    const opts = typeof options === "string" ? { description: options } : options;
    return toast.error(title, {
      duration: opts?.duration ?? 5000,
      description: opts?.description,
      action: opts?.action,
    });
  },

  info: (title: string, options?: string | ToastOptions) => {
    const opts = typeof options === "string" ? { description: options } : options;
    return toast.info(title, {
      duration: opts?.duration ?? 4000,
      description: opts?.description,
      action: opts?.action,
    });
  },

  warning: (title: string, options?: string | ToastOptions) => {
    const opts = typeof options === "string" ? { description: options } : options;
    return toast.warning(title, {
      duration: opts?.duration ?? 4500,
      description: opts?.description,
      action: opts?.action,
    });
  },

  loading: (title: string, options?: string | ToastOptions) => {
    const opts = typeof options === "string" ? { description: options } : options;
    return toast.loading(title, {
      description: opts?.description,
    });
  },

  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    }
  ) => {
    return toast.promise(promise, messages);
  },

  dismiss: (toastId?: string | number) => {
    toast.dismiss(toastId);
  },
};

export default showToast;
