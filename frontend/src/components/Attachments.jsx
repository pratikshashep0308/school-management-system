import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { uploadAPI } from '../utils/api';

/**
 * AttachmentUploader — lets staff attach images/PDFs (diagrams, tables, worksheets).
 * Props:
 *   value    : array of { name, url }
 *   onChange : (nextArray) => void
 */
export function AttachmentUploader({ value = [], onChange }) {
  const [uploading, setUploading] = useState(false);

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is over 5 MB`); continue; }
        const r = await uploadAPI.attachment(f);
        if (r.data?.data?.url) uploaded.push(r.data.data);
      }
      if (uploaded.length) {
        onChange([...(value || []), ...uploaded]);
        toast.success(`${uploaded.length} file(s) attached`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <label style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10, border:'1.5px dashed #9CA3AF', background:'#F9FAFB', cursor:'pointer', fontSize:13, fontWeight:600, color:'#374151' }}>
        📎 {uploading ? 'Uploading…' : 'Attach image / PDF'}
        <input type="file" accept="image/*,application/pdf" multiple onChange={pick} disabled={uploading} style={{ display:'none' }} />
      </label>
      <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>Images (jpg/png/webp) or PDF · up to 5 MB each</div>

      {value?.length > 0 && (
        <div style={{ display:'grid', gap:6, marginTop:10 }}>
          {value.map((a, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:12 }}>
              <span>{/\.pdf($|\?)/i.test(a.url) ? '📄' : '🖼️'}</span>
              <span style={{ flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'#374151' }}>{a.name || 'Attachment'}</span>
              <button type="button" onClick={() => removeAt(i)} style={{ background:'none', border:'none', color:'#DC2626', cursor:'pointer', fontWeight:700 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * AttachmentList — read-only display with view + download.
 * Props: attachments : array of { name, url }
 */
export function AttachmentList({ attachments = [] }) {
  if (!attachments?.length) return null;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:8 }}>
      {attachments.map((a, i) => {
        const isPdf = /\.pdf($|\?)/i.test(a.url || '');
        return (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" download
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', fontSize:12, fontWeight:600, color:'#0B1F4A', textDecoration:'none' }}>
            {isPdf ? '📄' : '🖼️'} {a.name || 'Attachment'} <span style={{ color:'#9CA3AF' }}>⬇</span>
          </a>
        );
      })}
    </div>
  );
}