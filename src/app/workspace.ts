import { useOutletContext } from 'react-router-dom';
import type { Business, Location } from '../api/types';

export interface Workspace {
  locationId: number | undefined;
  business: Business | undefined;
  locations: Location[];
}

export const useWorkspace = () => useOutletContext<Workspace>();
