import React from 'react';

interface HavenLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  showTagline?: boolean;
}

/**
 * Official Haven Brand Logo component adopting the exact vector artwork,
 * gradient (#3B82F6 -> #2DD4BF), and shield geometry from the brand kit.
 */
export const HavenLogoIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'w-6 h-6',
  size,
}) => {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg
      viewBox="0 0 70 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Haven Shield Logo"
    >
      <defs>
        <linearGradient id="havenShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>
      {/* Normalized shield path from brand asset: centered in 70x84 viewBox */}
      <g transform="translate(-25, -22)">
        <path
          d="M60 22 L95 36 V66 C95 88 60 106 60 106 C60 106 25 88 25 66 V36 Z"
          fill="url(#havenShieldGrad)"
        />
        <path
          d="M48 65 L57 74 L75 54"
          stroke="#FFFFFF"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

export const HavenBrandHeader: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="w-8 h-8 rounded-xl bg-[#091326] p-1.5 shadow-sm border border-blue-500/20 flex items-center justify-center shrink-0">
        <HavenLogoIcon className="w-full h-full" />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white font-['JetBrains_Mono',monospace]">
            Haven
          </span>
        </div>
        <div className="text-[10px] text-slate-400 hidden sm:block font-['Inter',sans-serif]">
          A safe space for shared presence.
        </div>
      </div>
    </div>
  );
};
