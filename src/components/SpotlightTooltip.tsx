import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SpotlightTooltipProps {
  targetSelector: string;
  text: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  tooltipKey: string;
}

export default function SpotlightTooltip({ targetSelector, text, placement = 'bottom', tooltipKey }: SpotlightTooltipProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem(`seen_tooltip_${tooltipKey}`);
    if (hasSeen) return;

    const findTarget = () => {
      const element = document.querySelector(targetSelector);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
        setIsVisible(true);
      }
    };

    const timeout = setTimeout(findTarget, 1000); // Wait for render
    
    const handleResize = () => {
      if (isVisible) findTarget();
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, [targetSelector, tooltipKey, isVisible]);

  const handleClose = () => {
    localStorage.setItem(`seen_tooltip_${tooltipKey}`, 'true');
    setIsVisible(false);
  };

  if (!isVisible || !targetRect) return null;

  const padding = 8;
  const top = targetRect.top - padding;
  const left = targetRect.left - padding;
  const width = targetRect.width + padding * 2;
  const height = targetRect.height + padding * 2;

  const tooltipWidth = 256; // w-64
  const viewportPadding = 16;
  const centerX = left + width / 2;
  
  let tooltipLeft = centerX - tooltipWidth / 2;
  
  if (typeof window !== 'undefined') {
    if (tooltipLeft < viewportPadding) {
      tooltipLeft = viewportPadding;
    } else if (tooltipLeft + tooltipWidth > window.innerWidth - viewportPadding) {
      tooltipLeft = window.innerWidth - tooltipWidth - viewportPadding;
    }
  }

  let arrowLeft = centerX - tooltipLeft;
  if (arrowLeft < 20) arrowLeft = 20;
  if (arrowLeft > tooltipWidth - 20) arrowLeft = tooltipWidth - 20;

  let tooltipStyle: React.CSSProperties = {};
  let arrowClasses = "absolute w-4 h-4 bg-white dark:bg-zinc-800 rotate-45 z-0 ";
  let arrowStyle: React.CSSProperties = { left: arrowLeft, transform: 'translateX(-50%) rotate(45deg)' };

  let finalPlacement = placement;
  const estimatedTooltipHeight = 160;

  if (typeof window !== 'undefined') {
    if (placement === 'top' && top - estimatedTooltipHeight < 20) {
      finalPlacement = 'bottom';
    } else if (placement === 'bottom' && top + height + estimatedTooltipHeight > window.innerHeight - 20) {
      finalPlacement = 'top';
    }
  }

  if (finalPlacement === 'bottom') {
    tooltipStyle = { top: top + height + 16, left: tooltipLeft };
    arrowClasses += "-top-2 border-l border-t border-slate-100 dark:border-zinc-700";
  } else {
    tooltipStyle = { top: top - 16, left: tooltipLeft, transform: 'translateY(-100%)' };
    arrowClasses += "-bottom-2 border-r border-b border-slate-100 dark:border-zinc-700";
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] pointer-events-none" style={{ direction: 'rtl' }}>
        {/* Dark overlay with cutout */}
        <div
          className="absolute inset-0 bg-slate-900/70"
          style={{
            clipPath: `polygon(
              0% 0%, 0% 100%, 100% 100%, 100% 0%,
              0% 0%,
              ${left}px ${top}px,
              ${left + width}px ${top}px,
              ${left + width}px ${top + height}px,
              ${left}px ${top + height}px,
              ${left}px ${top}px
            )`
          }}
        />
        
        {/* Pulsing ring around the target element */}
        <div 
          className="absolute border-2 border-[#2196F3]/50 rounded-2xl md:rounded-3xl pointer-events-auto"
          style={{
            top, left, width, height,
            boxShadow: '0 0 0 4px rgba(33, 150, 243, 0.15), 0 0 20px rgba(33, 150, 243, 0.4)'
          }}
        >
          <motion.div
            className="absolute inset-0 rounded-2xl md:rounded-3xl border-2 border-[#2196F3]"
            animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </div>

        {/* Tooltip Card */}
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute pointer-events-auto bg-white dark:bg-zinc-800 rounded-[16px] shadow-[0_4px_24px_rgba(0,0,0,0.12)] p-4 w-64 flex flex-col items-center text-center border border-slate-100 dark:border-zinc-700"
          style={tooltipStyle}
        >
          <div className={arrowClasses} style={arrowStyle} />
          
          <p className="text-slate-800 dark:text-slate-200 font-bold mb-4 relative z-10 text-sm leading-relaxed">
            {text}
          </p>
          
          <div className="flex gap-2 w-full relative z-10">
            <button
              onClick={handleClose}
              className="flex-1 bg-[#2196F3] text-white rounded-full py-2.5 text-xs font-bold hover:bg-[#1E88E5] transition-colors"
            >
              مفهوم!
            </button>
            <button
              onClick={handleClose}
              className="flex-1 text-slate-500 rounded-full py-2.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition-colors"
            >
              تخطي
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
