import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastProps {
    toast: ToastMessage;
    onDismiss: (id: string) => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss, duration = 3000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(toast.id);
        }, duration);

        return () => clearTimeout(timer);
    }, [toast.id, onDismiss, duration]);

    const isSuccess = toast.type === 'success';

    return (
        <div className="animate-fade-in">
            <div
                className={`${
                    isSuccess
                        ? 'bg-emerald-500/10 border-emerald-500/50'
                        : 'bg-rose-500/10 border-rose-500/50'
                } border rounded-lg p-4 flex items-center gap-3 shadow-xl backdrop-blur-sm`}
            >
                {isSuccess ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                )}
                <span
                    className={`text-sm font-medium ${
                        isSuccess ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                >
                    {toast.message}
                </span>
                <button
                    onClick={() => onDismiss(toast.id)}
                    className={`ml-2 p-1 rounded hover:bg-slate-800/50 transition-colors ${
                        isSuccess ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};

interface ToastContainerProps {
    toasts: ToastMessage[];
    onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
};

// Hook for managing toasts
export const useToast = () => {
    const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

    const showToast = React.useCallback((type: ToastType, message: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts((prev) => [...prev, { id, type, message }]);
    }, []);

    const dismissToast = React.useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showSuccess = React.useCallback(
        (message: string) => showToast('success', message),
        [showToast]
    );

    const showError = React.useCallback(
        (message: string) => showToast('error', message),
        [showToast]
    );

    return {
        toasts,
        showToast,
        showSuccess,
        showError,
        dismissToast,
    };
};

export default Toast;
