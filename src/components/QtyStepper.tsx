import { Minus, Plus } from 'lucide-react';

interface QtyStepperProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  min?: number;
  accentColor?: string; // tailwind text/border color class prefix, örn "emerald"
}

/** Dokunmatik ekran için büyük +/- adet sayacı — klavye açtırmaz */
export default function QtyStepper({ label, value, onChange, disabled, min = 0, accentColor = 'emerald' }: QtyStepperProps) {
  const num = parseInt(value) || 0;

  const step = (delta: number) => {
    const next = Math.max(min, num + delta);
    onChange(String(next));
  };

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
      <div className={`flex items-center gap-1.5 ${disabled ? 'opacity-30' : ''}`}>
        <button
          type="button"
          disabled={disabled || num <= min}
          onClick={() => step(-1)}
          className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-gray-800 border border-gray-700/80 text-gray-300 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition-transform hover:border-${accentColor}-500/50`}
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className={`flex-1 h-11 flex items-center justify-center rounded-xl bg-gray-800 border border-gray-700/80 text-white text-base font-bold`}>
          {num}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => step(1)}
          className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-gray-800 border border-gray-700/80 text-gray-300 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition-transform hover:border-${accentColor}-500/50`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
