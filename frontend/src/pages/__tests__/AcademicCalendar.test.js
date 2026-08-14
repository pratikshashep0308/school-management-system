// FP-060 · Academic Calendar — behavioural tests (loading, empty, confirm gate).
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockListYears = jest.fn();
const mockListHolidays = jest.fn();
const mockActivate = jest.fn();
jest.mock('../../utils/tfsAPI', () => ({
  calendarAPI: {
    listYears: (...a) => mockListYears(...a),
    listHolidays: (...a) => mockListHolidays(...a),
    activateYear: (...a) => mockActivate(...a),
    createYear: jest.fn(), createHoliday: jest.fn(), deleteHoliday: jest.fn(),
  },
  apiErrorMessage: (e, fb) => fb || 'error',
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'schoolAdmin' } }) }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));

import AcademicCalendar from '../AcademicCalendar';

beforeEach(() => { mockListYears.mockReset(); mockListHolidays.mockReset(); mockActivate.mockReset(); mockListHolidays.mockResolvedValue({ data: { holidays: [] } }); });

test('shows a loading state, then an empty state when there are no years', async () => {
  mockListYears.mockResolvedValue({ data: { years: [] } });
  render(<AcademicCalendar />);
  expect(screen.getByText(/Loading academic calendar/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/No academic years yet/)).toBeInTheDocument());
});

test('activating a year requires an explicit confirmation modal', async () => {
  mockListYears.mockResolvedValue({ data: { years: [
    { _id: 'y1', name: '2026-27', status: 'active', isActive: true, startDate: '2026-06-15', endDate: '2027-04-30' },
    { _id: 'y2', name: '2027-28', status: 'draft', isActive: false, startDate: '2027-06-15', endDate: '2028-04-30' },
  ] } });
  mockActivate.mockResolvedValue({ data: {} });
  render(<AcademicCalendar />);

  await waitFor(() => screen.getByText('2027-28'));
  fireEvent.click(screen.getByText('2027-28'));
  await waitFor(() => screen.getByText(/Make this the active year/));
  fireEvent.click(screen.getByText(/Make this the active year/));

  // A confirmation modal appears; activate is NOT called yet.
  await waitFor(() => screen.getByText(/Activate academic year\?/));
  expect(mockActivate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText(/Activate 2027-28/));
  await waitFor(() => expect(mockActivate).toHaveBeenCalledWith('y2'));
});
