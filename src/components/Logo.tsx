export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-label="Ophixe logo"
    >
      <defs>
        <linearGradient id="ophixe-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A2A2E" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#ophixe-bg)" />
      <circle cx="248" cy="256" r="112" fill="none" stroke="#FFFFFF" strokeWidth="54" />
      <path d="M208 216 L288 296" stroke="#3EE6C4" strokeWidth="38" strokeLinecap="round" />
      <path d="M288 216 L208 296" stroke="#3EE6C4" strokeWidth="38" strokeLinecap="round" />
      <circle cx="376" cy="132" r="26" fill="#3EE6C4" />
      <circle cx="424" cy="178" r="12" fill="#FFFFFF" opacity="0.9" />
    </svg>
  );
}
