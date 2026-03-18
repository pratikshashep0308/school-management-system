import React from 'react';

// ── MODAL ──
export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }) {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl w-full ${sizes[size]} shadow-2xl animate-scale-in overflow-hidden`}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-border">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:border-accent hover:text-accent transition-all text-lg">×</button>
        </div>
        <div className="px-7 py-6">{children}</div>
        {footer && <div className="px-7 py-4 border-t border-border flex justify-end gap-3">{footer}</div>}
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
    <div className="card p-6 relative overflow-hidden hover:-translate-y-0.5 transition-transform">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.bar}`} />
      <div className={`w-11 h-11 rounded-xl ${c.iconBg} flex items-center justify-center text-xl mb-4`}>{icon}</div>
      <div className="font-display text-4xl text-ink leading-none mb-1">{value}</div>
      <div className="text-sm text-muted">{label}</div>
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
    <div className={`${sizes[size]} border-2 border-border border-t-accent rounded-full animate-spin`} />
  );
}

// ── LOADING STATE ──
export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Spinner size="lg" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

// ── EMPTY STATE ──
export function EmptyState({ icon = '📭', title = 'No data found', subtitle = '', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="text-5xl">{icon}</div>
      <div className="font-semibold text-ink text-lg">{title}</div>
      {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── DATA TABLE ──
export function Table({ columns, data, renderRow, loading, emptyState }) {
  if (loading) return <LoadingState />;
  return (
    <div className="card overflow-hidden">
      <div className="bg-warm px-5 py-3 grid gap-4 border-b border-border" style={{ gridTemplateColumns: columns.map(c => c.width || '1fr').join(' ') }}>
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
      className={`grid gap-4 px-5 py-3.5 border-t border-border items-center hover:bg-warm/60 transition-colors ${onClick ? 'cursor-pointer' : ''}`}
      style={{ gridTemplateColumns: columns }}
      onClick={onClick}
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
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">🔍</span>
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
