/**
 * Landing.tsx
 *
 * Public-facing landing page for CivicLens.
 *
 * Structure:
 *  - Navbar       : Floating pill nav with desktop links + mobile hamburger dropdown.
 *  - Hero         : Animated logo, headline, tagline, and primary CTA button.
 *  - Features     : Three feature cards (Capture / AI Analysis / Track & Resolve).
 *  - CTA          : Secondary call-to-action box.
 *  - Footer       : Brand description, nav links, and copyright badge.
 *
 * Styling approach:
 *  All styles are injected via a <style> tag in a useEffect so they are fully
 *  scoped to the .cl-landing namespace and cleaned up on unmount. This prevents
 *  landing styles from leaking into the main app shell.
 *
 * Props:
 *  - onEnter : Called when the user navigates into the app. Accepts an optional
 *              page key ("report" | "map" | "board" | "ward") to deep-link
 *              directly to a specific page. Defaults to "report".
 */

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Navigation items shared between the desktop nav, mobile dropdown, and footer.
 * Single source of truth — adding a route here propagates to all three.
 */
const NAV_ITEMS = [
  { label: "Report Issue", page: "report" },
  { label: "Map View",     page: "map" },
  { label: "Priority Board", page: "board" },
  { label: "Ward Health",  page: "ward" },
] as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/**
 * All landing-page CSS is injected at mount and removed at unmount.
 * Scoped under .cl-landing to avoid collisions with the main app's Tailwind classes.
 */
