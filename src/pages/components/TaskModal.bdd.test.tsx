import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

// Mutable so individual tests can override (e.g. null user scenario).
let mockCurrentUser: any = { id: 'u1', full_name: 'Test User', email: 'test@test.com' };

const mockGetUsers = vi.fn();
const mockCreateTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockRecordActivity = vi.fn();
const mockShowError = vi.hoisted(() => vi.fn());
const mockEmitNotification = vi.fn();
const mockGetLeads = vi.fn();
const mockGetDeals = vi.fn();
const mockGetProjects = vi.fn();
const mockConnectTaskToProject = vi.fn();
const mockShowWarning = vi.hoisted(() => vi.fn());

vi.mock('../../services/crmService', () => ({
  crmService: {
    getUsers: (...a: any[]) => mockGetUsers(...a),
    createTask: (...a: any[]) => mockCreateTask(...a),
    updateTask: (...a: any[]) => mockUpdateTask(...a),
    getLeads: (...a: any[]) => mockGetLeads(...a),
    getDeals: (...a: any[]) => mockGetDeals(...a),
    getProjects: (...a: any[]) => mockGetProjects(...a),
    connectTaskToProject: (...a: any[]) => mockConnectTaskToProject(...a),
  },
}));

vi.mock('@so360/design-system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@so360/design-system')>();
  return {
    ...actual,
    toast: { ...actual.toast, error: mockShowError, warning: mockShowWarning },
  };
});

vi.mock('@so360/shell-context', () => ({
  useBusinessSettings: () => ({ settings: { base_currency: 'USD', document_language: 'en-US', timezone: 'UTC' } }),
  useShell: () => ({ user: mockCurrentUser }),
  useNotify: () => ({ emitNotification: (...a: any[]) => mockEmitNotification(...a) }),
  useActivity: () => ({ recordActivity: (...a: any[]) => mockRecordActivity(...a) }),
  useShellBridge: () => ({ effectiveFlagsLoaded: true, isFeatureEnabled: () => true, isFeatureHidden: () => false }),
  useQuota: () => ({
    quotas: [], isLoading: false, error: null,
    isExceeded: () => false, getQuota: () => null, getPercentage: () => 0, refresh: async () => {},
  }),
}));

vi.mock('../../utils/taskUtils', () => ({
  canCurrentUserBeAssigned: () => true,
}));

import TaskModal from './TaskModal';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USERS = [
  { id: 'u1', full_name: 'Test User',  email: 'test@test.com',  avatar_url: null },
  { id: 'u2', full_name: 'Other User', email: 'other@test.com', avatar_url: null },
];

const futureDate     = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const futureDatetime = `${futureDate}T10:00`;
const pastDate       = '2020-01-01';

const BASE_TASK = {
  id: 't1',
  title: 'Follow up call',
  description: 'Some details',
  status: 'OPEN' as const,
  due_date: futureDate,
  type: 'TODO' as const,
  assigned_to: { id: 'u1', full_name: 'Test User', email: 'test@test.com', avatar_url: '' },
};

// ── DOM helpers ───────────────────────────────────────────────────────────────
// Called lazily so they reflect current DOM state after re-renders.
const dateInputs    = () => document.querySelectorAll('input[type="date"]');
const startInput    = () => dateInputs()[0] as HTMLInputElement;
const dueInput      = () => (dateInputs()[1] ?? dateInputs()[0]) as HTMLInputElement;
const timeInput     = () => document.querySelector('input[type="time"]') as HTMLInputElement;
// The Priority select is filtered out so the positional index map below stays
// stable as fields are added around it — see prioritySelect() for that field.
// 'CRITICAL' is the top of the shared tasks_priority_check vocabulary and
// appears in no other select, so it identifies the Priority field positionally.
const isPrioritySelect = (el: HTMLSelectElement) =>
  Array.from(el.options).some((o) => o.value === 'CRITICAL');
const selects       = () =>
  Array.from(document.querySelectorAll('select')).filter(
    (el) => !isPrioritySelect(el),
  );
const prioritySelect = () =>
  Array.from(document.querySelectorAll('select')).find(
    isPrioritySelect,
  ) as HTMLSelectElement;
// select indices in create/TODO mode: [0]=type, [1]=assignee
// select indices in REMINDER mode:    [0]=type, [1]=reminderMinutes, [2]=assignee
// select indices in edit/TODO mode:   [0]=type, [1]=assignee, [2]=status

