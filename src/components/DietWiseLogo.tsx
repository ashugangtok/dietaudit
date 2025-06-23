import type React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const DietWiseLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <Image
        src="/logo.png"
        alt="DietWise Logo"
        width={150}
        height={40}
        className={cn("", className)}
        data-ai-hint="logo"
    />
  );
};

export default DietWiseLogo;
