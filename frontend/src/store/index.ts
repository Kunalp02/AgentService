
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import type { Middleware } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import authReducer from './authSlice';
import { logout } from './authSlice';
import { agentApi } from './agentApi';

const rootReducer = combineReducers({
  auth: authReducer,
  [agentApi.reducerPath]: agentApi.reducer,
});

const persistConfig = {
  key: 'ccil_ai_platform_auth',
  storage,
  whitelist: ['auth'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const resetAgentApiOnLogout: Middleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (logout.match(action)) dispatch(agentApi.util.resetApiState());
  return result;
};

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(agentApi.middleware as Middleware, resetAgentApiOnLogout),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
