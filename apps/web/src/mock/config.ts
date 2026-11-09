import { MockClient } from '../api/mock-client';
export const mockEnabled = import.meta.env.VITE_DATA_PROVIDER === 'mock';
export const mockTokenKey = 'mock_access_token';
export const mockUserKey = 'mock_user';
// Explicit mock builds are local-only. Default production build keeps legacy behavior.
if (mockEnabled && import.meta.env.PROD) throw new Error('Mock UI requires development mode');
export const mockApi = mockEnabled ? new MockClient('mock', () => localStorage.getItem(mockTokenKey)) : null;
