// KNAPROTOTYPE/app/_layout.tsx
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import {
  useFonts,
  Roboto_300Light,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';
import { PatientAuthProvider } from '../context/PatientAuthContext';
import { DesktopApp, MobileApp } from '../components/AppShells';

SplashScreen.preventAutoHideAsync();

// Real Android devices carry the user's OS font-scale/display-size setting
// into every unscaled dp value RN renders, which is why a build can look
// correct in Expo Go (dev device at 100% scale) and oversized on another
// phone. Pin every Text/TextInput to the design's fixed sizes.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.allowFontScaling = false;
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.allowFontScaling = false;

type WebView = 'desktop' | 'mobile';

function getInitialWebView(): WebView {
  if (typeof window === 'undefined') return 'desktop';
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'mobile' ? 'mobile' : 'desktop';
}

// Dev-only web view switcher: lets desktop web preview the mobile layout in a
// phone frame via ?view=mobile or Alt+M, without touching native builds.
function WebRoot() {
  const [view, setView] = useState<WebView>(getInitialWebView);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        setView(prev => (prev === 'mobile' ? 'desktop' : 'mobile'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (view === 'mobile') {
    return (
      <View style={webStyles.phoneFrameOverlay}>
        <View style={webStyles.phoneFrame}>
          <MobileApp />
        </View>
      </View>
    );
  }

  return <DesktopApp />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Roboto_300Light,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    Roboto_900Black,
  });

  useEffect(() => {
    // Inject Roboto font for Web globally
    if (typeof document !== 'undefined') {
      let fontLink = document.getElementById('roboto-font-link');
      if (!fontLink) {
        fontLink = document.createElement('link');
        fontLink.id = 'roboto-font-link';
        fontLink.setAttribute('rel', 'stylesheet');
        fontLink.setAttribute('href', 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');
        document.head.appendChild(fontLink);
      }

      let styleTag = document.getElementById('roboto-font-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'roboto-font-style';
        styleTag.textContent = `
          body, button, input, textarea, select, div, span, p, h1, h2, h3, h4, h5, h6, a {
            font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          }
        `;
        document.head.appendChild(styleTag);
      }
    }

    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded && Platform.OS !== 'web') {
    return null;
  }

  return (
    <PatientAuthProvider>
      {Platform.OS !== 'web' ? <MobileApp /> : <WebRoot />}
    </PatientAuthProvider>
  );
}

const webStyles: Record<string, any> = {
  phoneFrameOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
  },
  phoneFrame: {
    width: 393,
    height: 812,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 10,
    borderColor: '#0d0d0d',
    boxShadow: '0 30px 70px rgba(0, 0, 0, 0.55)',
  },
};

// A crash shows a full-screen "Something went wrong" with Try again.
export { default as ErrorBoundary } from '../components/ErrorScreen';