const LANDING_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

  .cl-landing * { margin: 0; padding: 0; box-sizing: border-box; }
  .cl-landing { font-family: 'Inter', sans-serif; background: #fff; color: #0F172A; overflow-x: hidden; }
  .cl-landing a { text-decoration: none; cursor: pointer; }
  .cl-landing img { display: block; max-width: 100%; }

  /* ── Navbar ── */
  .cl-navbar {
    width: 94%;
    max-width: 1320px;
    margin: 24px auto;
    background: #fff;
    border-radius: 22px;
    padding: 18px 28px;
    border: 1px solid #E8EDF5;
    box-shadow: 0 15px 40px rgba(15,23,42,.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 100;
  }

  .cl-brand { display: flex; align-items: center; gap: 12px; cursor: pointer; }
  .cl-nav-logo { width: 52px; }
  .cl-brand-name { font-size: 1.9rem; font-weight: 800; line-height: 1; }
  .cl-blue { color: #2563EB; }
  .cl-cyan { color: #18C7D8; }

  .cl-nav-links { display: flex; align-items: center; gap: 32px; list-style: none; }

  .cl-nav-link {
    color: #64748B;
    font-weight: 600;
    font-size: 0.95rem;
    position: relative;
    transition: color 0.3s;
    cursor: pointer;
    background: none;
    border: none;
    font-family: 'Inter', sans-serif;
    padding: 0;
  }

  .cl-nav-link::after {
    content: "";
    position: absolute;
    bottom: -8px; left: 0;
    width: 0; height: 3px;
    background: #2563EB;
    border-radius: 30px;
    transition: width 0.3s;
  }

  .cl-nav-link:hover { color: #2563EB; }
  .cl-nav-link:hover::after,
  .cl-nav-link.active::after { width: 100%; }
  .cl-nav-link.active { color: #2563EB; }

  /* ── Hero ── */
  .cl-hero {
    position: relative;
    overflow: hidden;
    background: #fff;
    padding: 70px 0 250px;
  }

  .cl-hero-container {
    max-width: 1320px;
    margin: 0 auto;
    padding: 0 24px;
    position: relative;
    z-index: 5;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 40px;
  }

  .cl-hero-image { display: flex; justify-content: center; }

  .cl-hero-logo {
    width: 430px;
    animation: clFloatLogo 5s ease-in-out infinite;
    user-select: none;
  }

  @keyframes clFloatLogo {
    0%   { transform: translateY(0); }
    50%  { transform: translateY(-10px); }
    100% { transform: translateY(0); }
  }

  .cl-hero-content { padding-left: 45px; }

  .cl-hero-badge {
    display: inline-block;
    background: #EEF5FF;
    color: #2563EB;
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 700;
    margin-bottom: 24px;
  }

  .cl-hero-content h1 {
    font-size: 5rem;
    font-weight: 900;
    line-height: 1.05;
    margin-bottom: 24px;
  }

  .cl-hero-content p {
    max-width: 560px;
    color: #64748B;
    line-height: 1.9;
    font-size: 1.08rem;
    margin-bottom: 42px;
  }

  /* ── Buttons ── */
  .cl-report-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 18px 40px;
    border-radius: 999px;
    background: linear-gradient(90deg, #1EC8D8, #2563EB);
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    box-shadow: 0 18px 40px rgba(37,99,235,.18);
    transition: all 0.35s;
    border: none;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
  }

  .cl-report-btn:hover { transform: translateY(-5px); color: #fff; }
  .cl-report-btn:active { transform: scale(0.97); }
  .cl-btn-arrow { transition: transform 0.3s; display: inline-block; }
  .cl-report-btn:hover .cl-btn-arrow { transform: translateX(6px); }

  /* ── Skyline ── */
  .cl-skyline {
    position: absolute;
    left: 0; bottom: 0;
    width: 100%; height: 260px;
    object-fit: cover;
    object-position: bottom center;
    opacity: 0.92;
    z-index: 1;
  }

  /* Fade the skyline into the white background */
  .cl-hero::after {
    content: "";
    position: absolute;
    left: 0; bottom: 0;
    width: 100%; height: 110px;
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,.45), #fff);
    z-index: 2;
  }

  /* ── Features ── */
  .cl-features {
    position: relative;
    z-index: 20;
    margin-top: 40px;
    padding: 0 0 70px;
    background: #fff;
  }

  .cl-features-container {
    max-width: 1320px;
    margin: 0 auto;
    padding: 0 24px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  .cl-feature-card {
    background: #fff;
    border: 1px solid #E8EDF5;
    border-radius: 26px;
    padding: 48px 36px;
    text-align: center;
    transition: all 0.35s ease;
    box-shadow: 0 15px 45px rgba(15,23,42,.07);
  }

  .cl-feature-card:hover {
    transform: translateY(-8px);
    border-color: #2563EB;
    box-shadow: 0 28px 60px rgba(15,23,42,.12);
  }

  .cl-feature-icon {
    width: 86px; height: 86px;
    margin: 0 auto 28px;
    border-radius: 24px;
    background: #EEF5FF;
    color: #2563EB;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 2rem;
    transition: all 0.35s;
  }

  .cl-feature-card:hover .cl-feature-icon {
    background: #2563EB;
    color: #fff;
    transform: rotate(-6deg) scale(1.08);
  }

  .cl-feature-card h3 { font-size: 1.8rem; font-weight: 800; color: #0F172A; margin-bottom: 16px; }
  .cl-feature-card p  { color: #64748B; line-height: 1.9; font-size: 1rem; margin: 0; }

  /* ── CTA ── */
  .cl-cta { background: #fff; padding: 35px 0 90px; }
  .cl-cta-container { max-width: 1320px; margin: 0 auto; padding: 0 24px; }

  .cl-cta-box {
    background: linear-gradient(180deg, #FCFDFF, #F8FBFF);
    border: 1px solid #E8EDF5;
    border-radius: 30px;
    padding: 55px 60px;
    text-align: center;
    box-shadow: 0 18px 50px rgba(15,23,42,.06);
  }

  .cl-cta-box h2 { font-size: 2.7rem; font-weight: 800; color: #0F172A; margin: 20px 0 18px; }
  .cl-cta-box p  { max-width: 620px; margin: 0 auto 35px; color: #64748B; line-height: 1.8; font-size: 1.05rem; }

  /* ── Footer ── */
  .cl-footer { padding: 60px 0 30px; background: #fff; border-top: 1px solid #E8EDF5; }
  .cl-footer-container { max-width: 1320px; margin: 0 auto; padding: 0 24px; }
  .cl-footer-grid { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 40px; }
  .cl-footer-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .cl-footer p { color: #64748B; line-height: 1.8; }
  .cl-footer-links { display: flex; justify-content: flex-end; gap: 28px; flex-wrap: wrap; }
  .cl-footer-links a { color: #64748B; font-weight: 600; transition: color 0.3s; }
  .cl-footer-links a:hover { color: #2563EB; }
  .cl-footer-hr { margin: 30px 0 20px; border: none; border-top: 1px solid #E8EDF5; }
  .cl-footer-bottom { text-align: center; color: #94A3B8; font-size: 0.85rem; }

  /* ── Mobile hamburger ── */
  .cl-hamburger {
    display: none;
    background: none;
    border: none;
    font-size: 24px;
    color: #64748B;
    cursor: pointer;
    padding: 4px 8px;
    z-index: 110;
  }

  .cl-mobile-dropdown {
    position: absolute;
    top: calc(100% + 12px);
    left: 0; right: 0;
    background: #fff;
    border: 1px solid #E8EDF5;
    border-radius: 16px;
    padding: 12px;
    box-shadow: 0 10px 30px rgba(15,23,42,.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 105;
  }

  .cl-dropdown-link {
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #64748B;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    text-align: left;
    background: none;
    border: none;
    font-family: 'Inter', sans-serif;
    width: 100%;
  }

  .cl-dropdown-link:hover { background: #F1F5F9; color: #2563EB; }

  /* ── Responsive ── */
  @media (max-width: 1024px) {
    .cl-nav-links { gap: 16px; }
    .cl-nav-link  { font-size: 13px; }
  }

  @media (max-width: 992px) {
    .cl-hero-container      { grid-template-columns: 1fr; text-align: center; }
    .cl-hero-content        { padding-left: 0; }
    .cl-hero-logo           { width: 320px; }
    .cl-features-container  { grid-template-columns: 1fr; }
    .cl-footer-grid         { grid-template-columns: 1fr; text-align: center; }
    .cl-footer-links        { justify-content: center; }
  }

  @media (max-width: 768px) {
    .cl-nav-links   { display: none; }
    .cl-hamburger   { display: block; }
    .cl-hero        { padding: 45px 0 180px; }
    .cl-hero-logo   { width: 240px; }
    .cl-hero-content h1 { font-size: 3rem; }
    .cl-skyline     { height: 180px; }
    .cl-cta-box     { padding: 40px 25px; }
    .cl-cta-box h2  { font-size: 2rem; }
    .cl-report-btn  { width: 100%; max-width: 100%; }
  }

  @media (min-width: 768px) and (max-width: 1024px) {
    .cl-hero-logo  { max-width: 200px !important; margin: 0 auto; }
    .cl-report-btn { width: 100% !important; max-width: 280px !important; margin: 0 auto !important; display: inline-flex !important; }
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LandingProps {
  onEnter: (page?: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Landing({ onEnter }: LandingProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Inject scoped styles and Bootstrap Icons on mount; clean up on unmount
  useEffect(() => {
    // Bootstrap Icons CDN stylesheet
    const link = document.createElement("link");
    link.id = "bootstrap-icons-css";
    link.rel = "stylesheet";
    link.href =
      "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css";
    document.head.appendChild(link);

    // Scoped landing-page styles
    const style = document.createElement("style");
    style.id = "landing-styles";
    style.innerHTML = LANDING_STYLES;
    document.head.appendChild(style);

    return () => {
      document.getElementById("landing-styles")?.remove();
      document.getElementById("bootstrap-icons-css")?.remove();
    };
  }, []);

  /** Navigates into the app and closes the mobile menu. */
  const handleNav = (page?: string) => {
    onEnter(page);
    setMobileMenuOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="cl-landing">

      {/* ════════════════════════════════════════
          NAVBAR
      ════════════════════════════════════════ */}
      <nav className="cl-navbar" role="navigation" aria-label="Main navigation">
        {/* Brand */}
        <div className="cl-brand" onClick={() => handleNav()} role="button" aria-label="CivicLens home">
          <img src="/landing_logo.png" className="cl-nav-logo" alt="CivicLens logo" />
          <span className="cl-brand-name">
            <span className="cl-blue">Civic</span>
            <span className="cl-cyan">Lens</span>
          </span>
        </div>

        {/* Desktop links */}
        <ul className="cl-nav-links" role="list">
          <li>
            <button className="cl-nav-link active" onClick={() => handleNav()} aria-current="page">
              Home
            </button>
          </li>
          {NAV_ITEMS.map((item) => (
            <li key={item.page}>
              <button className="cl-nav-link" onClick={() => handleNav(item.page)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Mobile hamburger */}
        <button
          className="cl-hamburger"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? "✕" : "☰"}
        </button>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="cl-mobile-dropdown" role="menu">
            <button className="cl-dropdown-link" role="menuitem" onClick={() => handleNav()}>
              Home
            </button>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.page}
                className="cl-dropdown-link"
                role="menuitem"
                onClick={() => handleNav(item.page)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* ════════════════════════════════════════
          HERO
      ════════════════════════════════════════ */}
      <section className="cl-hero" aria-labelledby="hero-heading">
        <div className="cl-hero-container">
          <div className="cl-hero-image">
            <img src="/landing_logo.png" className="cl-hero-logo" alt="CivicLens AI illustration" />
          </div>
          <div className="cl-hero-content">
            <span className="cl-hero-badge">Powered by Google Gemini AI</span>
            <h1 id="hero-heading">
              <span className="cl-blue">See.</span>{" "}
              <span className="cl-cyan">Report.</span>{" "}
              Resolve.
            </h1>
            <p>
              Transform everyday civic reporting into real action.
              Simply upload a photo, let Gemini AI identify and prioritize the issue,
              and follow every report from submission to resolution through a transparent,
              intelligent platform built for smarter cities.
            </p>
            <button className="cl-report-btn" onClick={() => handleNav("report")}>
              Report an Issue{" "}
              <i className="bi bi-arrow-right" style={{ fontSize: "16px", marginLeft: "8px" }} />
            </button>
          </div>
        </div>
        <img src="/cityskyline.png" className="cl-skyline" alt="City skyline illustration" />
      </section>

      {/* ════════════════════════════════════════
          FEATURES
      ════════════════════════════════════════ */}
      <section className="cl-features" aria-labelledby="features-heading">
        <div className="cl-features-container">
          <div className="cl-feature-card">
            <div className="cl-feature-icon" aria-hidden="true">
              <i className="bi bi-camera-fill" />
            </div>
            <h3>Capture</h3>
            <p>
              Snap a photo of potholes, damaged roads, overflowing garbage,
              broken streetlights, or any civic issue in just a few seconds.
            </p>
          </div>
          <div className="cl-feature-card">
            <div className="cl-feature-icon" aria-hidden="true">
              <i className="bi bi-stars" />
            </div>
            <h3>AI Analysis</h3>
            <p>
              Gemini AI instantly identifies the issue, estimates its severity,
              detects duplicates, and prepares an actionable report.
            </p>
          </div>
          <div className="cl-feature-card">
            <div className="cl-feature-icon" aria-hidden="true">
              <i className="bi bi-check-circle-fill" />
            </div>
            <h3>Track &amp; Resolve</h3>
            <p>
              Monitor every report with transparent status updates,
              live progress tracking, and verified community resolutions.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          CTA
      ════════════════════════════════════════ */}
      <section className="cl-cta">
        <div className="cl-cta-container">
          <div className="cl-cta-box">
            <span className="cl-hero-badge">Smarter Cities Start With You</span>
            <h2>Every Report Creates Real Change.</h2>
            <p>
              CivicLens empowers citizens and local authorities to work together
              using AI-powered reporting, intelligent prioritization, and
              transparent tracking — making neighbourhoods cleaner, safer,
              and more responsive.
            </p>
            <button className="cl-report-btn" onClick={() => handleNav("report")}>
              Report an Issue{" "}
              <i className="bi bi-arrow-right" style={{ fontSize: "16px", marginLeft: "8px" }} />
            </button>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
      <footer className="cl-footer">
        <div className="cl-footer-container">
          <div className="cl-footer-grid">
            {/* Brand blurb */}
            <div>
              <div className="cl-footer-brand">
                <img src="/landing_logo.png" className="cl-nav-logo" alt="CivicLens logo" />
                <span className="cl-brand-name">
                  <span className="cl-blue">Civic</span>
                  <span className="cl-cyan">Lens</span>
                </span>
              </div>
              <p>
                AI-powered civic issue reporting built with Google Gemini,
                helping citizens and authorities build cleaner,
                smarter, and more connected cities.
              </p>
            </div>

            {/* Footer nav links */}
            <nav className="cl-footer-links" aria-label="Footer navigation">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Home
              </a>
              {NAV_ITEMS.map((item) => (
                <a key={item.page} href="#" onClick={(e) => { e.preventDefault(); handleNav(item.page); }}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <hr className="cl-footer-hr" />

          {/* Copyright */}
          <div
            className="cl-footer-bottom"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <span>© 2026 CivicLens • Built for the Coding Ninjas × Google for Developers Hackathon</span>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#EEF5FF",
                border: "1px solid #2563EB",
                borderRadius: "999px",
                padding: "4px 12px",
                fontSize: "11px",
                fontWeight: 600,
                color: "#2563EB",
              }}
            >
              <span>✦</span>
              <span>Built with Google Gemini API</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}