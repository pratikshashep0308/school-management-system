import React from 'react';

// ── MODAL ──
export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }) {
  if (!isOpen) return null;
  const sizes = {
    sm:   'max-w-md',
    md:   'max-w-lg',
    lg:   'max-w-2xl',
    xl:   'max-w-4xl',
    full: 'max-w-[1400px]',  // near-fullscreen — for big tabbed forms
  };
  const isFull = size === 'full';
  return (
    <div className={`fixed inset-0 z-[200] flex ${isFull ? 'items-start' : 'items-center'} justify-center p-4 ${isFull ? 'overflow-y-auto' : ''}`} style={isFull ? { padding: 8 } : undefined}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div className={`relative rounded-2xl w-full ${sizes[size]} animate-scale-in overflow-hidden`}
        style={{
          background: 'var(--paper)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
          ...(isFull
            ? { minHeight: 'calc(100vh - 16px)', margin: '4px 0', display:'flex', flexDirection:'column' }
            : { maxHeight: '90vh', display:'flex', flexDirection:'column' }),
        }}>
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: '1px solid var(--border)', flexShrink:0 }}>
          <h2 className="font-display text-xl" style={{ color: 'var(--ink)' }}>{title}</h2>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >×</button>
        </div>
        <div className="px-7 py-6" style={{ overflowY:'auto', flex:1 }}>{children}</div>
        {footer && <div className="px-7 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border)', flexShrink:0, background: 'var(--warm)' }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── FORM GROUP ──
export function FormGroup({ label, children, className = '' }) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && <label className="form-label">{label}</label>}
      {children}
    </div>
  );
}

// ── STAT CARD ──
export function StatCard({ icon, value, label, change, changeType = 'up', color = 'accent' }) {
  const colors = {
    accent: { bar: 'bg-accent', iconBg: 'bg-accent/10' },
    gold:   { bar: 'bg-gold',   iconBg: 'bg-gold/10' },
    sage:   { bar: 'bg-sage',   iconBg: 'bg-sage/10' },
    purple: { bar: 'bg-purple-500', iconBg: 'bg-purple-100' },
    blue:   { bar: 'bg-blue-500',   iconBg: 'bg-blue-100' },
  };
  const c = colors[color] || colors.accent;
  return (
    <div className="card card-hover p-6 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 ${c.bar}`} />
      <div className={`w-11 h-11 rounded-xl ${c.iconBg} flex items-center justify-center text-xl mb-4`}>{icon}</div>
      <div className="font-display text-4xl leading-none mb-1" style={{ color: 'var(--ink)' }}>{value}</div>
      <div className="text-sm" style={{ color: 'var(--muted)' }}>{label}</div>
      {change && (
        <div className={`mt-3 text-xs font-medium flex items-center gap-1 ${changeType === 'up' ? 'text-sage' : 'text-accent'}`}>
          {changeType === 'up' ? '↑' : '↓'} {change}
        </div>
      )}
    </div>
  );
}

