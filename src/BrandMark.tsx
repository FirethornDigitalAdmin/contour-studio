/** The same map-layer silhouette used by our favicon and shortcut icons. */
export default function BrandMark({ size = 26 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 23 20-11 20 11-20 11Z" />
      <path d="m12 33 20 11 20-11M12 43l20 11 20-11" />
    </g>
  </svg>;
}
