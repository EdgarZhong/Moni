import React, { useState, useEffect, useRef } from 'react';

interface EditableDateProps {
  date: Date;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  readOnly?: boolean;
  hideYear?: boolean;
}

const DatePartInput: React.FC<{
  value: number;
  width: string;
  min: number;
  max: number;
  onChange: (val: number) => void;
  readOnly?: boolean;
}> = ({ value, width, min, max, onChange, readOnly }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal state with props when value changes, but only if not editing
  useEffect(() => {
    if (!isEditing) {
      // 避免重复渲染，仅在值真正不同时更新
      const newVal = value.toString().padStart(width === 'w-10' ? 4 : 2, '0');
      if (inputValue !== newVal) {
        setInputValue(newVal);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, width, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    finishEditing();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      finishEditing();
    }
  };

  const finishEditing = () => {
    setIsEditing(false);
    let num = parseInt(inputValue, 10);
    
    // Validation & Fallback
    if (isNaN(num)) {
      num = value; // Fallback to original
    } else {
      // Clamp
      if (num < min) num = min;
      if (num > max) num = max;
    }
    
    setInputValue(num.toString().padStart(width === 'w-10' ? 4 : 2, '0'));
    onChange(num);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent onClick
    if (!readOnly) {
      setIsEditing(true);
    }
  };

  return (
    <div className="relative inline-block" onClick={handleClick}>
      {!isEditing ? (
        <span 
          className={`transition-colors ${readOnly ? '' : 'cursor-pointer hover:text-pixel-green hover:underline decoration-1 underline-offset-4'}`}
        >
          {value.toString().padStart(width === 'w-10' ? 4 : 2, '0')}
        </span>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`bg-transparent text-center border-b border-pixel-green outline-none text-pixel-green ${width}`}
        />
      )}
    </div>
  );
};

export const EditableDate: React.FC<EditableDateProps> = ({
  date,
  onChange,
  minDate,
  maxDate,
  className = "",
  readOnly = false,
  hideYear = false
}) => {
  // Helper to safely update date
  const updateDate = (type: 'year' | 'month' | 'day', val: number) => {
    let newDate = new Date(date);
    
    if (type === 'year') {
      newDate.setFullYear(val);
    } else if (type === 'month') {
      newDate.setMonth(val - 1); // 0-indexed
    } else {
      newDate.setDate(val);
    }

    // Check validity and bounds
    // Note: setMonth/setDate handles overflow automatically (e.g. Feb 30 -> Mar 2), 
    // but we might want to clamp strictly.
    // However, JS Date auto-correction is often acceptable or we strictly clamp:
    
    // Re-check strict bounds
    if (minDate && newDate < minDate) newDate = minDate;
    if (maxDate && newDate > maxDate) newDate = maxDate;

    onChange(newDate);
  };

  const year = date?.getFullYear() ?? new Date().getFullYear();
  const month = (date?.getMonth() ?? 0) + 1;
  const day = date?.getDate() ?? 1;

  // Calculate dynamic max days for current month/year
  const daysInMonth = new Date(year, month, 0).getDate();

  if (!date) return null;

  return (
    <div className={`grid grid-flow-col items-center justify-end ${readOnly ? 'gap-0' : 'gap-1'} font-mono transition-all duration-300 ${className}`}>
      <div className={`${hideYear ? 'hidden' : 'contents'}`}>
        <DatePartInput 
          value={year} 
          width="w-10" 
          min={minDate ? minDate.getFullYear() : 1900} 
          max={maxDate ? maxDate.getFullYear() : 2100} 
          onChange={(v) => updateDate('year', v)} 
          readOnly={readOnly}
        />
        <span className={`transition-all duration-300 ${readOnly ? 'opacity-50' : 'text-dim'}`}>.</span>
      </div>
      <DatePartInput 
        value={month} 
        width="w-6" 
        min={1} 
        max={12} 
        onChange={(v) => updateDate('month', v)} 
        readOnly={readOnly}
      />
      <span className={`transition-all duration-300 ${readOnly ? 'opacity-50' : 'text-dim'}`}>.</span>
      <DatePartInput 
        value={day}  
        width="w-6" 
        min={1} 
        max={daysInMonth} 
        onChange={(v) => updateDate('day', v)} 
        readOnly={readOnly}
      />
    </div>
  );
};