const MOCK_LEADS = [
  { id: 'lead-1', company_name: 'Acme Corp', contact_name: 'Alice' },
  { id: 'lead-2', company_name: '',           contact_name: 'Bob Smith' },
];
const MOCK_DEALS = [
  { id: 'deal-1', name: 'Enterprise Deal', company_name: 'Acme Corp' },
  { id: 'deal-2', name: '',                company_name: 'Beta Ltd' },
];
const MOCK_PROJECTS = [
  { id: 'proj-1', name: 'Website Revamp' },
  { id: 'proj-2', name: 'Mobile App' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentUser = { id: 'u1', full_name: 'Test User', email: 'test@test.com' };
  mockGetUsers.mockResolvedValue(USERS);
  mockCreateTask.mockResolvedValue({ id: 't-new', title: 'New Task', status: 'OPEN' });
  mockUpdateTask.mockResolvedValue({ id: 't1', title: 'Updated', status: 'OPEN' });
  mockRecordActivity.mockResolvedValue(undefined);
  mockEmitNotification.mockResolvedValue(undefined);
  mockGetLeads.mockResolvedValue(MOCK_LEADS);
  mockGetDeals.mockResolvedValue(MOCK_DEALS);
  mockGetProjects.mockResolvedValue(MOCK_PROJECTS);
  mockConnectTaskToProject.mockResolvedValue({ id: 't-new', sync_status: 'connected' });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TaskModal', () => {

  // ── Desktop layout: overlay must stack above the shell NavBar ──────────────
  // Regression: the New Task modal was clipped under the global header because
  // its overlay sat at z-50, below the sticky shell NavBar (.glass-nav, z-500).
  // The overlay must paint on top of the header — z-[600] — and stay centered.
  describe('Given a desktop viewport (overlay stacking)', () => {
    it('When rendered / Then the overlay paints above the NavBar (z-[600], not z-50)', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('New Task')).toBeInTheDocument());
      const overlay = document.querySelector('div.fixed.inset-0') as HTMLElement;
      expect(overlay).toBeTruthy();
      expect(overlay.className).toContain('z-[600]');
      expect(overlay.className).not.toContain('z-50');
    });

    it('When rendered / Then the overlay centers the modal in the viewport', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('New Task')).toBeInTheDocument());
      const overlay = document.querySelector('div.fixed.inset-0') as HTMLElement;
      expect(overlay.className).toContain('items-center');
      expect(overlay.className).toContain('justify-center');
    });
  });

  // ── Create mode: rendering ────────────────────────────────────────────────
  describe('Given no existing task (create mode)', () => {
    it('When rendered / Then shows "New Task" header', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('New Task')).toBeInTheDocument());
    });

    it('When rendered / Then shows the task title input', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByPlaceholderText(/follow up/i)).toBeInTheDocument());
    });

    it('When rendered / Then Start Date and Due Date appear as sibling date inputs', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/start date/i)).toBeInTheDocument();
        expect(screen.getByText(/due date/i)).toBeInTheDocument();
        expect(dateInputs()).toHaveLength(2);
      });
    });

    it('When rendered / Then Type is its own standalone field', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/^type$/i)).toBeInTheDocument());
      // Type select is present as the first select in the form
      expect(selects()[0]).toBeInTheDocument();
    });

    it('When rendered / Then Status field is hidden', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      expect(screen.queryByText(/^status$/i)).not.toBeInTheDocument();
    });

    it('When rendered / Then Reminder dropdown is hidden', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      expect(screen.queryByText(/remind me before/i)).not.toBeInTheDocument();
    });

    it('When rendered / Then Assign to Me button is disabled (auto-assigned to self)', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() =>
        expect(screen.getByTitle(/already assigned to you/i)).toBeInTheDocument()
      );
    });
  });

  // ── Edit mode: rendering ──────────────────────────────────────────────────
  describe('Given an existing task (edit mode)', () => {
    it('When rendered / Then shows "Edit Task" header and pre-fills title', async () => {
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('Edit Task')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Follow up call')).toBeInTheDocument();
      });
    });

    it('When rendered / Then shows the Status field', async () => {
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/^status$/i)).toBeInTheDocument());
    });

    it('When task has start_date / Then Start Date input is pre-filled', async () => {
      const task = { ...BASE_TASK, start_date: '2025-06-01T00:00:00.000Z' };
      render(<TaskModal task={task as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(startInput().value).toBe('2025-06-01'));
    });

    it('When task has no start_date / Then Start Date input is empty', async () => {
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(startInput().value).toBe(''));
    });

    it('When task has no due_date / Then Due Date input is empty', async () => {
      const task = { ...BASE_TASK, due_date: undefined };
      render(<TaskModal task={task as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(dueInput().value).toBe(''));
    });

    it('When task type is REMINDER / Then the stored instant splits across the Due Date and Due Time inputs', async () => {
      const savedInstant = new Date('2025-08-15T10:30:00').toISOString();
      const task = {
        ...BASE_TASK,
        type: 'REMINDER' as const,
        due_date: savedInstant,
        reminder_minutes_before: 30,
      };
      render(<TaskModal task={task as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => {
        expect(dueInput().value).toBe('2025-08-15');
        expect(timeInput().value).toBe('10:30');
      });
    });
  });

  // ── Type selector behaviour ───────────────────────────────────────────────
  describe('Given the user changes the task type', () => {
    it('When changed to REMINDER / Then a default time is offered and the reminder dropdown appears', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      fireEvent.change(selects()[0], { target: { value: 'REMINDER' } });
      expect(timeInput()).toBeInTheDocument();
      // A reminder must ring at a moment, so it never starts out timeless.
      expect(timeInput().value).toBe('09:00');
      expect(timeInput().required).toBe(true);
      expect(screen.getByText(/remind me before/i)).toBeInTheDocument();
    });

    it('When changed back from REMINDER / Then Due Date and an optional Due Time remain, reminder dropdown hidden', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      fireEvent.change(selects()[0], { target: { value: 'REMINDER' } });
      fireEvent.change(selects()[0], { target: { value: 'CALL' } });
      expect(screen.getByText(/due date/i)).toBeInTheDocument();
      expect(dateInputs()).toHaveLength(2);
      // Time survives the switch — every kind of task may carry one now.
      expect(timeInput()).toBeInTheDocument();
      expect(timeInput().required).toBe(false);
      expect(screen.queryByText(/remind me before/i)).not.toBeInTheDocument();
    });
  });

  // ── Validation ────────────────────────────────────────────────────────────
  describe('Given form validation', () => {
    it('When submitted with no due date / Then shows error and blocks API call', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      // due date intentionally left empty
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Please select a due date.')
      );
      expect(mockCreateTask).not.toHaveBeenCalled();
    });

    it('When submitted with a past date-only due date / Then shows past-date error and blocks API call', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: pastDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith(
          'Due Date cannot be in the past. Please select today or a future date.'
        )
      );
      expect(mockCreateTask).not.toHaveBeenCalled();
    });

    it('When REMINDER type with a past date / Then the past-date rule still blocks', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(selects()[0], { target: { value: 'REMINDER' } });
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: pastDate } });
      fireEvent.change(timeInput(), { target: { value: '10:00' } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith(
          'Due Date cannot be in the past. Please select today or a future date.'
        )
      );
      expect(mockCreateTask).not.toHaveBeenCalled();
    });
  });

  // ── Create submission: all branches ───────────────────────────────────────
  describe('Given the form is submitted in create mode', () => {
    it('When submitted with title and future due date / Then calls createTask', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Call client' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    });

    it('When leadId provided / Then payload includes lead_id', async () => {
      render(<TaskModal leadId="lead-123" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 'lead-123' }))
      );
    });

    it('When no priority is chosen / Then the payload defaults to MEDIUM', async () => {
      render(<TaskModal leadId="lead-123" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ priority: 'MEDIUM' }))
      );
    });

    it('When a priority is chosen / Then it reaches the create payload', async () => {
      // Regression: `tasks` is shared with Projects, which pinned the uppercase
      // vocabulary in tasks_priority_check. CRM used to submit lowercase, which
      // passed both the form and the DTO and then 500'd on the insert.
      render(<TaskModal leadId="lead-123" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.change(prioritySelect(), { target: { value: 'CRITICAL' } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ priority: 'CRITICAL' }))
      );
    });

    it('When editing a task / Then its stored priority preloads into the selector', async () => {
      render(<TaskModal task={{ ...BASE_TASK, priority: 'HIGH' } as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      expect(prioritySelect().value).toBe('HIGH');
    });

    it('When the priority selector is rendered / Then every option value matches the DB CHECK vocabulary', async () => {
      // Guards the exact mismatch that caused the 500: a UI option whose value
      // is not one of LOW | MEDIUM | HIGH | CRITICAL cannot be persisted.
      render(<TaskModal leadId="lead-123" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      const values = Array.from(prioritySelect().options).map((o) => o.value);
      expect(values).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    });

    it('When the priority selector is rendered / Then it still reads Low/Medium/High/Critical to the user', async () => {
      render(<TaskModal leadId="lead-123" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      const labels = Array.from(prioritySelect().options).map((o) => o.textContent);
      expect(labels).toEqual(['Low', 'Medium', 'High', 'Critical']);
    });

    it('When dealId provided / Then payload includes deal_id', async () => {
      render(<TaskModal dealId="deal-456" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ deal_id: 'deal-456' }))
      );
    });

    it('When start_date is filled / Then payload includes start_date ISO string', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(startInput(), { target: { value: futureDate } });
      fireEvent.change(dueInput(),   { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(
          expect.objectContaining({ start_date: expect.any(String) })
        )
      );
    });

    it('When start_date is empty / Then payload excludes start_date', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => {
        const payload = mockCreateTask.mock.calls[0][0];
        expect(payload).not.toHaveProperty('start_date');
      });
    });

    it('When description is entered / Then payload includes description', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i),  { target: { value: 'Task' } });
      fireEvent.change(screen.getByPlaceholderText(/add details/i), { target: { value: 'My description' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(
          expect.objectContaining({ description: 'My description' })
        )
      );
    });

    it('When REMINDER type with reminderMinutes set / Then payload includes reminder_minutes_before', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(selects()[0], { target: { value: 'REMINDER' } });
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Reminder task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.change(timeInput(), { target: { value: '10:00' } });
      // selects after REMINDER: [type=0, reminderMinutes=1, assignee=2]
      fireEvent.change(selects()[1], { target: { value: '30' } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'REMINDER', reminder_minutes_before: 30 })
        )
      );
    });

    it('When REMINDER type with no reminderMinutes / Then payload excludes reminder_minutes_before', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(selects()[0], { target: { value: 'REMINDER' } });
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Reminder task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.change(timeInput(), { target: { value: '10:00' } });
      // leave reminderMinutes as default ''
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => {
        const payload = mockCreateTask.mock.calls[0][0];
        expect(payload).not.toHaveProperty('reminder_minutes_before');
      });
    });

    it('When assigned to another user / Then emits task-assigned notification', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      // selects in TODO mode: [type=0, assignee=1]
      fireEvent.change(selects()[1], { target: { value: 'u2' } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => expect(mockEmitNotification).toHaveBeenCalled());
    });

    it('When assigned to self / Then does NOT emit notification', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      // u1 is auto-assigned (current user) — no change needed
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
      expect(mockEmitNotification).not.toHaveBeenCalled();
    });

    it('When submitted successfully / Then records task.created activity, calls onSuccess and onClose', async () => {
      const onClose = vi.fn();
      const onSuccess = vi.fn();
      render(<TaskModal leadId="lead-1" onClose={onClose} onSuccess={onSuccess} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => {
        expect(mockRecordActivity).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: 'task.created' })
        );
        expect(onSuccess).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('When the API rejects with a 4xx / Then the API message is surfaced instead of the generic fallback', async () => {
      // A bare "Failed to save task" is what hid the tasks_priority_check
      // mismatch; actionable validation detail must reach the user.
      const apiError = Object.assign(new Error('priority must be one of the following values: LOW, MEDIUM, HIGH, CRITICAL'), { status: 400 });
      mockCreateTask.mockRejectedValue(apiError);
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('priority must be one of the following values: LOW, MEDIUM, HIGH, CRITICAL')
      );
    });

    it('When the API rejects with a 5xx / Then the raw server message is not shown to the user', async () => {
      const apiError = Object.assign(new Error('new row for relation "tasks" violates check constraint "tasks_priority_check"'), { status: 500 });
      mockCreateTask.mockRejectedValue(apiError);
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith('Failed to save task. Please try again.')
      );
    });

    it('When API throws / Then shows error toast and does not call onSuccess', async () => {
      mockCreateTask.mockRejectedValue(new Error('Network error'));
      const onSuccess = vi.fn();
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={onSuccess} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Failed to save task. Please try again.'));
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  // ── Edit submission ───────────────────────────────────────────────────────
  describe('Given the form is submitted in edit mode', () => {
    it('When submitted / Then calls updateTask (not createTask)', async () => {
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByDisplayValue('Follow up call'));
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalled();
        expect(mockCreateTask).not.toHaveBeenCalled();
      });
    });

    it('When submitted / Then records task.updated activity', async () => {
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByDisplayValue('Follow up call'));
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockRecordActivity).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: 'task.updated' })
        )
      );
    });

    it('When status is changed / Then submits with the new status value', async () => {
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByDisplayValue('Open'));
      fireEvent.change(screen.getByDisplayValue('Open'), { target: { value: 'DONE' } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          't1', expect.objectContaining({ status: 'DONE' })
        )
      );
    });

    it('When API throws / Then shows error toast and does not call onSuccess', async () => {
      mockUpdateTask.mockRejectedValue(new Error('Server error'));
      const onSuccess = vi.fn();
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={onSuccess} />);
      await waitFor(() => screen.getByDisplayValue('Follow up call'));
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Failed to save task. Please try again.'));
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  // ── Assign to Me ──────────────────────────────────────────────────────────
  describe('Given the Assign to Me button', () => {
    it('When clicked while a different user is selected / Then reassigns to current user', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText(/follow up/i));
      // Change assignee to u2 first
      fireEvent.change(selects()[1], { target: { value: 'u2' } });
      await waitFor(() => screen.getByTitle(/assign this task to yourself/i));
      fireEvent.click(screen.getByTitle(/assign this task to yourself/i));
      await waitFor(() =>
        expect(screen.getByTitle(/already assigned to you/i)).toBeInTheDocument()
      );
    });

    it('When currentUser has no id / Then button is marked unavailable and handler returns early (no state change)', async () => {
      mockCurrentUser = null;
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByTitle(/user session not available/i));
      fireEvent.click(screen.getByTitle(/user session not available/i));
      // No state change — title stays the same
      expect(screen.getByTitle(/user session not available/i)).toBeInTheDocument();
    });
  });

  // ── fetchUsers fallback ───────────────────────────────────────────────────
  describe('Given the users API returns an empty array', () => {
    it('When current user is available / Then falls back to current user in the assignee list', async () => {
      mockGetUsers.mockResolvedValue([]);
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/test user/i)).toBeInTheDocument());
    });
  });

  // ── Viewport height fix ───────────────────────────────────────────────────
  describe('Given the modal renders in a constrained viewport (height fix)', () => {
    it('When rendered / Then the modal container has max-h-[90vh] class to stay within viewport', async () => {
      const { container } = render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      // The inner modal div (not the overlay) must have the height constraint
      const modalBox = container.querySelector('[class*="max-h-\\[90vh\\]"]');
      expect(modalBox).not.toBeNull();
    });

    it('When rendered / Then the modal container has overflow-hidden to enforce the max-height clipping', async () => {
      const { container } = render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      // overflow-hidden must live on the same element as max-h-[90vh] so that flex
      // children cannot push the container past the viewport height cap.
      const modalBox = container.querySelector('[class*="max-h-\\[90vh\\]"]');
      expect(modalBox).not.toBeNull();
      expect(modalBox!.className).toContain('overflow-hidden');
    });

    it('When rendered / Then the scrollable content area has overflow-y-auto to allow internal scrolling', async () => {
      const { container } = render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      const scrollableArea = container.querySelector('[class*="overflow-y-auto"]');
      expect(scrollableArea).not.toBeNull();
    });

    it('When rendered / Then Cancel and Create Task buttons are accessible without scrolling (in fixed footer)', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create task/i })).toBeInTheDocument();
    });
  });

  // ── Close / cancel ────────────────────────────────────────────────────────
  describe('Given the user wants to close the modal', () => {
    it('When Cancel button is clicked / Then calls onClose', async () => {
      const onClose = vi.fn();
      render(<TaskModal leadId="lead-1" onClose={onClose} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('When X (header close) button is clicked / Then calls onClose', async () => {
      const onClose = vi.fn();
      render(<TaskModal leadId="lead-1" onClose={onClose} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      // X button is the first button rendered (header); no accessible name (SVG only)
      fireEvent.click(screen.getAllByRole('button')[0]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Associate With picker ─────────────────────────────────────────────────
  describe('Given the Associate With picker', () => {
    it('When no leadId/dealId and not editing / Then shows "Associate With" section', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/associate with/i)).toBeInTheDocument());
    });

    it('When leadId prop is provided / Then hides "Associate With" section', async () => {
      render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      expect(screen.queryByText(/associate with/i)).not.toBeInTheDocument();
    });

    it('When dealId prop is provided / Then hides "Associate With" section', async () => {
      render(<TaskModal dealId="deal-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('New Task'));
      expect(screen.queryByText(/associate with/i)).not.toBeInTheDocument();
    });

    it('When editing an existing task / Then hides "Associate With" section', async () => {
      render(<TaskModal task={BASE_TASK as any} onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText('Edit Task'));
      expect(screen.queryByText(/associate with/i)).not.toBeInTheDocument();
    });

    it('When type set to Lead / Then second select shows lead options from API', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      // associate type select is the last select rendered after type + assignee selects
      const allSelects = document.querySelectorAll('select');
      // find the one with "None / Lead / Deal" options
      const typeSelect = Array.from(allSelects).find(s =>
        Array.from(s.options).some(o => o.value === 'lead')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'lead' } });
      await waitFor(() =>
        expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      );
    });

    it('When type set to Deal / Then second select shows deal options from API', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      const allSelects = document.querySelectorAll('select');
      const typeSelect = Array.from(allSelects).find(s =>
        Array.from(s.options).some(o => o.value === 'deal')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'deal' } });
      await waitFor(() =>
        expect(screen.getByText('Enterprise Deal')).toBeInTheDocument()
      );
    });

    it('When lead with empty company_name / Then shows contact_name as label', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      const allSelects = document.querySelectorAll('select');
      const typeSelect = Array.from(allSelects).find(s =>
        Array.from(s.options).some(o => o.value === 'lead')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'lead' } });
      await waitFor(() =>
        expect(screen.getByText('Bob Smith')).toBeInTheDocument()
      );
    });

    it('When deal with empty name / Then shows company_name as label', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      const allSelects = document.querySelectorAll('select');
      const typeSelect = Array.from(allSelects).find(s =>
        Array.from(s.options).some(o => o.value === 'deal')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'deal' } });
      await waitFor(() =>
        expect(screen.getByText('Beta Ltd')).toBeInTheDocument()
      );
    });

    it('When changing type from Lead to Deal / Then resets the entity select', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      const allSelects = document.querySelectorAll('select');
      const typeSelect = Array.from(allSelects).find(s =>
        Array.from(s.options).some(o => o.value === 'lead')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'lead' } });
      await waitFor(() => screen.getByText('Acme Corp'));
      fireEvent.change(typeSelect, { target: { value: 'deal' } });
      await waitFor(() => screen.getByText('Enterprise Deal'));
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    });

    it('When lead associated and form submitted / Then payload includes lead_id', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      const allSelects = () => document.querySelectorAll('select');
      const typeSelect = Array.from(allSelects()).find(s =>
        Array.from(s.options).some(o => o.value === 'lead')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'lead' } });
      await waitFor(() => screen.getByText('Acme Corp'));
      const entitySelect = Array.from(allSelects()).find(s =>
        Array.from(s.options).some(o => o.value === 'lead-1')
      )!;
      fireEvent.change(entitySelect, { target: { value: 'lead-1' } });
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(
          expect.objectContaining({ lead_id: 'lead-1' })
        )
      );
    });

    it('When deal associated and form submitted / Then payload includes deal_id', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      const allSelects = () => document.querySelectorAll('select');
      const typeSelect = Array.from(allSelects()).find(s =>
        Array.from(s.options).some(o => o.value === 'deal')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'deal' } });
      await waitFor(() => screen.getByText('Enterprise Deal'));
      const entitySelect = Array.from(allSelects()).find(s =>
        Array.from(s.options).some(o => o.value === 'deal-1')
      )!;
      fireEvent.change(entitySelect, { target: { value: 'deal-1' } });
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() =>
        expect(mockCreateTask).toHaveBeenCalledWith(
          expect.objectContaining({ deal_id: 'deal-1' })
        )
      );
    });

    it('When associateType is None / Then payload excludes lead_id and deal_id', async () => {
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
      fireEvent.change(dueInput(), { target: { value: futureDate } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => {
        const payload = mockCreateTask.mock.calls[0][0];
        expect(payload).not.toHaveProperty('lead_id');
        expect(payload).not.toHaveProperty('deal_id');
      });
    });

    it('When getLeads API fails / Then falls back to empty list and picker still renders', async () => {
      mockGetLeads.mockRejectedValue(new Error('Network'));
      mockGetDeals.mockRejectedValue(new Error('Network'));
      render(<TaskModal onClose={vi.fn()} onSuccess={vi.fn()} />);
      await waitFor(() => screen.getByText(/associate with/i));
      const allSelects = document.querySelectorAll('select');
      const typeSelect = Array.from(allSelects).find(s =>
        Array.from(s.options).some(o => o.value === 'lead')
      )!;
      fireEvent.change(typeSelect, { target: { value: 'lead' } });
      // entity select renders with just the placeholder option
      await waitFor(() =>
        expect(screen.getByText(/select lead/i)).toBeInTheDocument()
      );
    });
  });
});

