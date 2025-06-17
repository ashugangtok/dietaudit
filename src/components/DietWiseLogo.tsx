import type React from 'react';

const DietWiseLogo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="150"
    height="40"
    viewBox="0 0 150 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="DietWise Logo"
    {...props}
  >
    <path
      d="M5.13606 20.686L10.74 13.134C11.3931 12.2435 12.5029 12.1158 13.3933 12.7689C14.2838 13.422 14.4115 14.5317 13.7584 15.4222L9.20406 21.658L13.7584 27.8937C14.4115 28.7842 14.2838 29.8939 13.3933 30.547C12.5029 31.2001 11.3931 31.0724 10.74 30.2019L5.13606 22.63L2.94006 25.434C2.28693 26.3245 1.17719 26.4522 0.286724 25.7991C-0.603741 25.146 -0.731451 24.0362 0.0790137 23.1458L3.20406 18.99C3.20406 18.99 3.20406 18.99 3.20406 18.99L0.0790137 14.8341C-0.731451 13.9437 -0.603741 12.8339 0.286724 12.1808C1.17719 11.5277 2.28693 11.6554 2.94006 12.5459L5.13606 20.686Z"
      fill="hsl(var(--primary))"
    />
    <text x="25" y="27" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="bold" fill="hsl(var(--foreground))">
      DietWise
    </text>
  </svg>
);

export default DietWiseLogo;
