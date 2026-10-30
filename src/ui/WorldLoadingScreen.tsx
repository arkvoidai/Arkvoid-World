interface WorldLoadingScreenProps {
  className?: string;
}

export function WorldLoadingScreen({ className = '' }: WorldLoadingScreenProps) {
  return (
    <div
      className={`arkvoid-loading-screen ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Preparing Arkvoid"
    >
      <div className="arkvoid-loading-content">
        <div className="arkvoid-loader-orbit" aria-hidden="true">
          <span className="arkvoid-loader-core" />
        </div>
        <span className="arkvoid-loading-wordmark">ARKVOID</span>
        <span className="arkvoid-loading-caption">Preparing your world</span>
        <span className="arkvoid-loading-track" aria-hidden="true">
          <span />
        </span>
      </div>
    </div>
  );
}
