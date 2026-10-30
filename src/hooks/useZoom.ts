import { useState, useEffect, useCallback } from "react";

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 1.1; // Default slightly larger for comfortable readability

export function useZoom() {
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("openlearn_zoom_level");
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= MIN_ZOOM && val <= MAX_ZOOM) {
          return val;
        }
      }
    }
    return DEFAULT_ZOOM;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Apply zoom to document.documentElement
  useEffect(() => {
    if (typeof document !== "undefined") {
      // Apply CSS zoom
      (document.documentElement.style as any).zoom = zoomLevel.toString();
      localStorage.setItem("openlearn_zoom_level", zoomLevel.toFixed(1));
    }
  }, [zoomLevel]);

  const showToast = useCallback((level: number) => {
    const percent = Math.round(level * 100);
    setToastMessage(`界面缩放: ${percent}% (Ctrl+0 重置)`);
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.min(MAX_ZOOM, +(prev + ZOOM_STEP).toFixed(1));
      showToast(next);
      return next;
    });
  }, [showToast]);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(MIN_ZOOM, +(prev - ZOOM_STEP).toFixed(1));
      showToast(next);
      return next;
    });
  }, [showToast]);

  const resetZoom = useCallback(() => {
    setZoomLevel(1.0);
    showToast(1.0);
  }, [showToast]);

  // Global keydown shortcut listener for Ctrl/Cmd + Plus / Minus / Zero
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom In: Ctrl + Plus, Ctrl + Equal, NumpadAdd
        if (
          e.key === "=" ||
          e.key === "+" ||
          e.code === "Equal" ||
          e.code === "NumpadAdd"
        ) {
          e.preventDefault();
          zoomIn();
        }
        // Zoom Out: Ctrl + Minus, NumpadSubtract
        else if (
          e.key === "-" ||
          e.code === "Minus" ||
          e.code === "NumpadSubtract"
        ) {
          e.preventDefault();
          zoomOut();
        }
        // Reset Zoom: Ctrl + 0, Numpad0
        else if (
          e.key === "0" ||
          e.code === "Digit0" ||
          e.code === "Numpad0"
        ) {
          e.preventDefault();
          resetZoom();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  return {
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    toastMessage,
  };
}
