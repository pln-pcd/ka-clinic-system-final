// KNAPROTOTYPE/app/_layout.tsx
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { PatientAuthProvider } from '../context/PatientAuthContext';
import { DesktopApp, MobileApp } from '../components/AppShells';
import { perfMark } from '../utils/perf';

perfMark('js-start');

// Held until the saved sign-in is resolved; components/AppShells.tsx hides it.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Real Android devices carry the user's OS font-scale/display-size setting
// into every unscaled dp value RN renders, which is why a build can look
// correct in Expo Go (dev device at 100% scale) and oversized on another
// phone. Pin every Text/TextInput to the design's fixed sizes.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.allowFontScaling = false;
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.allowFontScaling = false;

type WebView = 'desktop' | 'mobile' | 'raw';

function getInitialWebView(): WebView {
  if (typeof window === 'undefined') return 'desktop';
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view');
  if (v === 'raw') return 'raw';
  if (v === 'mobile') return 'mobile';
  if (window.innerWidth <= 600) return 'raw';
  return 'desktop';
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

  if (view === 'raw') {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <MobileApp />
      </View>
    );
  }

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

// The native app renders in the platform font (no screen sets a Roboto
// fontFamily), so nothing is loaded before the first frame. The web preview
// gets Roboto from Google Fonts below.
export default function RootLayout() {
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
            font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
        `;
        document.head.appendChild(styleTag);
      }
    }

    // Desktop web never mounts MobileApp, which is what normally hides it.
    if (Platform.OS === 'web') SplashScreen.hideAsync().catch(() => {});
    // Final safety net: the native splash never outlives 20 s, whatever the
    // startup path (the auth check itself gives up after 15 s).
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 20000);
    return () => clearTimeout(t);
  }, []);

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
    backgroundColor: '#ffffff',
  },
  phoneFrame: {
    width: 393,
    height: 812,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
};

// A crash shows a full-screen "Something went wrong" with Try again.
export { default as ErrorBoundary } from '../components/ErrorScreen';