// ── Due date & time contract ─────────────────────────────────────────────────
// Regression cover for two defects that share one root cause — the browser
// normalising a picked calendar date to UTC:
//   1. "Due date cannot be in the past" on a task the user scheduled for today.
//   2. Every reminder card reading "5:30 AM" / "12:00 AM".
describe('Given a due date is being chosen', () => {
  it('When today is picked / Then the request carries today, not the day before', async () => {
    render(<TaskModal onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    fireEvent.change(screen.getByPlaceholderText(/follow up email/i), { target: { value: 'Call back' } });
    fireEvent.change(dueInput(), { target: { value: today } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    // Not `2026-08-12T18:30:00.000Z` — the calendar day survives intact.
    expect(mockCreateTask.mock.calls[0][0].due_date).toBe(today);
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('When no time is given / Then the payload is a bare calendar date with no instant at all', async () => {
    render(<TaskModal onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/follow up email/i), { target: { value: 'Call back' } });
    fireEvent.change(dueInput(), { target: { value: futureDate } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    expect(mockCreateTask.mock.calls[0][0].due_date).toBe(futureDate);
  });

  it('When a time is given / Then the payload keeps the wall clock AND states its zone', async () => {
    render(<TaskModal onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/follow up email/i), { target: { value: 'Call back' } });
    fireEvent.change(dueInput(), { target: { value: futureDate } });
    fireEvent.change(timeInput(), { target: { value: '14:30' } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const sent = mockCreateTask.mock.calls[0][0].due_date as string;
    // The calendar date the user saw is still readable off the front of the
    // value — that is what the server's past-date rule keys on.
    expect(sent.startsWith(`${futureDate}T14:30:00`)).toBe(true);
    expect(sent).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(new Date(sent).getTime()).toBe(new Date(`${futureDate}T14:30:00`).getTime());
  });

  it('When the start date is given / Then it too travels as a plain calendar date', async () => {
    render(<TaskModal onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/follow up email/i), { target: { value: 'Call back' } });
    fireEvent.change(startInput(), { target: { value: futureDate } });
    fireEvent.change(dueInput(), { target: { value: futureDate } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    expect(mockCreateTask.mock.calls[0][0].start_date).toBe(futureDate);
  });

  it('When a time earlier today is chosen / Then it is rejected as past', async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    // Only meaningful once the day is under way; before 00:01 there is no
    // earlier time to pick.
    if (now.getHours() === 0 && now.getMinutes() === 0) return;

    render(<TaskModal onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/follow up email/i), { target: { value: 'Call back' } });
    fireEvent.change(dueInput(), { target: { value: today } });
    fireEvent.change(timeInput(), { target: { value: '00:00' } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Due time cannot be in the past. Please pick a later time.')
    );
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('When an existing timed task is reopened / Then the editor shows the wall clock it was saved with', async () => {
    const savedInstant = new Date(`${futureDate}T10:00:00`).toISOString();
    render(
      <TaskModal
        task={{ ...BASE_TASK, type: 'REMINDER', due_date: savedInstant } as any}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    await waitFor(() => expect(timeInput()).toBeTruthy());
    expect(dueInput().value).toBe(futureDate);
    expect(timeInput().value).toBe('10:00');
  });

  it('When a timed task is saved again untouched / Then the instant does not drift', async () => {
    const savedInstant = new Date(`${futureDate}T10:00:00`).toISOString();
    render(
      <TaskModal
        task={{ ...BASE_TASK, type: 'REMINDER', due_date: savedInstant } as any}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    await waitFor(() => expect(timeInput().value).toBe('10:00'));

    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalled());
    expect(new Date(mockUpdateTask.mock.calls[0][1].due_date).toISOString()).toBe(savedInstant);
  });

  it('When a date-only task is reopened / Then the time field stays empty rather than inventing midnight', async () => {
    render(
      <TaskModal
        task={{ ...BASE_TASK, due_date: `${futureDate}T00:00:00.000Z` } as any}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    await waitFor(() => expect(dueInput().value).toBe(futureDate));
    expect(timeInput().value).toBe('');
  });

  it('When a REMINDER reaches submit with its time cleared / Then it is rejected rather than stored at midnight', async () => {
    render(<TaskModal onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalled());

    fireEvent.change(dueInput(), { target: { value: futureDate } });
    fireEvent.change(selects()[0], { target: { value: 'REMINDER' } });
    await waitFor(() => expect(timeInput()).toBeTruthy());
    fireEvent.change(timeInput(), { target: { value: '' } });

    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Please pick a date AND time for the reminder.')
    );
    expect(mockCreateTask).not.toHaveBeenCalled();
  });
});

// ── Project connection (optional) ───────────────────────────────────────────
describe('Given a Deal-context task with an auto-suggested Project', () => {
  it('When the modal renders / Then the Project dropdown is pre-selected with the Deal\'s project', async () => {
    render(
      <TaskModal dealId="deal-1" dealProjectId="proj-2" onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalled());
    const projectSelect = await screen.findByDisplayValue('Mobile App');
    expect(projectSelect).toBeInTheDocument();
  });

  it('When rendered without a dealProjectId / Then the Project dropdown defaults to "No Project"', async () => {
    render(<TaskModal dealId="deal-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalled());
    expect(screen.getByDisplayValue('No Project')).toBeInTheDocument();
  });

  it('When a Project is selected / Then the user may still clear it back to "No Project"', async () => {
    render(
      <TaskModal dealId="deal-1" dealProjectId="proj-2" onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByDisplayValue('Mobile App')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Mobile App'), { target: { value: '' } });
    expect(screen.getByDisplayValue('No Project')).toBeInTheDocument();
  });
});

describe('Given a user selects a Project and submits the task form', () => {
  it('When submission succeeds / Then connectTaskToProject is called with the new task id and selected project id', async () => {
    mockCreateTask.mockResolvedValue({ id: 'new-task-99', title: 'Task', status: 'OPEN' });
    render(<TaskModal dealId="deal-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
    fireEvent.change(dueInput(), { target: { value: futureDate } });
    fireEvent.change(screen.getByDisplayValue('No Project'), { target: { value: 'proj-1' } });

    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() =>
      expect(mockConnectTaskToProject).toHaveBeenCalledWith('new-task-99', 'proj-1')
    );
  });

  it('When no Project is selected / Then connectTaskToProject is never called', async () => {
    render(<TaskModal leadId="lead-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
    fireEvent.change(dueInput(), { target: { value: futureDate } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    expect(mockConnectTaskToProject).not.toHaveBeenCalled();
  });
});

describe('Given the connect call fails after task creation succeeds', () => {
  it('When connectTaskToProject rejects / Then the task creation flow still completes and a non-blocking notice is shown', async () => {
    mockCreateTask.mockResolvedValue({ id: 'new-task-1', title: 'Task', status: 'OPEN' });
    mockConnectTaskToProject.mockRejectedValue(new Error('Project not found'));
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(<TaskModal dealId="deal-1" onClose={onClose} onSuccess={onSuccess} />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/follow up/i), { target: { value: 'Task' } });
    fireEvent.change(dueInput(), { target: { value: futureDate } });
    fireEvent.change(screen.getByDisplayValue('No Project'), { target: { value: 'proj-1' } });
    fireEvent.submit(document.querySelector('form')!);

    // The task creation flow completes normally — modal closes, onSuccess fires —
    // a failed connect must never roll back or block the already-saved task.
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-task-1' })));
    expect(onClose).toHaveBeenCalled();
    expect(mockShowWarning).toHaveBeenCalledWith(
      expect.stringContaining("couldn't connect to Project: Project not found")
    );
    // Crucially: this is a warning notice, never the hard failure path.
    expect(mockShowError).not.toHaveBeenCalledWith('Failed to save task. Please try again.');
  });
});
