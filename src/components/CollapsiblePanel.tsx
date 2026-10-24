"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PinIcon, PinOffIcon } from 'lucide-react';

export default function CollapsiblePanel({ id, title, side, width, className = '', children }: {
  id: string; title: string; side: 'left' | 'right'; width: number; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(true);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHover = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  useEffect(() => cancelHover, []);
  const floating = !pinned;
  return (
    <section className={`collapsible-panel no-print ${className}${floating ? ' panel-floating' : ''}`}
      style={{ '--panel-width': `${width}px`, width: open && pinned ? width : 44 } as CSSProperties}
      aria-label={title}
      onMouseEnter={() => {
        cancelHover();
        if (!open) {
          const expand = () => { setPinned(false); setOpen(true); hoverTimer.current = null; };
          if (side === 'right') hoverTimer.current = setTimeout(expand, 2000);
          else expand();
        }
      }}
      onMouseLeave={() => { cancelHover(); if (!pinned) setOpen(false); }}>
      <div className={`collapsible-panel-surface panel-side-${side}${open ? ' panel-open' : ' panel-collapsed'}`}>
        <div className="collapsible-panel-controls">
          <button type="button" aria-label={open ? `طي ${title}` : `فتح ${title}`}
            title={open ? `طي ${title}` : `فتح ${title}`} aria-expanded={open} aria-controls={id}
            onClick={() => { cancelHover(); if (open) setPinned(false); setOpen(previous => !previous); }}>
            {open ? <PanelLeftCloseIcon size={18} /> : <PanelLeftOpenIcon size={18} />}
          </button>
          {open && <>
            <span>{title}</span>
            <button type="button" aria-label={pinned ? `إلغاء تثبيت ${title}` : `تثبيت ${title}`}
              title={pinned ? 'إلغاء التثبيت: عرض مؤقت فوق المحتوى' : 'تثبيت القائمة مفتوحة'}
              aria-pressed={pinned} onClick={() => setPinned(previous => !previous)}>
              {pinned ? <PinIcon size={17} /> : <PinOffIcon size={17} />}
            </button>
          </>}
        </div>
        <div id={id} hidden={!open && side !== 'right'} className="collapsible-panel-content">{children}</div>
        {!open && side !== 'right' && <button type="button" className="collapsible-panel-rail" onClick={() => setOpen(true)}
          aria-label={`فتح ${title}`} title={`فتح ${title}`}>{title}</button>}
      </div>
    </section>
  );
}
