// Reusable India phone input — +91 prefix + 10-digit number only
import React, { useState } from 'react';

const FLAG = '🇮🇳';
const CODE = '+91';

export default function PhoneInput({ value = '', onChange, placeholder = '9876543210', className = '', style = {}, disabled = false, required = false }) {
  const [error, setError] = useState('');

  // Strip +91 prefix to get raw digits shown in box
  const raw = value.replace(/^\+91/, '').replace(/\D/g, '');

  const handleChange = (e) => {
    // Only allow digits
    const digits = e.target.value.replace(/\D/g, '');
    // Max 10 digits
    const capped = digits.slice(0, 10);
    // Validate
    if (capped.length > 0 && capped.length < 10) {
      setError('Enter 10-digit mobile number');
    } else if (capped.length === 10 && !/^[6-9]/.test(capped)) {
      setError('Must start with 6, 7, 8 or 9');
    } else {
      setError('');
    }
    // Emit full value with country code
    onChange(capped ? `+91${capped}` : '');
  };

  const handleBlur = () => {
    if (raw.length > 0 && raw.length < 10) setError('Enter 10-digit mobile number');
    else if (raw.length === 10 && !/^[6-9]/.test(raw)) setError('Must start with 6, 7, 8 or 9');
    else setError('');
  };

  const inputStyle = {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 13,
    background: 'transparent',
    color: '#111827',
    padding: '0 10px',
    letterSpacing: '0.5px',
    ...style,
  };

  const wrapStyle = {
    display: 'flex',
    alignItems: 'center',
    border: `1.5px solid ${error ? '#EF4444' : '#E5E7EB'}`,
    borderRadius: 8,
    background: disabled ? '#F9FAFB' : '#fff',
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  };

  return (
    <div>
      <div style={wrapStyle}
        onFocus={e => { if (!error) e.currentTarget.style.borderColor = '#6366F1'; }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? '#EF4444' : '#E5E7EB'; }}>
        {/* Country flag + code */}
        <div style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 10px 8px 12px',
          borderRight:'1.5px solid #E5E7EB', background:'#F9FAFB', flexShrink:0, whiteSpace:'nowrap' }}>
          <span style={{ fontSize:14 }}>{FLAG}</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>{CODE}</span>
        </div>
        {/* 10-digit input */}
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={raw}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={className}
          style={inputStyle}
        />
        {/* Digit counter */}
        {raw.length > 0 && (
          <span style={{ fontSize:10, color: raw.length === 10 ? '#16A34A' : '#9CA3AF',
            paddingRight:10, fontWeight:700, flexShrink:0 }}>
            {raw.length}/10
          </span>
        )}
      </div>
      {error && (
        <div style={{ fontSize:11, color:'#EF4444', marginTop:4, paddingLeft:2 }}>⚠ {error}</div>
      )}
    </div>
  );
}