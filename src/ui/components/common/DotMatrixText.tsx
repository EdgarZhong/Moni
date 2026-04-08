import React from 'react';

// 4x5 Dot Matrix Patterns for letters
// 1 = dot, 0 = empty
const CHAR_PATTERNS: Record<string, number[][]> = {
  P: [
    [1, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [1, 0, 0, 0],
  ],
  X: [
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0, 0, 0, 0], // Middle empty or cross
    [0, 1, 1, 0],
    [1, 0, 0, 1],
  ],
  E: [
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [1, 1, 1, 0],
  ],
  B: [
    [1, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 1, 1, 0],
  ],
  I: [
    [1, 1, 1, 0], // I usually is centered or full width? Let's stick to 3 wide for I in 4x5 grid or just a line
    [0, 1, 0, 0], // Actually 4x5 grid usually:
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [1, 1, 1, 0],
  ],
  L: [
    [1, 0, 0, 0],
    [1, 0, 0, 0],
    [1, 0, 0, 0],
    [1, 0, 0, 0],
    [1, 1, 1, 0], // 3 wide
  ],
  // Add more if needed, currently only need B, I, L
};

// Refined X pattern
CHAR_PATTERNS['X'] = [
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0, 0, 0, 0], // Center point handled by adjacent
    [0, 1, 1, 0],
    [1, 0, 0, 1],
];
// Actually let's make X better
CHAR_PATTERNS['X'] = [
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
];
// Re-refine X for 4x5
CHAR_PATTERNS['X'] = [
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [1, 0, 0, 1],
];

// Refined I pattern to match style
CHAR_PATTERNS['I'] = [
    [1, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [1, 1, 1, 0],
];

interface DotMatrixCharProps {
  char: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const DotMatrixChar: React.FC<DotMatrixCharProps> = ({ char, className = '', size = 'sm' }) => {
  const pattern = CHAR_PATTERNS[char.toUpperCase()] || [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
  ]; // Default box for unknown

  const sizeClasses = {
    sm: { gap: 'gap-[2px]', dot: 'w-[3px] h-[3px]' },
    md: { gap: 'gap-[3px]', dot: 'w-[4px] h-[4px]' },
    lg: { gap: 'gap-[4px]', dot: 'w-[5px] h-[5px]' },
  };

  const { gap, dot: dotSize } = sizeClasses[size];

  return (
    <div className={`grid grid-cols-4 ${gap} ${className}`}>
      {pattern.flat().map((dot, index) => (
        <div
          key={index}
          className={`${dotSize} rounded-full ${
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
