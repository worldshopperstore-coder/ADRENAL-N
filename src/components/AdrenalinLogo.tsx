import React from 'react';

interface AdrenalinLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'icon' | 'wordmark';
  className?: string;
}

const sizeConfig = {
  sm: { box: 'w-8 h-8', icon: 'w-4 h-4', radius: 'rounded-lg', text: 'text-lg' },
  md: { box: 'w-9 h-9', icon: 'w-[18px] h-[18px]', radius: 'rounded-xl', text: 'text-xl' },
  lg: { box: 'w-10 h-10', icon: 'w-5 h-5', radius: 'rounded-xl', text: 'text-2xl' },
  xl: { box: 'w-12 h-12', icon: 'w-6 h-6', radius: 'rounded-2xl', text: 'text-4xl' },
};

export const AdrenalinLogo: React.FC<AdrenalinLogoProps> = ({ size = 'md', variant = 'icon', className = '' }) => {
  const cfg = sizeConfig[size];

  if (variant === 'wordmark') {
    return (
      <span className={`font-black tracking-tight ${cfg.text} ${className}`}>
        <span className="text-white">adrenalin</span>
        <span className="text-orange-500 text-[0.6em] align-super">®</span>
      </span>
    );
  }

  return (
    <div className={`${cfg.box} ${cfg.radius} bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0 ${className}`}>
      <svg className={cfg.icon} viewBox="0 0 24 24" fill="none">
        <polygon points="14,2 6,14 11,14 10,22 18,9 13,9" fill="#fff"/>
      </svg>
    </div>
  );
};
