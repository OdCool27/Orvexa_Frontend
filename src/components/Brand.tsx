import { Link } from 'react-router-dom';

export function Brand({ surface = 'light' }: { surface?: 'light' | 'dark' }) {
  return (
    <Link to="/" className="brand" aria-label="Orvexa by Osyntra home">
      <img
        className="brand-logo"
        src={`/assets/orvexa-${surface === 'dark' ? 'light' : 'dark'}.png`}
        alt="Orvexa"
        width={2172}
        height={724}
      />
      <small className="brand-company">BY OSYNTRA</small>
    </Link>
  );
}
