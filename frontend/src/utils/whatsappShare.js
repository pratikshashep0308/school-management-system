// Build a WhatsApp share link with a pre-filled homework/assignment message.
// Uses the standard wa.me endpoint — opens WhatsApp (app or web) so the user
// can pick a contact/group and send. No API keys needed.

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

// item: { kind: 'Homework'|'Assignment', title, subject, class, dueDate, description, attachments }
export function buildWhatsAppMessage(item) {
  const lines = [];

  lines.push(`*${item.kind || 'Homework'}*`);
  if (item.title)   lines.push(`Title: ${item.title}`);
  if (item.subject) lines.push(`Subject: ${item.subject}`);
  if (item.class)   lines.push(`Class: ${item.class}`);
  if (item.dueDate) lines.push(`Due Date: ${fmtDate(item.dueDate)}`);

  if (item.description && item.description !== item.title) {
    lines.push('');
    lines.push(item.description);
  }

  // Attachments — each URL goes on its OWN line with nothing after it, so
  // WhatsApp reliably detects it and renders a tappable link (and a preview).
  const atts = Array.isArray(item.attachments) ? item.attachments.filter(a => a && a.url) : [];
  if (atts.length) {
    lines.push('');
    atts.forEach((a) => {
      lines.push(`${a.name || 'Attachment'} — tap to view:`);
      lines.push(a.url);          // URL alone on its own line
    });
  }

  if (item.school) { lines.push(''); lines.push(`_${item.school}_`); }

  return lines.join('\n');
}

// Opens WhatsApp with the message pre-filled (no recipient — user picks one).
export function shareOnWhatsApp(item) {
  const text = encodeURIComponent(buildWhatsAppMessage(item));
  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
}

// True if the device can share actual files via the native share sheet
// (mobile Chrome/Safari over HTTPS). Desktop browsers generally cannot.
export function canShareFiles() {
  return typeof navigator !== 'undefined'
    && !!navigator.canShare
    && !!navigator.share;
}

// Fetch each attachment and open the native share sheet with the real files
// (image/PDF). The teacher then taps WhatsApp and the actual file is sent.
// Falls back to the text-only share if file sharing isn't supported.
export async function shareFilesToWhatsApp(item) {
  const atts = Array.isArray(item.attachments) ? item.attachments.filter(a => a && a.url) : [];
  if (!atts.length || !canShareFiles()) {
    return shareOnWhatsApp(item);
  }

  try {
    const files = [];
    for (const a of atts) {
      const res = await fetch(a.url);
      const blob = await res.blob();
      const name = a.name || (/\.pdf($|\?)/i.test(a.url) ? 'attachment.pdf' : 'attachment.jpg');
      files.push(new File([blob], name, { type: blob.type || 'application/octet-stream' }));
    }

    const payloadAll = { files, title: item.title || 'Homework', text: buildWhatsAppMessage(item) };
    if (navigator.canShare(payloadAll)) {
      await navigator.share(payloadAll);
      return true;
    }
    const payloadOne = { files: [files[0]], title: item.title || 'Homework', text: buildWhatsAppMessage(item) };
    if (navigator.canShare(payloadOne)) {
      await navigator.share(payloadOne);
      return true;
    }
    return shareOnWhatsApp(item);
  } catch (err) {
    if (err && err.name === 'AbortError') return false;   // user cancelled
    return shareOnWhatsApp(item);
  }
}