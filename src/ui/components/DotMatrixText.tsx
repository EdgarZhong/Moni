import React from 'react';

// 3x5 or 4x5 Dot Matrix Patterns for letters
// 1 = dot, 0 = empty
const CHAR_PATTERNS: Record<string, number[][]> = {
  P: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
  ],
  X: [
    [1, 0, 1],
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
    [1, 0, 1],
  ],
  E: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  B: [
    [1, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 1, 1, 0],
  ],
  I: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  L: [
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  // Add more if needed, currently only need B, I, L
};

interface DotMatrixCharProps {
  char: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const DotMatrixChar: React.FC<DotMatrixCharProps> = ({ char, className = '', size = 'sm' }) => {
  const pattern = CHAR_PATTERNS[char.toUpperCase()] || [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ]; // Default box for unknown

  const sizeClasses = {
    sm: { gap: 'gap-[2px]', dot: 'w-[3px] h-[3px]' },
    md: { gap: 'gap-[3px]', dot: 'w-[4px] h-[4px]' },
    lg: { gap: 'gap-[4px]', dot: 'w-[5px] h-[5px]' },
  };

  const { gap, dot: dotSize } = sizeClasses[size];

  // Dynamically determine columns based on pattern width
  const cols = pattern[0]?.length || 3;
  const gridColsClass = cols === 4 ? 'grid-cols-4' : 'grid-cols-3';

  return (
    <div className={`grid ${gridColsClass} ${gap} ${className} flex-shrink-0`}>
      {pattern.flat().map((dot, index) => (
        <div
          key={index}
          className={`${dotSize} rounded-full flex-shrink-0 ${
            dot ? 'bg-current opacity-100' : 'bg-transparent'
          }`}
        />
      ))}
    </div>
  );
};

export const DotMatrixText: React.FC<{ text: string; className?: string; size?: 'sm' | 'md' | 'lg' }> = ({ text, className, size = 'sm' }) => {
  return (
    <div className={`flex flex-shrink-0 ${size === 'lg' ? 'gap-5' : size === 'md' ? 'gap-4' : 'gap-3'} ${className}`}>
      {text.split('').map((char, i) => (
        <DotMatrixChar key={i} char={char} size={size} />
      ))}
    </div>
  );
};
