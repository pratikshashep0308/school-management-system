// FP-064 · Notification providers — the client never accepts a raw secret.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockUpsert = jest.fn();
jest.mock('../../utils/tfsAPI', () => ({
  notificationConfigAPI: {
    list: () => Promise.resolve({ data: { configs: [] } }),
    status: () => Promise.resolve({ data: { channels: {} } }),
    upsert: (...a) => mockUpsert(...a),
  },
  apiErrorMessage: (e, fb) => fb || 'error',
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'schoolAdmin' } }) }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));

import NotificationProviders from '../NotificationProviders';

beforeEach(() => mockUpsert.mockReset());

test('an inline secret is rejected client-side before any API call', async () => {
  render(<NotificationProviders />);
  await waitFor(() => screen.getByText(/Add or update a provider/));

  const refInput = screen.getByPlaceholderText('env:SMS_API_KEY');
  fireEvent.change(refInput, { target: { value: 'AC_raw_secret_value' } });
  fireEvent.click(screen.getByText(/Save provider/));

  // The guard fires and the API is never called with a raw secret.
  await waitFor(() => expect(screen.getByText(/never paste the secret/)).toBeInTheDocument());
  expect(mockUpsert).not.toHaveBeenCalled();
});

test('a reference form is accepted and sent', async () => {
  mockUpsert.mockResolvedValue({ data: {} });
  render(<NotificationProviders />);
  await waitFor(() => screen.getByText(/Add or update a provider/));

  fireEvent.change(screen.getByPlaceholderText('env:SMS_API_KEY'), { target: { value: 'env:SMS_KEY' } });
  fireEvent.click(screen.getByText(/Save provider/));
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  expect(mockUpsert.mock.calls[0][0].credentialsRef).toBe('env:SMS_KEY');
});
