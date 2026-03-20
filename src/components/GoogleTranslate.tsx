import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google: any;
    __oneMealGoogleTranslateReady?: Promise<void>;
    __oneMealGoogleTranslateResolve?: () => void;
    __oneMealGoogleTranslateInit?: () => void;
  }
}

const GOOGLE_TRANSLATE_SCRIPT_ID = "google-translate-script";
const GOOGLE_TRANSLATE_CALLBACK = "__oneMealGoogleTranslateInit";

const loadGoogleTranslate = () => {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.google?.translate?.TranslateElement) {
    return Promise.resolve();
  }

  if (!window.__oneMealGoogleTranslateReady) {
    window.__oneMealGoogleTranslateReady = new Promise<void>((resolve, reject) => {
      window.__oneMealGoogleTranslateResolve = resolve;
      window[GOOGLE_TRANSLATE_CALLBACK] = () => {
        window.__oneMealGoogleTranslateResolve?.();
      };

      const existingScript = document.getElementById(GOOGLE_TRANSLATE_SCRIPT_ID) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Google Translate failed to load.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = GOOGLE_TRANSLATE_SCRIPT_ID;
      script.src = `https://translate.google.com/translate_a/element.js?cb=${GOOGLE_TRANSLATE_CALLBACK}`;
      script.async = true;
      script.onerror = () => reject(new Error("Google Translate failed to load."));
      document.body.appendChild(script);
    });
  }

  return window.__oneMealGoogleTranslateReady;
};

const GoogleTranslate = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elementIdRef = useRef(`google_translate_${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;

    const mountTranslate = async () => {
      try {
        await loadGoogleTranslate();
        if (cancelled || !containerRef.current || !window.google?.translate?.TranslateElement) {
          return;
        }

        if (containerRef.current.dataset.initialized === "true") {
          return;
        }

        containerRef.current.innerHTML = "";
        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages: "en,hi,mr",
            layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
            autoDisplay: false,
          },
          elementIdRef.current
        );
        containerRef.current.dataset.initialized = "true";
      } catch (error) {
        console.error("Google Translate init error:", error);
      }
    };

    mountTranslate();

    return () => {
      cancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        delete containerRef.current.dataset.initialized;
      }
    };
  }, []);

  return (
    <div className="google-translate-host notranslate" translate="no">
      <div ref={containerRef} id={elementIdRef.current} />
    </div>
  );
};

export default GoogleTranslate;
