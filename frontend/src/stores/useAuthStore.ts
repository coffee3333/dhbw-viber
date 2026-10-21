import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserCredentials, UserProfile } from "../types/auth";

interface AuthState {
  authRequired: boolean;
  isAuthenticated: boolean;
  token: string | null;
  currentUser: UserProfile | null;
  credentials: UserCredentials | null;
  error: string | null;
  isLoading: boolean;

  setAuthRequired: (required: boolean) => void;
  setAuthenticated: (
    authenticated: boolean,
    token?: string,
    passphrase?: string,
    user?: UserProfile
  ) => void;
  setCurrentUser: (user: UserProfile | null) => void;
  setCredentials: (creds: UserCredentials | null) => void;
  setError: (err: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

const getInitialToken = (): string | null => {
  try {
    return typeof window !== "undefined" ? localStorage.getItem("meeting_auth_token") : null;
  } catch {
    return null;
  }
};

const initialToken = getInitialToken();

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      authRequired: true,
      isAuthenticated: Boolean(initialToken),
      token: initialToken,
      currentUser: null,
      credentials: null,
      error: null,
      isLoading: false,

      setAuthRequired: (required) => set({ authRequired: required }),
      setAuthenticated: (authenticated, token, _passphrase, user) => {
        if (token) {
          localStorage.setItem("meeting_auth_token", token);
        } else if (!authenticated) {
          localStorage.removeItem("meeting_auth_token");
        }
        set((state) => ({
          isAuthenticated: authenticated,
          token: token ?? (authenticated ? state.token : null),
          currentUser: user !== undefined ? user : (authenticated ? state.currentUser : null),
          error: null,
        }));
      },
      setCurrentUser: (currentUser) => set({ currentUser }),
      setCredentials: (credentials) => set({ credentials }),
      setError: (error) => set({ error }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        try {
          localStorage.removeItem("meeting_auth_token");
          localStorage.removeItem("meeting_agent_auth_storage");
        } catch {
          // ignore
        }
        set({
          isAuthenticated: false,
          token: null,
          currentUser: null,
          credentials: null,
          error: null,
        });
      },
    }),
    {
      name: "meeting_agent_auth_storage",
      partialize: (state) => ({
        token: state.token,
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
