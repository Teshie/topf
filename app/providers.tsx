"use client";

import { Suspense, useEffect } from "react";
import { CounterProvider } from "./store/store";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CounterProvider>
        {children}
        <Toaster position="top-left" reverseOrder={false} />
      </CounterProvider>
    </Suspense>
  );
}
