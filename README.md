# PROMETHEUS-X
## Open-Set Industrial Anomaly Detection with Localization, Severity & Distribution Shift

PROMETHEUS-X is a full-stack industrial visual quality inspection platform designed around **normal-pattern learning**. Rather than relying exclusively on supervised classifiers trained on known defect classes, PROMETHEUS-X models normal manufacturing appearances via a **PatchCore-style multi-scale coreset memory bank** (with an optional lightweight `EfficientAD-Lite` profile) and flags unknown, rare, and previously unseen abnormalities.

---

## Core Capabilities

1. **Open-Set Anomaly Detection** — Extracts dense locally-aware multi-scale RGB, opponent chromatic, Sobel orientation, and Laplacian texture patch descriptors (`32×32` spatial lattice), builds greedy farthest-point coreset memory banks strictly from normal reference products, and scores unseen deviations (`PASS`, `DEFECT`, `REVIEW`).
2. **Pixel-Level Defect Localization** — Bilinearly upsamples and Gaussian-smooths patch anomaly fields to generate four real visual artifacts per inspection: Original Specimen, Turbo Anomaly Heatmap, Alpha-Blended Contour & Bounding-Box Overlay, and Thresholded Binary Segmentation Mask, plus connected-component bounding-box statistics.
3. **Severity Estimation** — Classifies detected regions into configurable `LOW`, `MEDIUM`, or `HIGH` visual inspection tiers using affected surface area percentage and peak anomaly intensity, clearly distinguished from verified engineering safety assessments.
4. **Confidence Calibration & Reliability** — Fits Platt logistic calibration on held-out validation splits and computes real Image AUROC, Average Precision (AP), F1-Score, Pixel AUROC, Pixel AP, and Expected Calibration Error (ECE) with 10-bin reliability diagrams. Untrained or uncalibrated categories are explicitly labeled as uncalibrated.
5. **Distribution Shift Monitoring** — Compares incoming global feature statistics (illumination, RGB channel balance, contrast energy, Sobel edge density, high-frequency Laplacian energy) against stored normal baselines using standardized Mahalanobis distance (`Stable`, `Possible distribution shift`, `Significant distribution shift`).
6. **Human-in-the-Loop False-Positive Management** — Provides a dedicated Human Review Center to approve normal products, confirm defects, mark false positives, and archive quality engineer notes in SQLite without automatic unverified retraining.

---

## Project Structure

```text
PROMETHEUS-X/
├── server.ts                    # Express REST API server + Vite middleware (port 3000)
├── server/
│   ├── db/
│   │   └── database.ts          # SQLite WAL persistence (5 tables + analytics aggregations)
│   └── ml/
│       ├── anomalyMath.ts       # PatchCore coreset, localization, Platt ECE & drift math
│       ├── anomalyMath.test.ts  # Deterministic node:test ML verification suite
│       └── pipeline.ts          # Sharp pixel pipeline, checkpointing & PNG rendering
├── src/
│   ├── components/              # WorkspaceLayout, StatusText
│   ├── pages/                   # All 10 pages (Landing, Dashboard, Studio, Localization, ...)
│   ├── services/api.ts          # Typed Axios REST API client
│   ├── types/prometheus.ts      # Shared domain models & 15 MVTec AD categories
│   └── assets/images/           # High-resolution industrial optical inspection specimens
├── data/                        # SQLite database (prometheus_x.db)
├── checkpoints/                 # Trained category PatchCore coreset checkpoints
├── uploads/                     # Validated uploaded inspection originals
└── results/                     # Generated heatmap, overlay, and binary mask PNGs
```

---

## Local Setup & Execution (Windows PowerShell)

### Prerequisites
- Node.js 20+ and npm
- Visual Studio Code (recommended)

### Install & Run
```powershell
# 1. Install dependencies
npm install

# 2. Run deterministic ML unit tests
npx tsx --test server/ml/anomalyMath.test.ts

# 3. Start full-stack development server (Frontend + REST API on port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

### Production Build & Start
```powershell
npm run build
$env:NODE_ENV="production"
npm run start
```

---

## REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check |
| `GET` | `/api/system/info` | Active architecture, resolution, and category summary |
| `POST` | `/api/inspect` | Multipart JPG/PNG upload or specimen inference pipeline |
| `GET` | `/api/inspections` | Searchable, filterable, sortable inspection history |
| `GET` | `/api/inspections/:id` | Single inspection record with localization regions |
| `DELETE` | `/api/inspections/:id` | Delete inspection record and associated media artifacts |
| `GET` | `/api/analytics/overview` | Live SQLite dashboard KPIs, category & severity stats |
| `GET` | `/api/analytics/severity` | Severity breakdown |
| `GET` | `/api/analytics/trends` | Chronological inspection volume & score trends |
| `GET` | `/api/analytics/false-positives` | Human verification & false-positive statistics |
| `GET` | `/api/model/status` | Trained & calibrated checkpoint status |
| `GET` | `/api/model/info` | Detailed model metadata & evaluation metrics per category |
| `POST` | `/api/model/train` | Train normal-pattern coreset baseline (supports custom normal uploads) |
| `POST` | `/api/model/evaluate` | Run held-out evaluation & Platt confidence calibration |
| `GET` | `/api/drift/status` | Current distribution shift status, reference comparison & trajectory |
| `GET` | `/api/drift/history` | Logged distribution shift alert events |
| `GET` | `/api/reviews/pending` | Pending & archived human review records |
| `POST` | `/api/reviews/:id/decision` | Save human verification decision and notes |
| `GET` | `/api/reports/:id` | Download structured JSON inspection report |
| `GET` / `PUT` | `/api/settings` | Read and validate/save system thresholds and preprocessing options |

---

## Security & Reliability Safeguards

- Strict upload allowlist (`.jpg`, `.jpeg`, `.png`), MIME checking, pixel decoding verification via `sharp`, 10 MB maximum file size, and generated unique filenames.
- Confined media directory resolution (`path.resolve` boundary checks) preventing path traversal and never exposing internal server paths.
- Parameterized SQLite prepared statements across all queries and mutations.
- Validated configuration updates and graceful handling of untrained categories via zero-shot self-reference anomaly detection.
