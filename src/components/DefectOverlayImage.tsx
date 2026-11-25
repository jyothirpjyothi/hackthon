import type { AnomalyRegion, MarkerShape, PredictionOutcome } from '../types/prometheus';

interface DefectOverlayImageProps {
  originalUrl: string;
  heatmapUrl?: string;
  imageWidth: number;
  imageHeight: number;
  regions: AnomalyRegion[];
  prediction: PredictionOutcome;
  markerShape: MarkerShape;
  showHeatmapTint?: boolean;
  showLabels?: boolean;
  alt?: string;
  className?: string;
}

/**
 * Renders the crisp unwashed original product photograph with clean bright-green
 * Rectangle or Circle defect markers tightly enclosing only detected defect regions.
 * Preserves natural image aspect ratio so SVG markers align pixel-for-pixel.
 */
export function DefectOverlayImage({
  originalUrl,
  heatmapUrl,
  imageWidth,
  imageHeight,
  regions,
  prediction,
  markerShape,
  showHeatmapTint = false,
  showLabels = false,
  alt = 'Defect localization overlay',
  className = '',
}: DefectOverlayImageProps) {
  const safeW = Math.max(1, imageWidth || 256);
  const safeH = Math.max(1, imageHeight || 256);
  const minDim = Math.min(safeW, safeH);
  const strokeWidth = Math.max(2, Math.round(minDim / 95));
  const activeRegions = prediction === 'PASS' ? [] : regions;

  return (
    <div
      className={`w-full h-full flex items-center justify-center bg-[#070B14] overflow-hidden ${className}`}
    >
      <div
        className="relative max-w-full max-h-full"
        style={{
          aspectRatio: `${safeW} / ${safeH}`,
          width: safeW >= safeH ? '100%' : 'auto',
          height: safeH > safeW ? '100%' : 'auto',
        }}
      >
        <img
          src={originalUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          className="block w-full h-full object-contain select-none"
        />

        {showHeatmapTint && heatmapUrl && (
          <img
            src={heatmapUrl}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-contain opacity-45 pointer-events-none select-none"
          />
        )}

        {activeRegions.length > 0 && (
          <svg
            viewBox={`0 0 ${safeW} ${safeH}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-label={`${activeRegions.length} defect marker${activeRegions.length === 1 ? '' : 's'} (${markerShape})`}
          >
            {activeRegions.map((reg) => {
              const pad = Math.max(2, Math.round(minDim * 0.01));
              const rx = Math.max(1, reg.x - pad);
              const ry = Math.max(1, reg.y - pad);
              const rw = Math.min(safeW - rx - 1, reg.width + pad * 2);
              const rh = Math.min(safeH - ry - 1, reg.height + pad * 2);

              const cx = reg.x + reg.width / 2;
              const cy = reg.y + reg.height / 2;
              const maxAllowedR = Math.max(
                8,
                Math.min(cx - 2, cy - 2, safeW - cx - 2, safeH - cy - 2)
              );
              const rawRadius = Math.max(10, Math.hypot(reg.width, reg.height) * 0.54);
              const radius = Math.min(rawRadius, maxAllowedR);

              const labelText = reg.label ? `R${reg.id} · ${reg.label}` : `R${reg.id}`;
              const fontSize = Math.max(9, Math.round(minDim * 0.036));
              const labelY =
                markerShape === 'circle'
                  ? Math.max(fontSize + 4, cy - radius - 4)
                  : Math.max(fontSize + 4, ry - 4);
              const labelX =
                markerShape === 'circle'
                  ? Math.max(4, Math.min(safeW - 80, cx - radius * 0.7))
                  : Math.max(4, Math.min(safeW - 80, rx));

              return (
                <g key={reg.id}>
                  {markerShape === 'circle' ? (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="none"
                      stroke="#4ADE80"
                      strokeWidth={strokeWidth}
                    />
                  ) : (
                    <rect
                      x={rx}
                      y={ry}
                      width={Math.max(4, rw)}
                      height={Math.max(4, rh)}
                      fill="none"
                      stroke="#4ADE80"
                      strokeWidth={strokeWidth}
                    />
                  )}
                  {showLabels && (
                    <text
                      x={labelX}
                      y={labelY}
                      fill="#4ADE80"
                      fontSize={fontSize}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      fontWeight="600"
                      paintOrder="stroke"
                      stroke="#070B14"
                      strokeWidth={Math.max(2, Math.round(fontSize * 0.25))}
                      strokeLinejoin="round"
                    >
                      {labelText}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
