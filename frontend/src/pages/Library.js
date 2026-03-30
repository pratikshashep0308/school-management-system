// frontend/src/pages/Library.js
// Complete Library Management System — Books, Issues, Returns, Reports
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { libraryAPI, studentAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState, SearchBox } from '../components/ui';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'books',   label: 'Books',        icon: '📚' },
  { id: 'issued',  label: 'Issued Books',  icon: '📤' },
  { id: 'overdue', label: 'Overdue',       icon: '⏰' },
  { id: 'returns', label: 'Returns',       icon: '📥' },
];

const CATEGORIES = ['Science','Mathematics','Literature','History','Computer','Reference','Geography','Art','Sports','Other'];

export default function Library() {
  const { can } = useAuth();
  const [tab,      setTab]      = useState('books');
  const [books,    setBooks]    = useState([]);
  const [issues,   setIssues]   = useState([]);
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [catFilter,setCat]      = useState('');
  // Book modal
  const [bookModal,  setBookModal]  = useState({ open: false, data: {} });
  const [bookForm,   setBookForm]   = useState({});
  const [bookSaving, setBookSaving] = useState(false);
  // Issue modal
  const [issueModal, setIssueModal] = useState({ open: false, bookId: '' });
  const [issueForm,  setIssueForm]  = useState({ bookId: '', studentId: '', days: 14 });
  // Return state
  const [returning,  setReturning]  = useState(null);

  const canManage = can(['superAdmin','schoolAdmin','librarian']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, iRes, sRes] = await Promise.allSettled([
        libraryAPI.getBooks(),
        libraryAPI.getIssues(),
        studentAPI.getAll(),
      ]);
      if (bRes.status === 'fulfilled') setBooks(bRes.value.data.data || []);
      if (iRes.status === 'fulfilled') setIssues(iRes.value.data.data || []);
      if (sRes.status === 'fulfilled') setStudents(sRes.value.data.data || []);
    } catch { toast.error('Failed to load library'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalBooks    = books.reduce((s, b) => s + (b.totalCopies || 0), 0);
  const available     = books.reduce((s, b) => s + (b.availableCopies || 0), 0);
  const issuedCount   = issues.filter(i => i.status === 'issued').length;
  const overdueCount  = issues.filter(i => i.status === 'issued' && new Date(i.dueDate) < new Date()).length;
  const lateFeeTotal  = issues.reduce((s, i) => s + (i.lateFee || 0), 0);

  // ── Filtered books ─────────────────────────────────────────────────────────
  const filteredBooks = books.filter(b => {
    const matchSearch = !search || b.title?.toLowerCase().includes(search.toLowerCase()) || b.author?.toLowerCase().includes(search.toLowerCase()) || b.isbn?.includes(search);
    const matchCat    = !catFilter || b.category === catFilter;
    return matchSearch && matchCat;
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddBook = async () => {
    if (!bookForm.title?.trim()) return toast.error('Book title is required');
    setBookSaving(true);
    try {
      if (bookForm._id) {
        await libraryAPI.updateBook(bookForm._id, bookForm);
        toast.success('Book updated');
      } else {
        await libraryAPI.addBook({ ...bookForm, totalCopies: Number(bookForm.totalCopies || 1) });
        toast.success('Book added to library');
      }
      setBookModal({ open: false, data: {} }); setBookForm({}); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving book'); }
    finally { setBookSaving(false); }
  };

  const openEdit = (b) => { setBookForm({ ...b }); setBookModal({ open: true, data: b }); };
  const openAdd  = () => { setBookForm({}); setBookModal({ open: true, data: null }); };

  const handleIssue = async () => {
    if (!issueForm.bookId || !issueForm.studentId) return toast.error('Select book and student');
    try {
      await libraryAPI.issueBook({ bookId: issueForm.bookId, studentId: issueForm.studentId, days: Number(issueForm.days) });
      toast.success('Book issued successfully ✅');
      setIssueModal({ open: false, bookId: '' }); setIssueForm({ bookId: '', studentId: '', days: 14 }); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Book not available'); }
  };

  const handleReturn = async (issueId) => {
    setReturning(issueId);
    try {
      const res = await libraryAPI.returnBook(issueId);
      const fee = res.data.lateFee || 0;
      toast.success(fee > 0 ? `Book returned. Late fee: ₹${fee}` : 'Book returned successfully ✅');
      load();
    } catch { toast.error('Error returning book'); }
    finally { setReturning(null); }
  };

  const issuedList  = issues.filter(i => i.status === 'issued');
  const overdueList = issues.filter(i => i.status === 'issued' && new Date(i.dueDate) < new Date());
  const returnList  = issues.filter(i => i.status === 'returned').slice(0, 50);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">Library</h2>
          <p className="text-sm text-muted">{books.length} titles · {totalBooks} total copies</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => { setIssueForm({ bookId: '', studentId: '', days: 14 }); setIssueModal({ open: true, bookId: '' }); }}>
              📤 Issue Book
            </button>
            <button className="btn-primary" onClick={openAdd}>+ Add Book</button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Titles',   value: books.length,  icon: '📚', color: 'text-blue-600 bg-blue-50' },
          { label: 'Total Copies',   value: totalBooks,    icon: '📖', color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Available',      value: available,     icon: '✅', color: 'text-green-600 bg-green-50' },
          { label: 'Issued',         value: issuedCount,   icon: '📤', color: 'text-amber-600 bg-amber-50' },
          { label: 'Overdue',        value: overdueCount,  icon: '⏰', color: 'text-red-600 bg-red-50' },
        ].map(s => (
          <div key={s.label} className={'card p-4 flex items-center gap-3'}>
            <div className={'w-10 h-10 rounded-xl flex items-center justify-center text-xl ' + s.color}>{s.icon}</div>
            <div>
              <div className="text-2xl font-display text-ink dark:text-white">{s.value}</div>
              <div className="text-xs text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl border border-border bg-warm dark:bg-gray-800 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ' +
              (tab === t.id ? 'bg-white dark:bg-gray-700 shadow-sm text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
            {t.icon} {t.label}
            {t.id === 'overdue' && overdueCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? <LoadingState /> : (
        <>
          {/* ── BOOKS TAB ── */}
          {tab === 'books' && (
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                <SearchBox value={search} onChange={setSearch} placeholder="Search title, author, ISBN…" />
                <select className="form-input w-44" value={catFilter} onChange={e => setCat(e.target.value)}>
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {!filteredBooks.length ? <EmptyState icon="📚" title="No books found" /> : (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-warm dark:bg-gray-800 border-b border-border dark:border-gray-700">
                        <tr>
                          {['Book Title','Author','Category','ISBN','Copies','Available','Actions'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border dark:divide-gray-700">
                        {filteredBooks.map(b => (
                          <tr key={b._id} className="hover:bg-warm/40 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-ink dark:text-white">{b.title}</div>
                              {b.publisher && <div className="text-xs text-muted">{b.publisher} {b.publishYear && `· ${b.publishYear}`}</div>}
                            </td>
                            <td className="px-4 py-3 text-slate dark:text-gray-300">{b.author || '—'}</td>
                            <td className="px-4 py-3">
                              {b.category && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300">{b.category}</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted font-mono">{b.isbn || '—'}</td>
                            <td className="px-4 py-3 text-center font-medium text-ink dark:text-white">{b.totalCopies}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={'font-bold text-sm ' + (b.availableCopies > 0 ? 'text-green-600' : 'text-red-500')}>
                                {b.availableCopies}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1.5">
                                {canManage && b.availableCopies > 0 && (
                                  <button onClick={() => { setIssueForm({ bookId: b._id, studentId: '', days: 14 }); setIssueModal({ open: true, bookId: b._id }); }}
                                    className="text-xs px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 font-semibold">📤 Issue</button>
                                )}
                                {canManage && (
                                  <button onClick={() => openEdit(b)}
                                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-slate hover:border-accent hover:text-accent">✎</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ISSUED TAB ── */}
          {tab === 'issued' && (
            <IssueTable issues={issuedList} onReturn={handleReturn} returning={returning} canManage={canManage} label="Currently Issued" emptyMsg="No books currently issued" />
          )}

          {/* ── OVERDUE TAB ── */}
          {tab === 'overdue' && (
            <div className="space-y-3">
              {overdueCount > 0 && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-300">{overdueCount} overdue book{overdueCount > 1 ? 's' : ''}</p>
                    <p className="text-xs text-red-600 dark:text-red-400">Total pending late fee: ₹{overdueList.reduce((s, i) => s + Math.max(0, Math.floor((new Date() - new Date(i.dueDate)) / 86400000)) * 5, 0)}</p>
                  </div>
                </div>
              )}
              <IssueTable issues={overdueList} onReturn={handleReturn} returning={returning} canManage={canManage} overdue label="Overdue Books" emptyMsg="🎉 No overdue books!" />
            </div>
          )}

          {/* ── RETURNS TAB ── */}
          {tab === 'returns' && (
            <IssueTable issues={returnList} canManage={false} label="Return History" emptyMsg="No returned books yet" showLateFee />
          )}
        </>
      )}

      {/* ── ADD/EDIT BOOK MODAL ── */}
      <Modal isOpen={bookModal.open} onClose={() => { setBookModal({ open: false, data: {} }); setBookForm({}); }}
        title={bookForm._id ? 'Edit Book' : 'Add Book to Library'} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => { setBookModal({ open: false, data: {} }); setBookForm({}); }}>Cancel</button>
          <button className="btn-primary" onClick={handleAddBook} disabled={bookSaving}>{bookSaving ? 'Saving…' : bookForm._id ? 'Update Book' : 'Add Book'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Book Title *" className="col-span-2">
            <input className="form-input" value={bookForm.title || ''} onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} placeholder="Introduction to Physics" />
          </FormGroup>
          <FormGroup label="Author">
            <input className="form-input" value={bookForm.author || ''} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} placeholder="H.C. Verma" />
          </FormGroup>
          <FormGroup label="ISBN">
            <input className="form-input" value={bookForm.isbn || ''} onChange={e => setBookForm(f => ({ ...f, isbn: e.target.value }))} placeholder="978-0-00-000000-0" />
          </FormGroup>
          <FormGroup label="Category">
            <select className="form-input" value={bookForm.category || ''} onChange={e => setBookForm(f => ({ ...f, category: e.target.value }))}>
              <option value="">Select category</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Total Copies">
            <input type="number" className="form-input" value={bookForm.totalCopies || ''} onChange={e => setBookForm(f => ({ ...f, totalCopies: e.target.value }))} placeholder="5" min="1" />
          </FormGroup>
          <FormGroup label="Publisher">
            <input className="form-input" value={bookForm.publisher || ''} onChange={e => setBookForm(f => ({ ...f, publisher: e.target.value }))} placeholder="Publisher name" />
          </FormGroup>
          <FormGroup label="Publish Year">
            <input type="number" className="form-input" value={bookForm.publishYear || ''} onChange={e => setBookForm(f => ({ ...f, publishYear: e.target.value }))} placeholder="2024" />
          </FormGroup>
          <FormGroup label="Shelf / Location" className="col-span-2">
            <input className="form-input" value={bookForm.location || ''} onChange={e => setBookForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Rack A - Shelf 2" />
          </FormGroup>
        </div>
      </Modal>

      {/* ── ISSUE BOOK MODAL ── */}
      <Modal isOpen={issueModal.open} onClose={() => setIssueModal({ open: false, bookId: '' })}
        title="Issue Book to Student" size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => setIssueModal({ open: false, bookId: '' })}>Cancel</button>
          <button className="btn-primary" onClick={handleIssue}>📤 Issue Book</button>
        </>}>
        <div className="space-y-4">
          <FormGroup label="Book *">
            <select className="form-input" value={issueForm.bookId} onChange={e => setIssueForm(f => ({ ...f, bookId: e.target.value }))}>
              <option value="">Select a book</option>
              {books.filter(b => b.availableCopies > 0).map(b => (
                <option key={b._id} value={b._id}>{b.title} — {b.author} ({b.availableCopies} available)</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Student *">
            <select className="form-input" value={issueForm.studentId} onChange={e => setIssueForm(f => ({ ...f, studentId: e.target.value }))}>
              <option value="">Select student</option>
              {students.map(s => (
                <option key={s._id} value={s._id}>{s.user?.name} {s.admissionNumber ? `(${s.admissionNumber})` : ''}</option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Loan Period (days)">
            <select className="form-input" value={issueForm.days} onChange={e => setIssueForm(f => ({ ...f, days: +e.target.value }))}>
              {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </FormGroup>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
            📌 Late fee: ₹5 per day after due date
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Reusable Issue Table ─────────────────────────────────────────────────────
function IssueTable({ issues, onReturn, returning, canManage, overdue, label, emptyMsg, showLateFee }) {
  if (!issues.length) return <EmptyState icon={overdue ? '🎉' : '📭'} title={emptyMsg} />;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide">{label} — {issues.length} records</p>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-warm dark:bg-gray-800 border-b border-border dark:border-gray-700">
              <tr>
                {['Book','Student','Issued','Due Date', showLateFee ? 'Late Fee' : 'Status','Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-gray-700">
              {issues.map(i => {
                const daysLate = i.status === 'issued' ? Math.max(0, Math.floor((new Date() - new Date(i.dueDate)) / 86400000)) : 0;
                const pendingFee = daysLate * 5;
                const isOverdue  = i.status === 'issued' && new Date(i.dueDate) < new Date();
                return (
                  <tr key={i._id} className={'hover:bg-warm/40 dark:hover:bg-gray-800/50 transition-colors' + (isOverdue ? ' bg-red-50/50 dark:bg-red-900/10' : '')}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink dark:text-white">{i.book?.title || '—'}</div>
                      <div className="text-xs text-muted">{i.book?.author}</div>
                    </td>
                    <td className="px-4 py-3 text-slate dark:text-gray-300">{i.student?.user?.name || '—'}</td>
                    <td className="px-4 py-3 text-muted text-xs">{i.issuedDate ? new Date(i.issuedDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={'text-xs font-semibold ' + (isOverdue ? 'text-red-600' : 'text-green-600')}>
                        {i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                      </span>
                      {isOverdue && <div className="text-[10px] text-red-500">{daysLate} days late · ₹{pendingFee}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {showLateFee
                        ? <span className={'text-xs font-bold ' + (i.lateFee > 0 ? 'text-red-600' : 'text-green-600')}>₹{i.lateFee || 0}</span>
                        : <span className={'text-xs font-semibold px-2 py-1 rounded-full ' + (i.status === 'returned' ? 'bg-green-100 text-green-700' : isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                            {isOverdue ? 'Overdue' : i.status}
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {canManage && i.status === 'issued' && (
                        <button
                          onClick={() => onReturn(i._id)}
                          disabled={returning === i._id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold disabled:opacity-50">
                          {returning === i._id ? '…' : '📥 Return'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}