import type React from 'react';
import { cn } from '@/lib/utils';

const DietWiseLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("flex items-center gap-2 text-2xl font-bold text-primary", className)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8"
        data-ai-hint="leaf animal"
      >
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M12 12c-3 0-5 2.5-5 5s2 5 5 5c0-2.5-2-5-5-5zM12 2a5 5 0 0 0-5 5c0 1.5.5 3 1.5 4" />
        <path d="M12 7c3 0 5-2.5 5-5s-2-5-5-5c0 2.5 2 5 5 5z" />
        <path d="M12 12a5 5 0 0 0 5-5c0-1.5-.5-3-1.5-4" />
      </svg>
      <span>DietWise</span>
    </div>
  );
};

export default DietWiseLogo;
