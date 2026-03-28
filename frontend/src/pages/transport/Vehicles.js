// frontend/src/pages/transport/Vehicles.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { vehicleAPI, driverAPI, routeAPI } from '../../utils/transportAPI';

const EMPTY = {
  registrationNo: '', type: 'bus', make: '', model: '', year: new Date().getFullYear(),
  capacity: 40, color: '', gpsDeviceId: '',
  driver: '', assignedRoute: '', status: 'active',
  insurance: { provider: '', policyNo: '', expiry: '' },
  fitness:   { certificateNo: '', expiry: '' },
  puc:       { certificateNo: '', expiry: '' },
};

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [drivers,  setDrivers]  = useState([]);
  const [routes,   setRoutes]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);  // null | 'add' | 'edit' | 'maintenance' | 'fuel'
  const [selected, setSelected] = useState(null);
  const [form,     setForm]     = useState(EMPTY);
  const [maintForm, setMaintForm] = useState({ type: 'service', description: '', date: '', cost: '', nextDueDate: '', vendor: '' });
  const [fuelForm,  setFuelForm]  = useState({ litres: '', cost: '', odometer: '', filledBy: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [v, d, r] = await Promise.all([vehicleAPI.getAll(), driverAPI.getAll(), routeAPI.getAll()]);
      setVehicles(v.data.data);
      setDrivers(d.data.data);
      setRoutes(r.data.data);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const set = (key, val) => setForm(f => {
    if (key.includes('.')) {
      const [a, b] = key.split('.');
      return { ...f, [a]: { ...f[a], [b]: val } };
    }
    return { ...f, [key]: val };
  });

  const handleSave = async () => {
    try {
      if (selected) { await vehicleAPI.update(selected._id, form); toast.success('Vehicle updated'); }
      else          { await vehicleAPI.create(form); toast.success('Vehicle added'); }
      setModal(null); setSelected(null); setForm(EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving vehicle'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vehicle?')) return;
    try { await vehicleAPI.delete(id); toast.success('Vehicle removed'); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleMaintenance = async () => {
    try { await vehicleAPI.addMaintenance(selected._id, { ...maintForm, date: new Date(maintForm.date), cost: +maintForm.cost }); toast.success('Maintenance logged'); setModal(null); load(); }
    catch { toast.error('Error'); }
  };

  const handleFuel = async () => {
    try { await vehicleAPI.addFuel(selected._id, { litres: +fuelForm.litres, cost: +fuelForm.cost, odometer: +fuelForm.odometer, filledBy: fuelForm.filledBy }); toast.success('Fuel logged'); setModal(null); load(); }
    catch { toast.error('Error'); }
  };

  const statusColor = { active: 'bg-green-100 text-green-700', maintenance: 'bg-amber-100 text-amber-700', inactive: 'bg-gray-100 text-gray-500' };
  const typeIcon    = { bus: '🚌', van: '🚐', minibus: '🚎', auto: '🛺' };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vehicles</h2>
          <p className="text-sm text-gray-500">{vehicles.length} vehicles registered</p>
        </div>
        <button onClick={() => { setSelected(null); setForm(EMPTY); setModal('add'); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700">
          + Add Vehicle
        </button>
      </div>

      {loading ? <div className="text-center py-16 text-3xl animate-bounce">🚌</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map(v => (
            <div key={v._id} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{typeIcon[v.type] || '🚌'}</span>
                  <div>
                    <p className="font-bold text-gray-900 font-mono">{v.registrationNo}</p>
                    <p className="text-xs text-gray-500">{v.make} {v.model} {v.year}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[v.status]}`}>
                  {v.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Capacity" value={`${v.capacity} seats`} />
                <Info label="Driver"   value={v.driver?.name || '—'} />
                <Info label="Route"    value={v.assignedRoute?.name || '—'} />
                <Info label="GPS ID"   value={v.gpsDeviceId || '—'} />
              </div>

              {/* Document expiry warnings */}
              {v.insurance?.expiry && new Date(v.insurance.expiry) < new Date(Date.now() + 30*24*60*60*1000) && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">⚠️ Insurance expires {new Date(v.insurance.expiry).toLocaleDateString('en-IN')}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setSelected(v); setForm({ ...v, driver: v.driver?._id || '', assignedRoute: v.assignedRoute?._id || '' }); setModal('edit'); }}
                  className="flex-1 text-xs border border-gray-200 rounded-lg py-1.5 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">
                  ✏️ Edit
                </button>
                <button onClick={() => { setSelected(v); setModal('maintenance'); }}
                  className="flex-1 text-xs border border-gray-200 rounded-lg py-1.5 hover:bg-amber-50 hover:text-amber-600">
                  🔧 Service
                </button>
                <button onClick={() => { setSelected(v); setModal('fuel'); }}
                  className="flex-1 text-xs border border-gray-200 rounded-lg py-1.5 hover:bg-green-50 hover:text-green-600">
                  ⛽ Fuel
                </button>
                <button onClick={() => handleDelete(v._id)}
                  className="text-xs border border-red-200 text-red-500 rounded-lg px-2 py-1.5 hover:bg-red-50">
                  🗑
                </button>
              </div>
            </div>
          ))}
          {vehicles.length === 0 && <div className="col-span-3 text-center text-gray-400 py-16">No vehicles added yet</div>}
        </div>
      )}

      {/* Add / Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'edit' ? 'Edit Vehicle' : 'Add Vehicle'} onClose={() => setModal(null)} onSave={handleSave}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Registration No *" value={form.registrationNo} onChange={v => set('registrationNo', v)} placeholder="MH12AB1234" />
            <div>
              <label className="label">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className="input">
                {['bus','van','minibus','auto'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Make"     value={form.make}     onChange={v => set('make', v)}     placeholder="TATA" />
            <Field label="Model"    value={form.model}    onChange={v => set('model', v)}    placeholder="Starbus" />
            <Field label="Year"     value={form.year}     onChange={v => set('year', v)}     type="number" />
            <Field label="Capacity" value={form.capacity} onChange={v => set('capacity', v)} type="number" />
            <Field label="GPS Device ID" value={form.gpsDeviceId} onChange={v => set('gpsDeviceId', v)} placeholder="Optional" />
            <div>
              <label className="label">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="input">
                {['active','maintenance','inactive'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Driver</label>
              <select value={form.driver} onChange={e => set('driver', e.target.value)} className="input">
                <option value="">— No driver —</option>
                {drivers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Assigned Route</label>
              <select value={form.assignedRoute} onChange={e => set('assignedRoute', e.target.value)} className="input">
                <option value="">— No route —</option>
                {routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
            </div>
            {/* Documents */}
            <div className="col-span-2 border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Documents</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Insurance Expiry" value={form.insurance?.expiry?.split('T')[0]} onChange={v => set('insurance.expiry', v)} type="date" />
                <Field label="Fitness Expiry"   value={form.fitness?.expiry?.split('T')[0]}   onChange={v => set('fitness.expiry', v)}   type="date" />
                <Field label="PUC Expiry"       value={form.puc?.expiry?.split('T')[0]}       onChange={v => set('puc.expiry', v)}       type="date" />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Maintenance Modal */}
      {modal === 'maintenance' && (
        <Modal title={`🔧 Log Service — ${selected?.registrationNo}`} onClose={() => setModal(null)} onSave={handleMaintenance}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select value={maintForm.type} onChange={e => setMaintForm(f => ({ ...f, type: e.target.value }))} className="input">
                {['service','repair','tyre','other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Cost (₹)" value={maintForm.cost} onChange={v => setMaintForm(f => ({ ...f, cost: v }))} type="number" />
            <Field label="Date"        value={maintForm.date}        onChange={v => setMaintForm(f => ({ ...f, date: v }))}        type="date" />
            <Field label="Next Due"    value={maintForm.nextDueDate} onChange={v => setMaintForm(f => ({ ...f, nextDueDate: v }))} type="date" />
            <Field label="Vendor"      value={maintForm.vendor}      onChange={v => setMaintForm(f => ({ ...f, vendor: v }))}      placeholder="Garage name" />
            <div className="col-span-2">
              <label className="label">Description</label>
              <textarea value={maintForm.description} onChange={e => setMaintForm(f => ({ ...f, description: e.target.value }))}
                className="input h-20 resize-none" placeholder="Details of work done..." />
            </div>
          </div>
        </Modal>
      )}

      {/* Fuel Modal */}
      {modal === 'fuel' && (
        <Modal title={`⛽ Log Fuel — ${selected?.registrationNo}`} onClose={() => setModal(null)} onSave={handleFuel}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Litres"   value={fuelForm.litres}   onChange={v => setFuelForm(f => ({ ...f, litres: v }))}   type="number" placeholder="40" />
            <Field label="Cost (₹)" value={fuelForm.cost}     onChange={v => setFuelForm(f => ({ ...f, cost: v }))}     type="number" placeholder="3200" />
            <Field label="Odometer" value={fuelForm.odometer} onChange={v => setFuelForm(f => ({ ...f, odometer: v }))} type="number" placeholder="45230" />
            <Field label="Filled By" value={fuelForm.filledBy} onChange={v => setFuelForm(f => ({ ...f, filledBy: v }))} placeholder="Driver name" />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Shared small components ──────────────────────────────────────────────────
function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-700 truncate">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value || ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
  );
}

function Modal({ title, children, onClose, onSave }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="p-6">{children}</div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-xl text-sm">Cancel</button>
          <button onClick={onSave}  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  );
}