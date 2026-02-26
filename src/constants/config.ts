import Constants from 'expo-constants';

// Get the development server URL for web access
const getDevServerUrl = (): string => {
  // Try multiple ways to get the host
  const debuggerHost = Constants.expoConfig?.hostUri
    || Constants.manifest?.debuggerHost
    || Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    // Remove port if present and add web port (Expo web default is 8081)
    const host = debuggerHost.split(':')[0];
    return `http://${host}:8081`;
  }

  // Fallback to localhost
  return 'http://localhost:8081';
};

// For production, replace with your actual domain
const PRODUCTION_WEB_URL = 'https://domus.app';

export const config = {
  // Use development URL in dev mode, production URL otherwise
  webBaseUrl: __DEV__ ? getDevServerUrl() : PRODUCTION_WEB_URL,

  // Generate a web URL for tenant onboarding
  getOnboardingUrl: (token: string): string => {
    const baseUrl = __DEV__ ? getDevServerUrl() : PRODUCTION_WEB_URL;
    return `${baseUrl}/onboard/${token}`;
  },
};
