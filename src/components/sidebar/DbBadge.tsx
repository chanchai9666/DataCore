import React from 'react';

export interface DbBadgeProps {
  driver?: string;
  className?: string;
}

export const DbBadge: React.FC<DbBadgeProps> = ({ driver, className = '' }) => {
  if (!driver) return null;

  const normalized = driver.toLowerCase();

  let code = 'DB';
  let badgeClasses = 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  if (normalized.includes('postgres') || normalized === 'pg') {
    code = 'PG';
    badgeClasses = 'bg-indigo-500/20 text-indigo-400 dark:text-indigo-300 border-indigo-500/40';
  } else if (normalized.includes('mysql') || normalized === 'my') {
    code = 'MY';
    badgeClasses = 'bg-amber-500/20 text-amber-500 dark:text-amber-300 border-amber-500/40';
  } else if (normalized.includes('sqlite') || normalized === 'sq') {
    code = 'SQ';
    badgeClasses = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40';
  }

  return (
    <span
      data-testid="db-badge"
      data-driver={normalized}
      title={`Database: ${driver}`}
      className={`inline-flex items-center justify-center font-mono font-bold text-[9px] px-1 py-0.2 rounded border select-none tracking-tight shrink-0 ${badgeClasses} ${className}`}
    >
      {code}
    </span>
  );
};

export default DbBadge;
