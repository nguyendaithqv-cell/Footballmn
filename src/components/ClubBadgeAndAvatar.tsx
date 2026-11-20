import React from 'react';
import { Club, Player, RealManager } from '../types/game';

interface ClubCrestProps {
  club: Club;
  size?: number;
  className?: string;
}

export const ClubCrest: React.FC<ClubCrestProps> = React.memo(({ club, size = 36, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`shrink-0 ${className}`}
      aria-label={`Logo ${club.name}`}
    >
      <defs>
        <clipPath id={`shield-${club.id}-${size}`}>
          <path d="M32 6L54 14V32C54 45 44 55 32 58C20 55 10 45 10 32V14L32 6Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#shield-${club.id}-${size})`}>
        <rect x="0" y="0" width="64" height="64" fill={club.primaryColor} />
        {club.pattern === 'stripes' && (
          <>
            <rect x="16" y="0" width="10" height="64" fill={club.secondaryColor} />
            <rect x="38" y="0" width="10" height="64" fill={club.secondaryColor} />
          </>
        )}
        {club.pattern === 'halves' && (
          <rect x="32" y="0" width="32" height="64" fill={club.secondaryColor} />
        )}
        {club.pattern === 'sash' && (
          <path d="M0 48L48 0H64L16 64H0V48Z" fill={club.secondaryColor} />
        )}
        <rect x="0" y="24" width="64" height="16" fill="rgba(11,17,23,0.72)" />
      </g>
      <path
        d="M32 6L54 14V32C54 45 44 55 32 58C20 55 10 45 10 32V14L32 6Z"
        fill="none"
        stroke={club.accentColor}
        strokeWidth="2.5"
      />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="12"
        fontWeight="800"
        fontFamily="Barlow Condensed, sans-serif"
        letterSpacing="0.8"
      >
        {club.shortName}
      </text>
    </svg>
  );
});

interface PlayerAvatarProps {
  player: Player;
  club?: Club;
  size?: number;
  showNumber?: boolean;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = React.memo(
  ({ player, club, size = 44, showNumber = true }) => {
    const isIcon = player.cardTier === 'icon' || player.clubId === 'icons-fc';
    const isGlobal = player.cardTier === 'global';
    const primary = isIcon ? '#D97706' : club?.primaryColor ?? '#10B981';
    const secondary = isIcon ? '#FDE68A' : club?.secondaryColor ?? '#0F172A';
    const { skin, hair, hairStyle } = player.appearance;
    const borderCls = isIcon
      ? 'border-2 border-amber-400 shadow-md shadow-amber-500/25'
      : isGlobal
        ? 'border-2 border-pink-400/75'
        : 'border border-white/15';

    return (
      <div
        className={`relative shrink-0 rounded-full overflow-hidden bg-slate-900 ${borderCls}`}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label={player.name}>
          <rect width="64" height="64" fill="#131E29" />
          <circle cx="32" cy="24" r="24" fill={primary} opacity="0.18" />
          {/* Jersey */}
          <path d="M12 64C14 47 21 42 32 42C43 42 50 47 52 64Z" fill={primary} />
          {club?.pattern === 'stripes' && (
            <path d="M24 43H30V64H24ZM36 43H42V64H36Z" fill={secondary} opacity="0.9" />
          )}
          <path d="M25 42L32 48L39 42" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.85" />
          {/* Neck & Head */}
          <rect x="28" y="34" width="8" height="10" rx="3" fill={skin} />
          <ellipse cx="32" cy="26" rx="10.5" ry="12" fill={skin} />
          {/* Hair */}
          {hairStyle === 'short' && (
            <path d="M21 24C21 15 26 12 32 12C38 12 43 15 43 24C41 19 37 17 32 17C27 17 23 19 21 24Z" fill={hair} />
          )}
          {hairStyle === 'fade' && (
            <path d="M22 21C22 14 26 11 32 11C38 11 42 14 42 21C39 16 25 16 22 21Z" fill={hair} />
          )}
          {hairStyle === 'curly' && (
            <path
              d="M20 24C19 16 24 10 32 10C40 10 45 16 44 24C41 20 38 18 32 18C26 18 23 20 20 24Z"
              fill={hair}
            />
          )}
          {hairStyle === 'long' && (
            <path
              d="M20 26C19 14 25 10 32 10C39 10 45 14 44 26L45 34H40L40 22C36 18 28 18 24 22L24 34H19L20 26Z"
              fill={hair}
            />
          )}
          {hairStyle === 'buzz' && (
            <path d="M22 21C22 15 26 13 32 13C38 13 42 15 42 21C38 18 26 18 22 21Z" fill={hair} opacity="0.6" />
          )}
          {/* Subtle eyes */}
          <circle cx="28" cy="26" r="1.2" fill="#0F172A" />
          <circle cx="36" cy="26" r="1.2" fill="#0F172A" />
        </svg>
        {showNumber && (
          <span className="absolute bottom-0 right-0 bg-slate-950/90 text-white font-mono-num text-[9px] font-bold px-1 leading-tight rounded-tl">
            {player.number}
          </span>
        )}
      </div>
    );
  }
);

interface ManagerAvatarProps {
  manager: RealManager;
  size?: number;
}

export const ManagerAvatar: React.FC<ManagerAvatarProps> = React.memo(({ manager, size = 48 }) => {
  const { skin, hair, hairStyle, suitColor } = manager.appearance;
  return (
    <div
      className="relative shrink-0 rounded-xl overflow-hidden border border-amber-400/30 bg-slate-900"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full" aria-label={manager.name}>
        <rect width="64" height="64" fill="#0F172A" />
        {/* Suit & Tie */}
        <path d="M10 64C13 46 21 41 32 41C43 41 51 46 54 64Z" fill={suitColor} />
        <path d="M27 41L32 54L37 41Z" fill="#F8FAFC" />
        <path d="M31 44L32 54L33 44Z" fill="#10B981" />
        <rect x="28" y="34" width="8" height="9" rx="3" fill={skin} />
        <ellipse cx="32" cy="25" rx="10.5" ry="12" fill={skin} />
        {hairStyle !== 'bald' && (
          <path
            d="M21 23C21 14 26 11 32 11C38 11 43 14 43 23C40 18 37 16 32 16C27 16 24 18 21 23Z"
            fill={hair}
          />
        )}
        <circle cx="28" cy="25" r="1.2" fill="#0F172A" />
        <circle cx="36" cy="25" r="1.2" fill="#0F172A" />
      </svg>
    </div>
  );
});
