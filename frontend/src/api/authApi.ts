import { apiClient } from "./client";
import type {
  AdminCreateUserRequest,
  AuthStatus,
  LoginPayload,
  LoginResponse,
  UserProfile,
  UserProfileWithCredentials,
  UserProfileUpdateRequest,
  UserCredentialsUpdateRequest,
} from "../types/auth";

export const authApi = {
  async getStatus(): Promise<AuthStatus> {
    const res = await apiClient.get<AuthStatus>("/auth/status");
    return res.data;
  },

  async login(payload: LoginPayload): Promise<LoginResponse> {
    const res = await apiClient.post<LoginResponse>("/auth/login", payload);
    if (res.data.token) {
      localStorage.setItem("meeting_auth_token", res.data.token);
    }
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      localStorage.removeItem("meeting_auth_token");
    }
  },

  async getMe(): Promise<UserProfileWithCredentials> {
    const res = await apiClient.get<UserProfileWithCredentials>("/auth/me");
    return res.data;
  },

  async updateProfile(
    payload: UserProfileUpdateRequest
  ): Promise<{ success: boolean; message: string; user?: any }> {
    const res = await apiClient.patch("/auth/profile", payload);
    return res.data;
  },

  async updateCredentials(
    payload: UserCredentialsUpdateRequest
  ): Promise<{ status: string; message: string; credentials: any }> {
    const res = await apiClient.patch("/auth/credentials", payload);
    return res.data;
  },

  async adminListUsers(): Promise<UserProfile[]> {
    const res = await apiClient.get<any>("/auth/users");
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.users)) return res.data.users;
    return [];
  },

  async adminCreateUser(payload: AdminCreateUserRequest): Promise<UserProfile> {
    const res = await apiClient.post<UserProfile>("/auth/users", payload);
    return res.data;
  },

  async adminDeleteUser(userId: string): Promise<void> {
    await apiClient.delete(`/auth/users/${userId}`);
  },
};
