import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

// Tabs stay mounted when another tab is selected. Only the visible screen
// may consume Android Back; false lets tab history handle it.
export function useFocusedBack(handler: () => boolean) {
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [handler]));
}
