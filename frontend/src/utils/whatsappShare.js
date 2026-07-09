// Build a WhatsApp share link with a pre-filled homework/assignment message.
// Uses the standard wa.me endpoint — opens WhatsApp (app or web) so the user
// can pick a contact/group and send. No API keys needed.

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

// item: { kind: 'Homework'|'Assignment', title, subject, class, dueDate, description }
export function buildWhatsAppMessage(item) {
  const lines = [];
  lines.push(`\uD83D\uDCDA *${item.kind || 'Homework'}*`);
  if (item.title)   lines.push(`\u2022 *Title:* ${item.title}`);
  if (item.subject) lines.push(`\u2022 *Subject:* ${item.subject}`);
  if (item.class)   lines.push(`\u2022 *Class:* ${item.class}`);
  if (item.dueDate) lines.push(`\u2022 *Due Date:* ${fmtDate(item.dueDate)}`);
  if (item.description && item.description !== item.title) {
    lines.push('');
    lines.push(`\uD83D\uDCDD ${item.description}`);
  }
  if (Array.isArray(item.attachments) && item.attachments.length) {
    lines.push('');
    item.attachments.forEach((a) => {
      if (a && a.url) lines.push(`\uD83D\uDCCE ${a.name || 'Attachment'}: ${a.url}`);
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
// (mobile Chrome/Safari). Desktop browsers generally can't share files.
export function canShareFiles() {
  return typeof navigator !== 'undefined'
    && !!navigator.canShare
    && !!navigator.share;
}

// Fetch each attachment and open the native share sheet with the real files
// (image/PDF). The teacher then taps WhatsApp and the actual file is sent.
// Falls back to the text-only wa.me share if file sharing isn't supported.
export async function shareFilesToWhatsApp(item) {
  const atts = Array.isArray(item.attachments) ? item.attachments.filter(a => a && a.url) : [];
  if (!atts.length || !canShareFiles()) {
    // Nothing to share as a file, or unsupported → fall back to text share
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

    // Some browsers only allow one file; try all first, then the first file.
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
    // Couldn't share files → fall back to text
    return shareOnWhatsApp(item);
  } catch (err) {
    // User cancelled or fetch failed → fall back to text share
    if (err && err.name === 'AbortError') return false;
    return shareOnWhatsApp(item);
  }
}