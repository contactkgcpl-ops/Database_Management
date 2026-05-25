import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Database, Lock, Mail, ShieldAlert } from "lucide-react";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="salvin-login-container">
      {/* Dynamic Background Elements */}
      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="bg-orb orb-3"></div>

      <div className="login-card-wrapper">
        <form className="login-card" onSubmit={submit} autoComplete="off">
          {/* Logo and Branding header */}
          <div className="brand-header">
            <div className="logo-badge">
              <Database size={28} className="logo-icon" />
            </div>
            <h2>Salvin India</h2>
            <p className="subtext">Marketing & Sales Portal</p>
          </div>

          <div className="input-group-container">
            {/* Email Field */}
            <div className="input-field-wrap">
              <label htmlFor="email">Email Address</label>
              <div className="input-inner">
                <Mail size={16} className="input-icon" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="off"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="input-field-wrap">
              <label htmlFor="password">Password</label>
              <div className="input-inner">
                <Lock size={16} className="input-icon" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Error Message banner */}
          {error && (
            <div className="error-banner">
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit action */}
          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? "Verifying Credentials..." : "Sign In to Workspace"}
          </button>
        </form>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        /* Google Fonts Import for modern premium typography */
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        .salvin-login-container {
          font-family: 'Plus Jakarta Sans', sans-serif;
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at center, #0f2723 0%, #06110f 100%);
          position: relative;
          overflow: hidden;
          padding: 20px;
          box-sizing: border-box;
        }

        /* Abstract Animated Orbs */
        .bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.45;
          z-index: 0;
          animation: floatOrb 25s infinite alternate ease-in-out;
        }
        .orb-1 {
          width: 400px;
          height: 400px;
          background: #176b5b;
          top: -100px;
          left: -100px;
        }
        .orb-2 {
          width: 500px;
          height: 500px;
          background: #14b8a6;
          bottom: -150px;
          right: -100px;
          animation-delay: -5s;
        }
        .orb-3 {
          width: 300px;
          height: 300px;
          background: #0d9488;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -12s;
        }

        @keyframes floatOrb {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(60px, -40px) scale(1.15); }
          100% { transform: translate(-30px, 50px) scale(0.9); }
        }

        .login-card-wrapper {
          width: 100%;
          max-width: 440px;
          z-index: 5;
          animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Glassmorphic card styling */
        .login-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 45px 40px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4), 
                      inset 0 1px 0 rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        /* Logo and branding styling */
        .brand-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .logo-badge {
          width: 60px;
          height: 60px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(23, 107, 91, 0.3), rgba(20, 184, 166, 0.1));
          border: 1px solid rgba(23, 107, 91, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
          box-shadow: 0 8px 20px rgba(23, 107, 91, 0.25);
        }
        .logo-icon {
          color: #2dd4bf;
          filter: drop-shadow(0 0 8px rgba(45, 212, 191, 0.5));
        }
        .brand-header h2 {
          font-family: 'Outfit', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .brand-header h3 {
          font-family: 'Outfit', sans-serif;
          font-size: 16px;
          font-weight: 500;
          color: #2dd4bf;
          margin: 4px 0 0 0;
          letter-spacing: 3px;
          text-transform: uppercase;
        }
        .brand-header .subtext {
          font-size: 12px;
          color: #94a3b8;
          margin: 12px 0 0 0;
          font-weight: 500;
        }

        /* Inputs container and input design */
        .input-group-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .input-field-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .input-field-wrap label {
          font-size: 12px;
          font-weight: 700;
          color: #ccd7d5;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .input-inner {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 14px;
          color: #64748b;
          transition: color 0.25s ease;
          pointer-events: none;
        }
        .input-inner input {
          width: 100%;
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 12px 16px 12px 42px;
          color: #ffffff;
          font-size: 14px;
          font-weight: 500;
          outline: none;
          transition: all 0.25s ease;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
        }
        .input-inner input::placeholder {
          color: #475569;
        }
        .input-inner input:focus {
          border-color: #2dd4bf;
          background: rgba(15, 23, 42, 0.6);
          box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.12),
                      inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .input-inner input:focus + .input-icon,
        .input-inner input:focus-within + .input-icon {
          color: #2dd4bf;
        }

        /* Error notification badge */
        .error-banner {
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.25);
          border-radius: 10px;
          padding: 10px 14px;
          color: #f87171;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: shakeError 0.35s ease;
        }
        @keyframes shakeError {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        /* Submit Button Styling */
        .login-submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #176b5b 0%, #0d9488 100%);
          border: 1px solid rgba(45, 212, 191, 0.15);
          border-radius: 12px;
          padding: 14px;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 15px rgba(23, 107, 91, 0.3);
          margin-top: 10px;
        }
        .login-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(23, 107, 91, 0.45);
          background: linear-gradient(135deg, #1f7d6b 0%, #0f9f92 100%);
        }
        .login-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .login-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
        }
      `}} />
    </main>
  );
}
