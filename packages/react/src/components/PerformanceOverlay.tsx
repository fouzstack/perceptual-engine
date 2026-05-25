
import {
  useFPS,
  useQualityLevel,
  useIsScrolling,
  usePoolUtilization,
  useDroppedFrames,
  useScrollDirection,
  useVisibleItems,
  useTotalPoolItems,
  useScrollVelocity,
} from '../store/engine-store';

export function PerformanceOverlay() {
  const fps = useFPS();
  const qualityLevel = useQualityLevel();
  const isScrolling = useIsScrolling();
  const poolUtilization = usePoolUtilization();
  const droppedFrames = useDroppedFrames();
  const direction = useScrollDirection();
  const visibleItems = useVisibleItems();
  const totalPoolItems = useTotalPoolItems();
  const velocity = useScrollVelocity();

  const fpsColor = fps >= 55 ? '#22c55e' : fps >= 30 ? '#eab308' : '#ef4444';

  const qualityColors: Record<string, string> = {
    high: '#4ade80',
    medium: '#facc15',
    low: '#fb923c',
    minimal: '#f87171',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        color: '#e2e8f0',
        padding: '10px 14px',
        borderRadius: 12,
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        zIndex: 9999,
        border: '1px solid rgba(255,255,255,0.08)',
        minWidth: 180,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: fpsColor,
            boxShadow: `0 0 6px ${fpsColor}`,
          }}
        />
        <span style={{ fontSize: 18, fontWeight: 700, color: fpsColor }}>
          {Math.round(fps)}
        </span>
        <span style={{ color: '#64748b', fontSize: 11 }}>FPS</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Row label="Quality" value={qualityLevel} color={qualityColors[qualityLevel] || '#cbd5e1'} />
        <Row label="Scrolling" value={isScrolling ? `${direction} ${velocity.toFixed(1)}` : 'idle'} color={isScrolling ? '#60a5fa' : '#475569'} />
        <Row label="Visible" value={String(visibleItems)} />
        <Row label="Pool" value={`${totalPoolItems} (${(poolUtilization * 100).toFixed(0)}%)`} />
        <Row label="Dropped" value={String(droppedFrames)} color={droppedFrames > 0 ? '#fb923c' : '#4ade80'} />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: color ?? '#cbd5e1', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}