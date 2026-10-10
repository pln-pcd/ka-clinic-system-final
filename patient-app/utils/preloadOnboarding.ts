import { Image, Platform } from 'react-native';

const illustrations = [
  require('../assets/onboarding1.png'),
  require('../assets/onboarding2.png'),
  require('../assets/onboarding3.png'),
  require('../assets/onboarding4.png'),
];
let started = false;

export function preloadOnboarding() {
  if (started) return;
  started = true;
  illustrations.forEach(image => {
    const source = Platform.OS === 'web'
      ? (typeof image === 'string' ? { uri: image } : image)
      : Image.resolveAssetSource(image);
    if (source?.uri) Image.prefetch(source.uri).catch(() => {});
  });
}
