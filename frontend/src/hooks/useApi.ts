import { useState, useCallback } from 'react';
import { getErrorMessage } from '../utils/errorHandler';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (...args: unknown[]) => Promise<T | null>;
  reset: () => void;
}

/**
 * Хук для выполнения API запросов с управлением состоянием
 */
export function useApi<T>(
  apiCall: (...args: unknown[]) => Promise<{ data: T }>,
  defaultError?: string
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const response = await apiCall(...args);
        setState({ data: response.data, loading: false, error: null });
        return response.data;
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err, defaultError || 'Ошибка выполнения запроса');
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
        return null;
      }
    },
    [apiCall, defaultError]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}