// ── STATUS BADGE ──
export function Badge({ status }) {
  const map = {
    active:   'bg-sage/10 text-sage',
    inactive: 'bg-muted/15 text-muted',
    present:  'bg-sage/10 text-sage',
    absent:   'bg-accent/10 text-accent',
    late:     'bg-gold/15 text-gold',
    excused:  'bg-blue-50 text-blue-600',
    paid:     'bg-sage/10 text-sage',
    pending:  'bg-gold/15 text-gold',
    overdue:  'bg-accent/10 text-accent',
    partial:  'bg-purple-50 text-purple-600',
    issued:   'bg-blue-50 text-blue-600',
    returned: 'bg-sage/10 text-sage',
    unit:     'bg-gold/15 text-gold',
    midterm:  'bg-accent/10 text-accent',
    final:    'bg-purple-50 text-purple-600',
    practical:'bg-sage/10 text-sage',
  };
  return (
    <span className={`status-badge ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

// ── SPINNER ──
export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-7 h-7', lg: 'w-10 h-10' };
  return (
    <div className={`${sizes[size]} rounded-full animate-spin`}
      style={{ border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)' }} />
  );
}

// ── SKELETON ── elegant shimmer block (composable) ──
export function Skeleton({ className = '', style = {} }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

// ── LOADING STATE ── skeleton rows instead of a bare spinner ──
export function LoadingState({ message, rows = 5 }) {
  return (
    <div className="card overflow-hidden animate-fade-in">
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--warm)' }}>
        <Skeleton style={{ height: 12, width: '30%' }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
          <Skeleton style={{ height: 38, width: 38, borderRadius: '50%', flexShrink: 0 }} />
          <div className="flex-1">
            <Skeleton style={{ height: 11, width: '45%', marginBottom: 8 }} />
            <Skeleton style={{ height: 9, width: '25%' }} />
          </div>
          <Skeleton style={{ height: 20, width: 64, borderRadius: 9999 }} />
        </div>
      ))}
      {message && <div className="text-center text-sm py-3" style={{ color: 'var(--muted)' }}>{message}</div>}
    </div>
  );
}

// ── EMPTY STATE ──
export function EmptyState({ icon = '📭', title = 'No records yet', subtitle = '', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center animate-fade-in">
      <div className="flex items-center justify-center rounded-2xl mb-1"
        style={{ width: 76, height: 76, background: 'var(--accent-soft)', fontSize: 34 }}>
        {icon}
      </div>
      <div className="font-display text-xl" style={{ color: 'var(--ink)' }}>{title}</div>
      {subtitle && <div className="text-sm max-w-sm" style={{ color: 'var(--muted)' }}>{subtitle}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── DATA TABLE ──
export function Table({ columns, data, renderRow, loading, emptyState }) {
  if (loading) return <LoadingState />;
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 grid gap-4" style={{ background: 'var(--warm)', borderBottom: '1px solid var(--border)', gridTemplateColumns: columns.map(c => c.width || '1fr').join(' ') }}>
        {columns.map((col) => (
          <div key={col.key} className="table-th">{col.label}</div>
        ))}
      </div>
      {!data?.length
        ? (emptyState || <EmptyState />)
        : data.map((row, i) => renderRow(row, i))
      }
    </div>
  );
}

// ── TABLE ROW ──
export function TableRow({ columns, children, onClick }) {
  return (
    <div
      className={`grid gap-4 px-5 py-3.5 items-center transition-colors ${onClick ? 'cursor-pointer' : ''}`}
      style={{ gridTemplateColumns: columns, borderTop: '1px solid var(--border)' }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--warm)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </div>
  );
}

// ── AVATAR ──
export function Avatar({ name, color, size = 'sm' }) {
  const sizes = { xs: 'w-7 h-7 text-xs', sm: 'w-9 h-9 text-sm', md: 'w-11 h-11 text-base', lg: 'w-14 h-14 text-xl' };
  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  const colors = ['#d4522a','#c9a84c','#4a7c59','#7c6af5','#2d9cdb','#f2994a','#e91e8c'];
  const bg = color || colors[name?.charCodeAt(0) % colors.length] || '#d4522a';
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`} style={{ background: bg }}>
      {initials}
    </div>
  );
}

// ── ACTION BUTTONS ──
export function ActionBtn({ onClick, icon, title, variant = 'default' }) {
  const variants = {
    default: 'border-border text-slate hover:border-accent hover:text-accent',
    danger:  'border-red-200 text-red-400 hover:border-red-400 hover:text-red-600',
    success: 'border-sage/30 text-sage hover:border-sage',
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm transition-all ${variants[variant]}`}
    >
      {icon}
    </button>
  );
}

// ── SEARCH BOX ──
export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative flex-1">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted)' }}>🔍</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input pl-9 max-w-xs"
      />
    </div>
  );
}

// ── SELECT ──
export function Select({ value, onChange, options, placeholder = 'Select…', className = '' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`form-input ${className}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}