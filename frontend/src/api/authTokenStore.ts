
import { store } from '../store';

export const authTokenStore = {
  get: (): string | null => store.getState().auth.accessToken,
  set: (_token: string | null) => {
    // No-op now: the token is written only through authSlice.loginSuccess /
    // logout (see PlatformContext). Kept as a function so every existing
    // caller (agents.ts, client.ts, gatewaysApi.ts, modelRegistryApi.ts...)
    // keeps compiling without changes.
  },
};
