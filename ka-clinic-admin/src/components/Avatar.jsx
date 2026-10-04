// Profile picture used everywhere a person is shown (patients and admins).
// With no photo, or if the photo fails to load, it shows a person icon
// instead of initials.
import { useEffect, useState } from 'react';
import { User } from 'lucide-react';

export default function Avatar({ src, alt = '', size = 40, className = '', iconClassName = 'text-slate-400', style }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const showPhoto = Boolean(src) && !failed;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-slate-100 border border-slate-200 ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      {showPhoto ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <User size={Math.round(size * 0.5)} strokeWidth={1.8} className={iconClassName} aria-label={alt || 'No photo'} />
      )}
    </span>
  );
}
