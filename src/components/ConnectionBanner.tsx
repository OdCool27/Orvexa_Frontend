import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online ? null : (
    <div className="connection-banner" role="status">
      <WifiOff size={17} />
      <span>
        You’re offline. Displayed information may be out of date. Reconnect before making changes or
        completing checkout.
      </span>
    </div>
  );
}
