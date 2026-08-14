// frontend/src/pages/__tests__/PromotionWorkflow.test.js
//
// FP-063 · Promotion workflow — behavioural tests.
//
// These render the real component with a mocked API and assert what the USER
// sees: a D-011 blocker is explained (not a crash), the preview renders, and
// confirmation is required before promoting. The client never computes an
// outcome; every number shown comes from the mocked API response.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API and auth so the component runs in isolation.
const mockPreview = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../../utils/tfsAPI', () => ({
  sisAPI: {
    previewPromotion: (...a) => mockPreview(...a),
    confirmPromotion: (...a) => mockConfirm(...a),
  },
  apiErrorMessage: (err, fb) => err?.response?.data?.message || fb || 'error',
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'schoolAdmin' } }),
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

import PromotionWorkflow from '../PromotionWorkflow';

function fillInputs() {
  const inputs = screen.getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value: 'class-1' } });
  fireEvent.change(inputs[1], { target: { value: 'group-1' } });
  fireEvent.change(inputs[2], { target: { value: 'year-26' } });
}

beforeEach(() => { mockPreview.mockReset(); mockConfirm.mockReset(); });

describe('a D-011 blocker is EXPLAINED, not crashed', () => {
  test('missing marks render the blocker with the missing pairs', async () => {
    mockPreview.mockRejectedValue({
      response: { status: 422, data: {
        code: 'PROMOTION_BLOCKED_MARKS_INCOMPLETE',
        message: 'Published marks are missing.',
        missing: [{ subjectName: 'Science', student: 'stu-000123' }],
      } },
    });
    render(<PromotionWorkflow />);
    fillInputs();
    fireEvent.click(screen.getByText(/Preview promotion/));

    await waitFor(() => expect(screen.getByText(/Promotion is blocked/)).toBeInTheDocument());
    expect(screen.getByText(/Published marks are missing/)).toBeInTheDocument();
    expect(screen.getByText(/Science/)).toBeInTheDocument();
  });

  test('an unpublished group shows its message', async () => {
    mockPreview.mockRejectedValue({
      response: { status: 422, data: {
        code: 'PROMOTION_BLOCKED_GROUP_UNPUBLISHED',
        message: 'Final results must be announced before promotion can run.',
      } },
    });
    render(<PromotionWorkflow />);
    fillInputs();
    fireEvent.click(screen.getByText(/Preview promotion/));
    await waitFor(() => expect(screen.getByText(/must be announced/)).toBeInTheDocument());
  });
});

describe('preview then confirm', () => {
  const previewData = {
    counts: { total: 3, promoted: 2, retained: 1, graduated: 0 },
    rows: [
      { student: 'stu-aaa111', decision: 'promoted', failedSubjects: [] },
      { student: 'stu-bbb222', decision: 'promoted', failedSubjects: [] },
      { student: 'stu-ccc333', decision: 'retained', retentionReason: 'Failed Maths', failedSubjects: ['Maths'] },
    ],
  };

  test('the preview renders counts from the API, not computed client-side', async () => {
    mockPreview.mockResolvedValue({ data: { preview: previewData } });
    render(<PromotionWorkflow />);
    fillInputs();
    fireEvent.click(screen.getByText(/Preview promotion/));

    await waitFor(() => expect(screen.getByText(/3 students/)).toBeInTheDocument());
    expect(screen.getByText(/Failed Maths/)).toBeInTheDocument();
  });

  test('confirming requires an explicit modal step before promoting', async () => {
    mockPreview.mockResolvedValue({ data: { preview: previewData } });
    mockConfirm.mockResolvedValue({ data: { promoted: 2, retained: 1, graduated: 0 } });
    render(<PromotionWorkflow />);
    fillInputs();
    fireEvent.click(screen.getByText(/Preview promotion/));
    await waitFor(() => screen.getByText(/Confirm promotion/));

    // Clicking "Confirm promotion" opens a modal; the API is NOT called yet.
    fireEvent.click(screen.getByText(/Confirm promotion/));
    expect(mockConfirm).not.toHaveBeenCalled();

    // Only the modal's explicit "Yes, promote" triggers the call.
    await waitFor(() => screen.getByText(/Yes, promote/));
    fireEvent.click(screen.getByText(/Yes, promote/));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
  });

  test('a 503 (no transaction support) is surfaced honestly', async () => {
    const toast = require('react-hot-toast').default;
    mockPreview.mockResolvedValue({ data: { preview: previewData } });
    mockConfirm.mockRejectedValue({ response: { status: 503, data: {} } });
    render(<PromotionWorkflow />);
    fillInputs();
    fireEvent.click(screen.getByText(/Preview promotion/));
    await waitFor(() => screen.getByText(/Confirm promotion/));
    fireEvent.click(screen.getByText(/Confirm promotion/));
    await waitFor(() => screen.getByText(/Yes, promote/));
    fireEvent.click(screen.getByText(/Yes, promote/));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/transaction-capable/)));
  });
});

describe('authorization is UX-only; the backend remains authoritative', () => {
  test('a non-admin sees a restricted message instead of the form', () => {
    // Re-point the already-registered auth mock to a teacher for this test.
    const auth = require('../../context/AuthContext');
    auth.useAuth = () => ({ user: { role: 'teacher' } });
    render(<PromotionWorkflow />);
    expect(screen.getByText(/restricted to administrators/i)).toBeInTheDocument();
    // Restore for any later test.
    auth.useAuth = () => ({ user: { role: 'schoolAdmin' } });
  });
});
