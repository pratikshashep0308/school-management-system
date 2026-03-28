import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { libraryAPI, studentAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState, SearchBox } from '../components/ui';

export default function Library() {
  const { can } = useAuth();
  const [books, setBooks] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false, type: null, data: null });

  const load = async () => {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([libraryAPI.getBooks(), studentAPI.getAll()]);
      setBooks(bRes.data.data);
      setStudents(sRes.data.data);
    } catch { toast.error('Failed to load library'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = books.filter(b => !search || b.title?.toLowerCase().includes(search.toLowerCase()) || b.author?.toLowerCase().includes(search.toLowerCase()));

  const handleAddBook = async (form) => {
    try { await libraryAPI.addBook({ ...form, totalCopies: Number(form.totalCopies) }); toast.success('Book added'); setModal({ open: false }); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error adding book'); }
  };

  const handleIssue = async (form) => {
    try { await libraryAPI.issueBook({ bookId: form.bookId, studentId: form.studentId, days: 14 }); toast.success('Book issued successfully'); setModal({ open: false }); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Book not available'); }
  };

  const canManage = can(['superAdmin','schoolAdmin','librarian']);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Library</h2>
          <p className="text-sm text-muted mt-0.5">{books.length} books in inventory</p>
        </div>
        <div className="flex gap-2">
          {canManage && <button className="btn-secondary" onClick={() => setModal({ open: true, type: 'issue', data: {} })}>Issue Book</button>}
          {canManage && <button className="btn-primary" onClick={() => setModal({ open: true, type: 'add', data: {} })}>+ Add Book</button>}
        </div>
      </div>

      <div className="flex gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by title or author…" />
      </div>

      {loading ? <LoadingState /> : (
        <div className="card overflow-hidden">
          <div className="bg-warm px-5 py-3 grid gap-4 border-b border-border" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 80px 80px' }}>
            {['Book', 'Author', 'Category', 'ISBN', 'Total', 'Available', 'Actions'].map(h => <div key={h} className="table-th">{h}</div>)}
          </div>
          {!filtered.length ? <EmptyState icon="📚" title="No books found" /> : filtered.map(b => (
            <div key={b._id} className="grid gap-4 px-5 py-3.5 border-t border-border items-center hover:bg-warm/40 transition-colors" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 80px 80px' }}>
              <div className="font-medium text-sm text-ink">{b.title}</div>
              <div className="text-sm text-slate">{b.author}</div>
              <div><span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-50 text-purple-600">{b.category}</span></div>
              <div className="text-xs text-muted font-mono">{b.isbn}</div>
              <div className="text-sm text-slate">{b.totalCopies}</div>
              <div className={`text-sm font-bold ${b.availableCopies > 0 ? 'text-sage' : 'text-accent'}`}>{b.availableCopies}</div>
              <div>
                {canManage && b.availableCopies > 0 && (
                  <button onClick={() => setModal({ open: true, type: 'issue', data: { bookId: b._id } })}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-sage/30 text-sage hover:bg-sage/10 transition-all font-medium">Issue</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modal.open && modal.type === 'add'} onClose={() => setModal({ open: false })} title="Add Book to Library"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false })}>Cancel</button>
          <button className="btn-primary" onClick={() => handleAddBook(modal.data || {})}>Add Book</button></>}>
        {modal.open && modal.type === 'add' && <BookForm data={modal.data} setData={d => setModal(p => ({ ...p, data: d }))} />}
      </Modal>

      <Modal isOpen={modal.open && modal.type === 'issue'} onClose={() => setModal({ open: false })} title="Issue Book"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false })}>Cancel</button>
          <button className="btn-primary" onClick={() => handleIssue(modal.data || {})}>Issue</button></>}>
        {modal.open && modal.type === 'issue' && (
          <div className="grid gap-4">
            <FormGroup label="Book">
              <select className="form-input" value={modal.data?.bookId || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, bookId: e.target.value } }))}>
                <option value="">Select book</option>
                {books.filter(b => b.availableCopies > 0).map(b => <option key={b._id} value={b._id}>{b.title} ({b.availableCopies} available)</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Student">
              <select className="form-input" value={modal.data?.studentId || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, studentId: e.target.value } }))}>
                <option value="">Select student</option>
                {students.map(s => <option key={s._id} value={s._id}>{s.user?.name} ({s.admissionNumber})</option>)}
              </select>
            </FormGroup>
            <p className="text-xs text-muted">Default loan period: 14 days. Late fee: ₹5/day.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BookForm({ data, setData }) {
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const d = data || {};
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormGroup label="Book Title" className="col-span-2"><input className="form-input" value={d.title || ''} onChange={e => set('title', e.target.value)} placeholder="Introduction to Physics" /></FormGroup>
      <FormGroup label="Author"><input className="form-input" value={d.author || ''} onChange={e => set('author', e.target.value)} placeholder="H.C. Verma" /></FormGroup>
      <FormGroup label="ISBN"><input className="form-input" value={d.isbn || ''} onChange={e => set('isbn', e.target.value)} placeholder="978-0-00-000000-0" /></FormGroup>
      <FormGroup label="Category">
        <select className="form-input" value={d.category || ''} onChange={e => set('category', e.target.value)}>
          <option value="">Select</option>
          {['Science','Mathematics','Literature','History','Computer','Reference','Other'].map(c => <option key={c}>{c}</option>)}
        </select>
      </FormGroup>
      <FormGroup label="Total Copies"><input type="number" className="form-input" value={d.totalCopies || ''} onChange={e => set('totalCopies', e.target.value)} placeholder="5" /></FormGroup>
      <FormGroup label="Publisher"><input className="form-input" value={d.publisher || ''} onChange={e => set('publisher', e.target.value)} placeholder="Publisher name" /></FormGroup>
      <FormGroup label="Publish Year"><input type="number" className="form-input" value={d.publishYear || ''} onChange={e => set('publishYear', e.target.value)} placeholder="2024" /></FormGroup>
    </div>
  );
}
