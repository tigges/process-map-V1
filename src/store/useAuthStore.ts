import { create } from 'zustand';

const AUTH_KEY = 'processmap-auth';
const PASSWORDS_KEY = 'processmap-passwords';

interface AuthState {
  isAuthenticated: boolean;
  appPassword: string | null;

  checkAuth: () => void;
  login: (password: string) => boolean;
  logout: () => void;

  setAppPassword: (password: string) => void;
  removeAppPassword: () => void;
  hasPassword: () => boolean;
}

function loadPasswords(): { app?: string } {
  const raw = localStorage.getItem(PASSWORDS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePasswords(data: { app?: string }): void {
  localStorage.setItem(PASSWORDS_KEY, JSON.stringify(data));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  appPassword: null,

  checkAuth() {
    // Password feature disabled for testing — set DEV_SKIP_AUTH to false to re-enable
    const DEV_SKIP_AUTH = true;
    if (DEV_SKIP_AUTH) {
      set({ isAuthenticated: true, appPassword: null });
      return;
    }
    const passwords = loadPasswords();
    if (!passwords.app) {
      set({ isAuthenticated: true, appPassword: null });
      return;
    }
    set({ appPassword: passwords.app });
    const session = sessionStorage.getItem(AUTH_KEY);
    if (session === 'true') {
      set({ isAuthenticated: true });
    }
  },

  login(password) {
    const { appPassword } = get();
    if (!appPassword || password === appPassword) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      set({ isAuthenticated: true });
      return true;
    }
    return false;
  },

  logout() {
    sessionStorage.removeItem(AUTH_KEY);
    set({ isAuthenticated: false });
  },

  setAppPassword(password) {
    const passwords = loadPasswords();
    passwords.app = password;
    savePasswords(passwords);
    set({ appPassword: password });
  },

  removeAppPassword() {
    const passwords = loadPasswords();
    delete passwords.app;
    savePasswords(passwords);
    set({ appPassword: null, isAuthenticated: true });
  },

  hasPassword() {
    return !!get().appPassword;
  },
}));
