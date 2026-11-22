import {
  CircleDot,
  Droplets,
  Flame,
  Leaf,
  Shield,
  Sparkles,
  Star,
  Sun,
  Zap,
} from 'lucide-react';
import { ENERGY_META, type EnergyType } from '../../../data/schemas/cardTypes';

interface EnergyBadgeProps {
  type: EnergyType;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  count?: number;
}

const SIZE_CLASSES = {
  xs: 'h-4 w-4 text-[9px]',
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-7 w-7 text-xs',
};

const ICON_SIZES = {
  xs: 10,
  sm: 12,
  md: 15,
};

export function EnergyBadge({ type, size = 'sm', showLabel = false, count }: EnergyBadgeProps) {
  const meta = ENERGY_META[type];
  const iconSize = ICON_SIZES[size];

  const renderIcon = () => {
    switch (type) {
      case 'ELECTRIC':
        return <Zap size={iconSize} />;
      case 'FIRE':
        return <Flame size={iconSize} />;
      case 'WATER':
        return <Droplets size={iconSize} />;
      case 'PSYCHIC':
        return <Sparkles size={iconSize} />;
      case 'LIGHT':
        return <Sun size={iconSize} />;
      case 'NATURE':
        return <Leaf size={iconSize} />;
      case 'METAL':
        return <Shield size={iconSize} />;
      case 'STAND':
        return <Star size={iconSize} />;
      default:
        return <CircleDot size={iconSize} />;
    }
  };

  if (showLabel) {
    return (
      <span
        title={meta.label}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${meta.bgClass} ${meta.textClass} text-xs`}
      >
        {renderIcon()}
        <span>{meta.label}</span>
        {count !== undefined && <span className="font-bold">×{count}</span>}
      </span>
    );
  }

  return (
    <span
      title={meta.label}
      className={`inline-flex items-center justify-center rounded-full border ${meta.bgClass} ${meta.textClass} ${SIZE_CLASSES[size]} shrink-0 shadow-sm`}
    >
      {renderIcon()}
    </span>
  );
}
