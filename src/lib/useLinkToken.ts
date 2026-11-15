import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Link capabilities live only in component memory. Strip them from browser history before further navigation.
export function useLinkToken() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => new URLSearchParams(location.search).get('token') || '');
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('token')) return;
    setToken(params.get('token') || '');
    params.delete('token');
    navigate(
      { pathname: location.pathname, search: params.toString() ? `?${params}` : '' },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);
  return token;
}
