import { useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { authApi } from "../api/authApi";
import { onUnauthorized } from "../api/client";
import type { LoginPayload, UserCredentialsUpdateRequest, AdminCreateUserRequest } from "../types/auth";

export function useAuthViewModel() {
  const {
    authRequired,
    isAuthenticated,
    currentUser,
    credentials,
    savedPassphrase,
    error,
    isLoading,
    setAuthRequired,
    setAuthenticated,
    setCurrentUser,
    setCredentials,
    setSavedPassphrase,
    setError,
    setLoading,
    logout: storeLogout,
  } = useAuthStore();

  const fetchProfile = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      setCurrentUser(me);
      if (me.credentials) {
        setCredentials(me.credentials);
      }
    } catch {
      // User might not be authenticated yet or token expired
    }
  }, [setCurrentUser, setCredentials]);

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      const status = await authApi.getStatus();
      setAuthRequired(status.auth_required);
      setAuthenticated(status.authenticated, undefined, undefined, status.user || undefined);

      if (status.authenticated) {
        await fetchProfile();
      }
    } catch (err: any) {
      console.error("Auth status error:", err);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [setAuthRequired, setAuthenticated, setLoading, fetchProfile]);

  useEffect(() => {
    checkStatus();

    // Subscribe to 401 unauthorized events from API layer
    const unsubscribe = onUnauthorized(() => {
      setAuthenticated(false);
    });
    return unsubscribe;
  }, [checkStatus, setAuthenticated]);

  const login = async (payload: LoginPayload, remember: boolean = true) => {
    try {
      setLoading(true);
      setError(null);
      const res = await authApi.login(payload);
      setAuthenticated(true, res.token, remember ? payload.password : "", res.user);
      await fetchProfile();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Invalid credentials.";
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const updateCredentials = async (payload: UserCredentialsUpdateRequest) => {
    try {
      setLoading(true);
      const res = await authApi.updateCredentials(payload);
      await fetchProfile();
      return res;
    } finally {
      setLoading(false);
    }
  };

  const adminCreateUser = async (payload: AdminCreateUserRequest) => {
    return await authApi.adminCreateUser(payload);
  };

  const adminDeleteUser = async (userId: string) => {
    return await authApi.adminDeleteUser(userId);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      storeLogout();
    }
  };

  return {
    authRequired,
    isAuthenticated,
    currentUser,
    credentials,
    savedPassphrase,
    error,
    isLoading,
    setSavedPassphrase,
    login,
    logout,
    checkStatus,
    fetchProfile,
    updateCredentials,
    adminCreateUser,
    adminDeleteUser,
  };
}
