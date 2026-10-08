import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SearchableSelect({ value, options, onChange, label, inputProps = {}, className = '', noMatches }) {
  const id = useId(), input = useRef(null), menu = useRef(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const [active, setActive] = useState(0), [position, setPosition] = useState(null);
  const filtered = options.filter(option => option.toLowerCase().includes(query.trim().toLowerCase()));
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current.getBoundingClientRect();
      const height = Math.min(240, Math.max(44, filtered.length * 38 + 8));
      const below = window.innerHeight - rect.bottom;
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 16);
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width,
        top: below >= height || rect.top < height ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), maxHeight: Math.max(44, Math.min(240, below >= height ? below - 12 : rect.top - 12)) });
    };
    const dismiss = event => { if (!input.current?.parentElement.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false); };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', dismiss);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', dismiss); };
  }, [open, filtered.length]);
  useLayoutEffect(() => { menu.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const select = option => { onChange(option); setQuery(''); setOpen(false); input.current.focus(); };
  return <div className="relative w-full min-w-0">
    <input {...inputProps} ref={input} role="combobox" autoComplete="off"
      aria-label={inputProps['aria-label'] || label} aria-expanded={open} aria-autocomplete="list"
      aria-controls={open ? id : undefined} aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined}
      value={value || ''} className={`${inputProps.className || className} pr-9`}
      onFocus={event => { inputProps.onFocus?.(event); setQuery(''); setActive(0); setOpen(true); }}
      onChange={event => { onChange(event.target.value); setQuery(event.target.value); setActive(0); setOpen(true); }}
      onBlur={event => { inputProps.onBlur?.(event); setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation();
          if (!open) { setQuery(''); setOpen(true); setActive(0); }
          else setActive(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
          return;
        }
        if (open && event.key === 'Enter' && filtered[active]) { event.preventDefault(); event.stopPropagation(); select(filtered[active]); return; }
        if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
        if (event.key === 'Tab') setOpen(false);
        inputProps.onKeyDown?.(event);
      }} />
    <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
      className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-stone-500 rounded hover:bg-stone-200"
      onMouseDown={event => event.preventDefault()}
      onClick={() => { const next = !open; input.current.focus(); setQuery(''); setActive(0); setOpen(next); }}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && position && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label}
      style={position} className="fixed z-[100] overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-xl p-1 text-sm">
      {filtered.length ? filtered.map((option, index) => <div key={option} role="option" id={`${id}-${index}`} data-option-index={index}
        aria-selected={option === value} className={`cursor-pointer rounded-lg px-3 py-2 ${index === active ? 'bg-stone-100 text-stone-900' : 'text-stone-700'}`}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => select(option)}>{option}</div>) : <p className="px-3 py-2 text-stone-500">{noMatches}</p>}
    </div>, document.body)}
  </div>;
}
