// NexusMeet brand mark — SVG logo component
// Camera + video-wing + lens design

export default function NexusMeetLogo({ size = 38 }) {
    const id = `nm_${size}`
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0 }}
        >
            <defs>
                <linearGradient id={`${id}_bg`} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
                <linearGradient id={`${id}_lens`} x1="6" y1="14" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#0369a1" />
                    <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
            </defs>

            {/* Background rounded square */}
            <rect width="44" height="44" rx="12" fill={`url(#${id}_bg)`} />

            {/* Subtle inner glow ring */}
            <rect x="1" y="1" width="42" height="42" rx="11.5"
                stroke="white" strokeOpacity="0.15" strokeWidth="1" fill="none" />

            {/* Camera body */}
            <rect x="4" y="13" width="24" height="17" rx="4" fill="white" fillOpacity="0.96" />

            {/* Lens outer ring */}
            <circle cx="16" cy="21.5" r="6" fill={`url(#${id}_lens)`} />

            {/* Lens inner (glass) */}
            <circle cx="16" cy="21.5" r="3.5" fill="white" fillOpacity="0.92" />

            {/* Lens tiny reflection dot */}
            <circle cx="14.2" cy="19.8" r="1" fill="white" fillOpacity="0.5" />

            {/* Viewfinder notch on top of camera */}
            <rect x="12" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.75" />

            {/* Record indicator dot */}
            <circle cx="22.5" cy="15" r="1.6" fill="white" fillOpacity="0.6" />

            {/* Video wing (triangle) — the → of recording */}
            <path d="M30 15.5 L40 21.5 L30 27.5 Z" fill="white" fillOpacity="0.94" />
        </svg>
    )
}
