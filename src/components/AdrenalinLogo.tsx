import React from 'react';
import flameIcon from '../assets/flame-icon.png';

interface AdrenalinLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'icon' | 'wordmark';
  className?: string;
}

const sizeConfig = {
  sm: { box: 'w-8 h-8', img: 32, radius: 'rounded-lg', text: 'text-lg' },
  md: { box: 'w-9 h-9', img: 36, radius: 'rounded-xl', text: 'text-xl' },
  lg: { box: 'w-10 h-10', img: 40, radius: 'rounded-xl', text: 'text-2xl' },
  xl: { box: 'w-12 h-12', img: 48, radius: 'rounded-2xl', text: 'text-4xl' },
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
    <div className={`${cfg.box} ${cfg.radius} flex items-center justify-center flex-shrink-0 ${className}`}>
      <img src={flameIcon} alt="Adrenalin" width={cfg.img} height={cfg.img} className="object-contain" />
    </div>
  );
};
