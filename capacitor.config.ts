import type { CapacitorConfig } from "@capacitor/cli";

// The Next.js app is a static export (`next build` -> out/). Capacitor bundles
// that folder INSIDE the APK, so the installed app starts instantly and never
// depends on a separately hosted web server. All data, auth, realtime and AI
// calls go straight to the Base44 backend over HTTPS.
const config: CapacitorConfig = {
  appId: "com.daviekumi.agentmobile",
  appName: "Agent Mobile",
  webDir: "out",

  server: {
    androidScheme: "https",
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#141419",
      androidSplashResourceName: "splash",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: false,
    },
    Keyboard: { resize: "native", style: "dark", resizeOnFullScreen: true },
  },
};

export default config;
