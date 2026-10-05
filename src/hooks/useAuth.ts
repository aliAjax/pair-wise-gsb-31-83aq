import { storeToRefs } from 'pinia';

import { useAuthStore } from '@/stores/authStore';

export const useAuth = () => {
  const store = useAuthStore();
  const { currentUser, users, sessionId, isLoggedIn } = storeToRefs(store);
  return {
    currentUser,
    users,
    sessionId,
    isLoggedIn,
    login: store.login,
    updateProfile: store.updateProfile,
    hydrate: store.hydrate,
  };
};
