import { useState } from 'react';
import { ArrowRight, CheckCircle2, Layers, ScanLine, ShieldAlert, Sliders } from 'lucide-react';
import { MVTEC_CATEGORIES } from '../types/prometheus';
import type { AppPage } from '../components/Layout';

const HERO_IMAGE = '/src/assets/images/hero_industrial_vision_1795589398450.jpg';

interface LandingPageProps {
  onNavigate: (page: AppPage) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-800/80 bg-[#070B14]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            PROMETHEUS-X
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
            <a
              href="#problem"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Problem
            </a>
            <a
              href="#capabilities"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#pipeline"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Dashboard
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-mono text-cyan-400 tracking-wide mb-4">
                Open-Set Industrial Quality Inspection · Normal-Pattern Learning
              </p>
              <h1
                className="font-bold tracking-tight text-slate-50 leading-[1.08] mb-6"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.6rem)',
                  textWrap: 'balance',
                }}
              >
                Detect the Defect Your Model Has Never Seen.
              </h1>
              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl mb-8">
                Intelligent industrial anomaly detection powered by normal-pattern learning, visual
                localization, and adaptive distribution monitoring.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate('studio')}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <span>Start AI Inspection</span>
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className="px-5 py-3 text-sm font-medium text-slate-200 border border-slate-700 hover:border-slate-500 hover:bg-slate-800/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Open Dashboard
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-[#0F1624] min-h-[280px] lg:min-h-[380px]">
                {!heroImgFailed ? (
                  <img
                    src={HERO_IMAGE}
                    alt="Automated optical quality inspection station scanning CNC-machined titanium aerospace gear components under calibrated blue optical measurement light"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#0F1624] to-[#070B14] text-center">
                    <ScanLine className="w-12 h-12 text-cyan-400 mb-3" />
                    <p className="text-sm font-medium text-slate-200">
                      Optical Metrology Inspection Cell
                    </p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#070B14]/95 via-[#070B14]/65 to-transparent p-5">
                  <p className="text-xs font-mono text-slate-300 truncate">
                    PatchCore Coreset · Pixel Localization · Mahalanobis Drift Monitor
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column Architectural Specification Strip below hero split */}
          <div className="mt-14 pt-8 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <p className="text-xs text-slate-400 mb-1">Training Paradigm</p>
              <p className="text-lg font-semibold text-slate-100">Normal-Only Baseline</p>
              <p className="text-xs text-slate-400 mt-1">
                No exhaustive defect catalog required before deployment
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Spatial Output</p>
              <p className="text-lg font-semibold text-slate-100">Pixel-Level Heatmaps</p>
              <p className="text-xs text-slate-400 mt-1">
                Thermal maps, contour overlays, masks & bounding boxes
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Reliability Control</p>
              <p className="text-lg font-semibold text-slate-100">Platt Calibration & ECE</p>
              <p className="text-xs text-slate-400 mt-1">
                Explicitly distinguishes calibrated vs uncalibrated scores
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Production Guard</p>
              <p className="text-lg font-semibold text-slate-100">Distribution Shift Monitor</p>
              <p className="text-xs text-slate-400 mt-1">
                Flags lighting, optics, or material drift separately from defects
              </p>
            </div>
          </div>
        </section>

        {/* Problem Statement Section */}
        <section id="problem" className="border-t border-slate-800/80 bg-[#0A101D]">
          <div className="max-w-7xl mx-auto px-6 py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5">
                <p className="text-xs font-mono text-cyan-400 mb-3">The Industrial Problem</p>
                <h2
                  className="text-2xl sm:text-3xl font-bold text-slate-50 leading-tight mb-4"
                  style={{ textWrap: 'balance' }}
                >
                  Why closed-set defect classifiers miss rare production failures.
                </h2>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  High-volume manufacturing lines inspect thousands of components daily. Traditional
                  supervised detectors only recognize defect classes seen during training—leaving
                  novel cracks, oxidation scars, tooling burrs, or bent leads undetected until field
                  failure.
                </p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl bg-[#0F1624] border border-slate-800">
                  <p className="text-xs font-mono text-slate-400 mb-2">Traditional Closed-Set Vision</p>
                  <h3 className="text-base font-semibold text-slate-100 mb-3">
                    Requires labeled examples of every defect
                  </h3>
                  <ul className="space-y-2.5 text-sm text-slate-400">
                    <li>Fails silently when novel defect modes appear on the line</li>
                    <li>Outputs uncalibrated softmax probabilities under domain shift</li>
                    <li>Conflates camera or lighting drift with actual product damage</li>
                    <li>Lacks human-in-the-loop false-positive triage workflow</li>
                  </ul>
                </div>

                <div className="p-6 rounded-xl bg-[#0F1624] border border-cyan-500/30">
                  <p className="text-xs font-mono text-cyan-400 mb-2">PROMETHEUS-X Open-Set Paradigm</p>
                  <h3 className="text-base font-semibold text-slate-100 mb-3">
                    Models normal product geometry and texture
                  </h3>
                  <ul className="space-y-2.5 text-sm text-slate-300">
                    <li>Learns multi-scale normal patch manifolds via coreset memory banks</li>
                    <li>Localizes exact pixel deviations with heatmaps and defect masks</li>
                    <li>Routes borderline or shifted specimens to human verification</li>
                    <li>Tracks false positives without blind unverified auto-retraining</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Capabilities — Asymmetric Bento Grid */}
        <section id="capabilities" className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-mono text-cyan-400 mb-3">Core Capabilities</p>
            <h2
              className="text-2xl sm:text-3xl font-bold text-slate-50 leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Six integrated modules built for real quality engineering workflows.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 p-7 rounded-xl bg-[#0F1624] border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">
                  01. Open-Set Normal-Pattern Detection
                </h3>
                <Layers className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Extracts locally-aware multi-scale RGB, opponent chromatic, Sobel orientation, and
                Laplacian texture embeddings across a dense spatial lattice. Builds a PatchCore
                greedy coreset memory bank strictly from normal reference products and computes
                k-nearest patch deviation scores against unseen anomalies.
              </p>
              <p className="text-xs font-mono text-slate-400">
                Outputs: PASS · DEFECT · REVIEW (Uncertain or Shifted)
              </p>
            </div>

            <div className="p-7 rounded-xl bg-[#0F1624] border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">02. Defect Localization</h3>
                <ScanLine className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Upsamples and Gaussian-smooths patch deviation fields into thermal heatmaps,
                contour-traced overlays, binary segmentation masks, and connected-component bounding
                boxes.
              </p>
            </div>

            <div className="p-7 rounded-xl bg-[#0F1624] border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">03. Severity Estimation</h3>
                <Sliders className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Categorizes visual abnormalities into Low, Medium, or High estimated inspection
                tiers using affected area percentage and peak intensity with configurable cutoffs.
              </p>
            </div>

            <div className="p-7 rounded-xl bg-[#0F1624] border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">04. Confidence Calibration</h3>
                <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Fits Platt logistic calibration on held-out validation splits, tracks Expected
                Calibration Error (ECE), and labels uncalibrated categories honestly instead of
                faking percentages.
              </p>
            </div>

            <div className="p-7 rounded-xl bg-[#0F1624] border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">
                  05. Distribution Shift Monitoring
                </h3>
                <ShieldAlert className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Measures illumination, color balance, contrast, and edge-energy drift against
                reference baselines so camera or lighting shifts are never confused with defects.
              </p>
            </div>

            <div className="md:col-span-3 p-7 rounded-xl bg-[#0F1624] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="max-w-3xl">
                <h3 className="text-lg font-semibold text-slate-100 mb-2">
                  06. Human-in-the-Loop False-Positive Management
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Routes flagged and uncertain inspections into a structured Human Review Center
                  where quality engineers inspect heatmaps, approve normal parts, confirm defects,
                  mark false positives, and archive notes without blind unverified auto-retraining.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('review')}
                className="px-4 py-2 text-xs font-medium text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/10 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start md:self-center"
              >
                Open Review Center
              </button>
            </div>
          </div>
        </section>

        {/* How The AI Works — 4-Step Pipeline */}
        <section id="pipeline" className="border-t border-slate-800/80 bg-[#0A101D]">
          <div className="max-w-7xl mx-auto px-6 py-20">
            <div className="max-w-2xl mb-12">
              <p className="text-xs font-mono text-cyan-400 mb-3">Inference Architecture</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-50">
                How every product image moves through PROMETHEUS-X
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  step: '01',
                  title: 'Image Validation & Preprocessing',
                  body: 'Verifies MIME type and decoded pixel geometry, standardizes resolution, and extracts 20-D multi-scale patch descriptors across a 32×32 spatial lattice.',
                },
                {
                  step: '02',
                  title: 'Coreset Nearest-Neighbor Scoring',
                  body: 'Matches every patch against the category normal coreset memory bank and spatial tolerance profile to detect unseen surface or structural deviations.',
                },
                {
                  step: '03',
                  title: 'Localization & Severity Extraction',
                  body: 'Generates bilinearly upsampled heatmaps, alpha-blended contour overlays, binary masks, and connected-component area & bounding-box metrics.',
                },
                {
                  step: '04',
                  title: 'Calibration, Drift & Triage',
                  body: 'Evaluates Mahalanobis imaging drift, applies held-out Platt calibration when available, and routes borderline cases to the Human Review Center.',
                },
              ].map((stage) => (
                <div
                  key={stage.step}
                  className="p-6 rounded-xl bg-[#0F1624] border border-slate-800 flex flex-col"
                >
                  <span className="font-mono text-xs text-cyan-400 mb-3">Stage {stage.step}</span>
                  <h3 className="text-base font-semibold text-slate-100 mb-2">{stage.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{stage.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Technology Stack & MVTec AD Category Support */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-6">
              <p className="text-xs font-mono text-cyan-400 mb-3">Supported Industrial Categories</p>
              <h2 className="text-2xl font-bold text-slate-50 mb-4">
                Built around the 15 MVTec AD industrial inspection benchmarks
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Train normal-pattern baselines on custom production images or evaluate directly on
                machined components, electronics, ceramics, textiles, and precision fasteners.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-y-2.5 gap-x-4 text-sm text-slate-300 border-t border-slate-800 pt-5">
                {MVTEC_CATEGORIES.map((cat) => (
                  <span key={cat} className="truncate">
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6">
              <p className="text-xs font-mono text-cyan-400 mb-3">Platform Stack</p>
              <h2 className="text-2xl font-bold text-slate-50 mb-4">
                Modular full-stack architecture ready for line deployment
              </h2>
              <div className="divide-y divide-slate-800 border-t border-b border-slate-800 text-sm">
                <div className="py-3.5 flex items-baseline justify-between gap-4">
                  <span className="text-slate-400">Frontend Console</span>
                  <span className="text-slate-200 text-right">
                    React · Vite · Tailwind CSS · Recharts · Axios
                  </span>
                </div>
                <div className="py-3.5 flex items-baseline justify-between gap-4">
                  <span className="text-slate-400">Vision & ML Engine</span>
                  <span className="text-slate-200 text-right">
                    PatchCore Coreset · EfficientAD-Lite · Sharp Pixel Pipeline · Platt ECE
                  </span>
                </div>
                <div className="py-3.5 flex items-baseline justify-between gap-4">
                  <span className="text-slate-400">API & Persistence</span>
                  <span className="text-slate-200 text-right">
                    REST API · SQLite WAL Storage · JSON Inspection Reports
                  </span>
                </div>
                <div className="py-3.5 flex items-baseline justify-between gap-4">
                  <span className="text-slate-400">Security & Reliability</span>
                  <span className="text-slate-200 text-right">
                    MIME & Pixel Validation · Path-Confined Storage · Parameterized SQL
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Conversion Strip */}
          <div className="mt-16 p-8 sm:p-10 rounded-xl bg-[#0F1624] border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-50 mb-2">
                Ready to inspect a product image?
              </h2>
              <p className="text-sm text-slate-400 max-w-xl">
                Upload a JPG or PNG manufacturing photo or run one of the calibrated industrial
                specimens through the live PatchCore pipeline.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>Launch Inspection Studio</span>
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>PROMETHEUS-X · Open-Set Industrial Anomaly Detection Platform</span>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="hover:text-slate-300 transition-colors"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="hover:text-slate-300 transition-colors"
            >
              Inspection Studio
            </button>
            <button
              type="button"
              onClick={() => onNavigate('model')}
              className="hover:text-slate-300 transition-colors"
            >
              Model Information
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
