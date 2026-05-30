import React, { useState, useEffect } from "react";

export function GlobalLoader() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleLoading = (e) => {
      setLoading(!!e.detail?.loading);
    };
    window.addEventListener("erp:loading", handleLoading);
    return () => window.removeEventListener("erp:loading", handleLoading);
  }, []);

  if (!loading) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(255, 255, 255, 0.4)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 999999,
      pointerEvents: "auto"
    }}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        backgroundColor: "white",
        padding: "20px 30px",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
        border: "1px solid #cbd5e1"
      }}>
        <div style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          border: "3px solid #cbd5e1",
          borderTopColor: "#176b5b",
          animation: "global-spin 1s linear infinite"
        }} />
        <span style={{
          fontSize: "13px",
          fontWeight: "600",
          color: "#334155",
          letterSpacing: "0.02em"
        }}>
          Processing...
        </span>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes global-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      ` }} />
    </div>
  );
}
