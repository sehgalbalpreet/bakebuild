import React from 'react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: any;
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  icon: Icon, 
  color, 
  onClick 
}) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-5 rounded-[2rem] border shadow-sm transition-all hover:scale-[1.02] flex flex-col justify-between min-h-[140px]", 
        colors[color],
        onClick && "cursor-pointer active:scale-95"
      )}
    >
      <div className="w-10 h-10 rounded-2xl bg-white/50 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 opacity-80" />
      </div>
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.1em] mb-1 opacity-60">{label}</div>
        <div className="text-2xl font-black">{value}</div>
      </div>
    </div>
  );
};
