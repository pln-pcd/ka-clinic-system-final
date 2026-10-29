import { Download, ShieldCheck, X } from 'lucide-react';

export default function BookingModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="booking-title" className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl" onClick={event => event.stopPropagation()}>
        <button onClick={onClose} aria-label="Close booking information" className="absolute right-4 top-4 text-slate-500"><X size={20} /></button>
        <ShieldCheck className="mb-4 text-blue-900" size={32} />
        <h2 id="booking-title" className="text-xl font-bold text-slate-900">Book through the patient app</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Sign in with your Medical Record Number (MRN), password, and email verification code. Open Appointments to request a schedule linked to your own record.</p>
        <a className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-900 px-5 py-3 font-semibold text-white transition hover:bg-blue-800" href="https://github.com/pln-pcd/ka-clinic-system-final/releases/download/v1.0.28/ka-clinic-1.0.28.apk" download="ka-clinic-1.0.28.apk"><Download size={18} /> Download Android app (APK)</a>
      </section>
    </div>
  );
}
