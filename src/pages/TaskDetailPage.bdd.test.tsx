import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { toast } from '@so360/design-system';

const mockGetTaskById = vi.fn();
const mockGetUsers = vi.fn();
const mockGetTaskNotes = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockCreateNote = vi.fn();
const mockUpdateNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockNavigate = vi.fn();
const mockRecordActivity = vi.fn().mockResolvedValue(undefined);
const mockRetryTaskProjectSync = vi.fn();
const mockDisconnectTaskFromProject = vi.fn();

vi.mock('../services/crmService', () => ({
  crmService: {
    getTaskById: (...a: any[]) => mockGetTaskById(...a),
    getUsers: (...a: any[]) => mockGetUsers(...a),
    getTaskNotes: (...a: any[]) => mockGetTaskNotes(...a),
    updateTask: (...a: any[]) => mockUpdateTask(...a),
    deleteTask: (...a: any[]) => mockDeleteTask(...a),
    createNote: (...a: any[]) => mockCreateNote(...a),
    updateNote: (...a: any[]) => mockUpdateNote(...a),
    deleteNote: (...a: any[]) => mockDeleteNote(...a),
    retryTaskProjectSync: (...a: any[]) => mockRetryTaskProjectSync(...a),
    disconnectTaskFromProject: (...a: any[]) => mockDisconnectTaskFromProject(...a),
  },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'task-1' }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('@so360/shell-context', () => ({
  useBusinessSettings: () => ({ settings: { base_currency: 'USD', document_language: 'en-US', timezone: 'UTC' } }),
  ShellContext: React.createContext({ user: { id: 'user-1' } }),
  useActivity: () => ({ recordActivity: (...a: any[]) => mockRecordActivity(...a) }),
  useShellBridge: vi.fn(() => ({ effectiveFlagsLoaded: true, permissionsLoaded: true, hasPermission: () => true, hasAnyPermission: () => true, isFeatureEnabled: () => true, isFeatureHidden: () => false })),

  useQuota: () => ({ quotas: [], isLoading: false, error: null, isExceeded: () => false, getQuota: () => null, getPercentage: () => 0, refresh: async () => {} }),}));

vi.mock('./components/TaskModal', () => ({
  default: ({ onClose }: any) => <div data-testid="task-modal"><button onClick={onClose}>Close Edit</button></div>,
}));

vi.mock('./components/RescheduleModal', () => ({
  RescheduleModal: ({ onClose, onConfirm }: any) => (
    <div data-testid="reschedule-modal">
      <button onClick={() => onConfirm('2026-06-01')}>Confirm Reschedule</button>
      <button onClick={onClose}>Cancel Reschedule</button>
    </div>
  ),
}));

import TaskDetailPage from './TaskDetailPage';

const makeTask = (overrides: any = {}) => ({
  id: 'task-1',
  title: 'Follow up with client',
  description: 'Call them about the proposal',
  status: 'OPEN',
  due_date: '2026-06-15',
  deal_id: 'deal-1',
  deal_name: 'Big Deal',
  lead_id: null,
  assigned_to: { id: 'user-1', full_name: 'Test User', avatar_url: null },
  ...overrides,
});

const makeNotes = () => [
  { id: 'n1', content: 'First note', created_at: '2026-01-10', author: { id: 'user-1', full_name: 'Test User' } },
  { id: 'n2', content: 'Second note', created_at: '2026-01-11', author: { id: 'user-2', full_name: 'Other User' } },
];

beforeEach(async () => {
  vi.clearAllMocks();
  const shell = await import('@so360/shell-context');
  vi.mocked(shell.useShellBridge).mockImplementation(() => ({ effectiveFlagsLoaded: true, permissionsLoaded: true, hasPermission: () => true, hasAnyPermission: () => true, isFeatureEnabled: () => true, isFeatureHidden: () => false }));
  mockGetTaskById.mockResolvedValue(makeTask());
  mockGetUsers.mockResolvedValue([]);
  mockGetTaskNotes.mockResolvedValue(makeNotes());
  mockUpdateTask.mockResolvedValue({});
  mockDeleteTask.mockResolvedValue({});
  mockCreateNote.mockResolvedValue({});
  mockUpdateNote.mockResolvedValue({});
  mockDeleteNote.mockResolvedValue({});
  mockRecordActivity.mockResolvedValue(undefined);
  mockRetryTaskProjectSync.mockResolvedValue(makeTask({ sync_status: 'connected' }));
  mockDisconnectTaskFromProject.mockResolvedValue(makeTask({ sync_status: 'disconnected' }));
});

describe('TaskDetailPage', () => {
  describe('Given task is loading', () => {
    it('When rendered / Then shows loading spinner', () => {
      mockGetTaskById.mockReturnValue(new Promise(() => {}));
      render(<TaskDetailPage />);
      expect(screen.getByText('Loading task details...')).toBeInTheDocument();
    });
  });

  describe('Given task is not found', () => {
    it('When rendered / Then shows not found message', async () => {
      mockGetTaskById.mockResolvedValue(null);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Task not found.')).toBeInTheDocument());
    });

    it('When Back to Tasks is clicked / Then it navigates to /crm/tasks, not the dashboard', async () => {
      mockGetTaskById.mockResolvedValue(null);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Back to Tasks')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Back to Tasks'));
      expect(mockNavigate).toHaveBeenCalledWith('/crm/tasks');
    });
  });

  describe('Given task is loaded', () => {
    it('When rendered / Then shows task title', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
    });

    it('When the header Back is clicked / Then it navigates to /crm/tasks, not the dashboard', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      fireEvent.click(screen.getAllByText('Back')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/crm/tasks');
    });

    it('When rendered / Then shows task description', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Call them about the proposal')).toBeInTheDocument());
    });

    it('When rendered / Then shows assignee name', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => {
        const matches = screen.getAllByText('Test User');
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('When rendered / Then shows task status badge', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('OPEN')).toBeInTheDocument());
    });

    it('When task has deal / Then shows deal link', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Big Deal')).toBeInTheDocument());
      const link = screen.getByText('Big Deal').closest('a');
      expect(link?.getAttribute('href')).toBe('/deals/deal-1');
    });

    it('When task has no description / Then shows placeholder', async () => {
      mockGetTaskById.mockResolvedValue(makeTask({ description: null }));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('No additional description provided for this task.')).toBeInTheDocument());
    });

    it('When task has lead but no deal / Then shows lead link', async () => {
      mockGetTaskById.mockResolvedValue(makeTask({ deal_id: null, deal_name: null, lead_id: 'lead-1' }));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('View Lead')).toBeInTheDocument());
      const link = screen.getByText('View Lead').closest('a');
      expect(link?.getAttribute('href')).toBe('/crm/leads/lead-1');
    });
  });

  describe('Given task status toggle', () => {
    it('When Mark as Complete is clicked / Then updates task status', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Mark as Complete')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Mark as Complete'));
      await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { status: 'DONE' }));
    });

    it('When task is Done and Mark as Open is clicked / Then reopens task', async () => {
      mockGetTaskById.mockResolvedValue(makeTask({ status: 'DONE' }));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Mark as Open')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Mark as Open'));
      await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { status: 'OPEN' }));
    });
  });

  describe('Given task deletion', () => {
    it('When delete button clicked and confirmed / Then deletes task and navigates', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      const allBtns = screen.getAllByRole('button');
      const trashBtn = allBtns.find(b => b.className.includes('hover:text-rose'));
      fireEvent.click(trashBtn!);
      await waitFor(() => expect(screen.getByText('Delete Task')).toBeInTheDocument());
      const deleteConfirmBtn = screen.getAllByText('Delete').find(el => el.closest('button')?.className.includes('bg-red'));
      fireEvent.click(deleteConfirmBtn!);
      await waitFor(() => expect(mockDeleteTask).toHaveBeenCalledWith('task-1'));
      expect(mockNavigate).toHaveBeenCalledWith('/crm/tasks');
    });
  });

  describe('Given notes section', () => {
    it('When rendered / Then shows existing notes', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      expect(screen.getByText('Second note')).toBeInTheDocument();
    });

    it('When no notes exist / Then shows the honest empty state', async () => {
      mockGetTaskNotes.mockResolvedValue([]);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText(/No notes added yet\. Add the first note to collaborate with your team\./)).toBeInTheDocument());
    });

    it('When fetching notes fails / Then shows an honest retry banner, never an internal migration message', async () => {
      mockGetTaskNotes.mockRejectedValue(new Error('Table not found'));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Unable to load notes right now. Please try again.')).toBeInTheDocument());
      expect(screen.queryByText(/migration/i)).not.toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
      // Add Note affordance must not be offered while notes failed to load
      expect(screen.queryByText('+ Add Note')).not.toBeInTheDocument();
    });

    it('When Retry is clicked after a failed load / Then notes load successfully and the error clears', async () => {
      mockGetTaskNotes.mockRejectedValueOnce(new Error('Network error'));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Retry')).toBeInTheDocument());
      mockGetTaskNotes.mockResolvedValue(makeNotes());
      fireEvent.click(screen.getByText('Retry'));
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    });

    it('When Add Note is clicked and note submitted / Then creates the note, refreshes the list, and records task activity', async () => {
      mockGetTaskNotes.mockResolvedValue([]);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('+ Add Note')).toBeInTheDocument());
      fireEvent.click(screen.getByText('+ Add Note'));
      const textarea = screen.getByPlaceholderText('Add a note or comment...');
      fireEvent.change(textarea, { target: { value: 'New test note' } });
      mockGetTaskNotes.mockResolvedValue(makeNotes());
      fireEvent.click(screen.getByText('Add Note'));
      await waitFor(() => expect(mockCreateNote).toHaveBeenCalledWith({ content: 'New test note', task_id: 'task-1' }));
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      await waitFor(() => expect(mockRecordActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'note.added', resourceId: 'task-1' })));
    });

    it('Given a note edited after creation / When rendered / Then shows the Edited indicator', async () => {
      mockGetTaskNotes.mockResolvedValue([
        { id: 'n1', content: 'Edited note', created_at: '2026-01-10', updated_at: '2026-01-11', author: { id: 'user-1', full_name: 'Test User' } },
      ]);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Edited note')).toBeInTheDocument());
      expect(screen.getByText('· Edited')).toBeInTheDocument();
    });

    it('Given a note never edited / When rendered / Then does not show the Edited indicator', async () => {
      mockGetTaskNotes.mockResolvedValue([
        { id: 'n1', content: 'Fresh note', created_at: '2026-01-10', updated_at: '2026-01-10', author: { id: 'user-1', full_name: 'Test User' } },
      ]);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Fresh note')).toBeInTheDocument());
      expect(screen.queryByText('· Edited')).not.toBeInTheDocument();
    });

    it('Given a note author with an avatar / When rendered / Then renders the avatar image', async () => {
      mockGetTaskNotes.mockResolvedValue([
        { id: 'n1', content: 'Note with avatar', created_at: '2026-01-10', author: { id: 'user-1', full_name: 'Avatar User', avatar_url: 'https://img.test/note-author.jpg' } },
      ]);
      render(<TaskDetailPage />);
      await waitFor(() => {
        const img = screen.getByAltText('Avatar User');
        expect(img).toHaveAttribute('src', 'https://img.test/note-author.jpg');
      });
    });

    it('When the note author edits their note / Then updates it, refreshes the list, and records task activity', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      fireEvent.click(screen.getByTitle('Edit note'));
      const textarea = screen.getByPlaceholderText('Note content...');
      fireEvent.change(textarea, { target: { value: 'Updated content' } });
      fireEvent.click(screen.getByText('Save Changes'));
      await waitFor(() => expect(mockUpdateNote).toHaveBeenCalledWith('n1', 'Updated content'));
      await waitFor(() => expect(mockRecordActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'note.updated', resourceId: 'task-1' })));
    });

    it('When the note author deletes their note after confirming / Then deletes it, refreshes the list, and records task activity', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      fireEvent.click(screen.getByTitle('Delete note'));
      await waitFor(() => expect(screen.getByText('Are you sure you want to delete this note? This action cannot be undone.')).toBeInTheDocument());
      mockGetTaskNotes.mockResolvedValue([makeNotes()[1]]);
      const confirmBtn = screen.getAllByText('Delete Note').find(el => el.closest('button'));
      fireEvent.click(confirmBtn!);
      await waitFor(() => expect(mockDeleteNote).toHaveBeenCalledWith('n1'));
      await waitFor(() => expect(mockRecordActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'note.deleted', resourceId: 'task-1' })));
    });

    it('When creating a note fails / Then shows an error toast and keeps the composer open', async () => {
      const toastSpy = vi.spyOn(toast, 'error');
      mockGetTaskNotes.mockResolvedValue([]);
      mockCreateNote.mockRejectedValueOnce(new Error('insert failed'));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('+ Add Note')).toBeInTheDocument());
      fireEvent.click(screen.getByText('+ Add Note'));
      fireEvent.change(screen.getByPlaceholderText('Add a note or comment...'), { target: { value: 'Will fail' } });
      fireEvent.click(screen.getByText('Add Note'));
      await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Failed to add note. Please try again.'));
      expect(mockRecordActivity).not.toHaveBeenCalled();
      toastSpy.mockRestore();
    });

    it('When Save Changes is clicked with blank content / Then shows a validation warning toast and never calls updateNote', async () => {
      const toastSpy = vi.spyOn(toast, 'warning');
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      fireEvent.click(screen.getByTitle('Edit note'));
      const textarea = screen.getByPlaceholderText('Note content...');
      fireEvent.change(textarea, { target: { value: '   ' } });
      fireEvent.click(screen.getByText('Save Changes'));
      expect(toastSpy).toHaveBeenCalledWith('Note content cannot be empty.');
      expect(mockUpdateNote).not.toHaveBeenCalled();
      toastSpy.mockRestore();
    });

    it('When updating a note fails / Then shows an error toast', async () => {
      const toastSpy = vi.spyOn(toast, 'error');
      mockUpdateNote.mockRejectedValueOnce(new Error('update failed'));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      fireEvent.click(screen.getByTitle('Edit note'));
      fireEvent.change(screen.getByPlaceholderText('Note content...'), { target: { value: 'Updated content' } });
      fireEvent.click(screen.getByText('Save Changes'));
      await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Failed to update note. Please try again.'));
      toastSpy.mockRestore();
    });

    it('When deleting a note fails / Then shows an error toast', async () => {
      const toastSpy = vi.spyOn(toast, 'error');
      mockDeleteNote.mockRejectedValueOnce(new Error('delete failed'));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('First note')).toBeInTheDocument());
      fireEvent.click(screen.getByTitle('Delete note'));
      const confirmBtn = screen.getAllByText('Delete Note').find(el => el.closest('button'));
      fireEvent.click(confirmBtn!);
      await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Failed to delete note. Please try again.'));
      toastSpy.mockRestore();
    });

    it('Given a note authored by someone else / When rendered / Then edit/delete controls are not offered', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Second note')).toBeInTheDocument());
      const secondNoteCard = screen.getByText('Second note').closest('.group');
      expect(secondNoteCard?.querySelector('[title="Edit note"]')).toBeNull();
      expect(secondNoteCard?.querySelector('[title="Delete note"]')).toBeNull();
    });
  });

  describe('Given reschedule flow', () => {
    it('When Reschedule is clicked / Then shows reschedule modal', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Reschedule')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Reschedule'));
      await waitFor(() => expect(screen.getByTestId('reschedule-modal')).toBeInTheDocument());
    });

    it('When reschedule confirmed / Then updates due date', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Reschedule')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Reschedule'));
      await waitFor(() => expect(screen.getByTestId('reschedule-modal')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Confirm Reschedule'));
      await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { due_date: '2026-06-01' }));
    });
  });

  describe('Given overdue task', () => {
    it('When task is open and past due / Then shows Overdue badge', async () => {
      mockGetTaskById.mockResolvedValue(makeTask({ due_date: '2024-01-01' }));
      render(<TaskDetailPage />);
      await waitFor(() => {
        const overdueLabels = screen.getAllByText('Overdue');
        expect(overdueLabels.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Given assignee with avatar', () => {
    it('When assignee has avatar_url / Then renders avatar image', async () => {
      mockGetTaskById.mockResolvedValue(makeTask({ assigned_to: { id: 'user-1', full_name: 'Test User', avatar_url: 'https://img.test/avatar.jpg' } }));
      render(<TaskDetailPage />);
      await waitFor(() => {
        const img = screen.getByAltText('Test User');
        expect(img).toHaveAttribute('src', 'https://img.test/avatar.jpg');
      });
    });
  });

  describe('Given effectiveFlagsLoaded guard — flicker prevention', () => {
    it('When effectiveFlagsLoaded is false / Then Delete button is absent (no flicker)', async () => {
      const { useShellBridge } = await import('@so360/shell-context');
      vi.mocked(useShellBridge).mockReturnValueOnce({
        effectiveFlagsLoaded: false,
        permissionsLoaded: true, hasPermission: () => true, hasAnyPermission: () => true, isFeatureEnabled: () => false,
      } as any);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      // canCreateTask is false before flags resolve — delete button must not flash
      const deleteBtn = screen.queryByTitle('Delete');
      expect(deleteBtn).not.toBeInTheDocument();
    });

    it('When effectiveFlagsLoaded is true and isFeatureEnabled returns true / Then Delete button is present', async () => {
      const { useShellBridge } = await import('@so360/shell-context');
      vi.mocked(useShellBridge).mockReturnValueOnce({
        effectiveFlagsLoaded: true,
        permissionsLoaded: true, hasPermission: () => true, hasAnyPermission: () => true, isFeatureEnabled: () => true,
      } as any);
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      // The delete Trash2 icon button is rendered when canCreateTask is true
      const trashBtn = document.querySelector('[data-testid="icon-Trash2"]')?.closest('button');
      expect(trashBtn).toBeTruthy();
    });
  });

  describe('Given a completed task (status DONE)', () => {
    beforeEach(() => {
      mockGetTaskById.mockResolvedValue(makeTask({ status: 'DONE' }));
    });

    it('When the detail page renders / Then Reschedule is disabled', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Reschedule')).toBeInTheDocument());
      expect(screen.getByText('Reschedule').closest('button')).toBeDisabled();
    });

    it('When the detail page renders / Then a hint explains why actions are unavailable', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByTestId('task-locked-hint')).toBeInTheDocument());
      expect(screen.getByText('Reschedule').closest('button')?.getAttribute('title'))
        .toMatch(/Mark as Open/i);
    });

    it('When Reschedule is clicked / Then the reschedule modal does not open', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Reschedule')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Reschedule'));
      expect(screen.queryByTestId('reschedule-modal')).not.toBeInTheDocument();
      expect(mockUpdateTask).not.toHaveBeenCalled();
    });

    it('When the detail page renders / Then the Edit action is disabled', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      expect(screen.getByLabelText('Edit Task')).toBeDisabled();
    });

    it('When the detail page renders / Then adding a note is still permitted for audit history', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('+ Add Note')).toBeInTheDocument());
      expect(screen.getByTestId('note-composer-trigger')).toBeInTheDocument();
    });
  });

  describe('Given an open task', () => {
    it('When the detail page renders / Then Reschedule and Edit are enabled', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Reschedule')).toBeInTheDocument());
      expect(screen.getByText('Reschedule').closest('button')).not.toBeDisabled();
      expect(screen.getByLabelText('Edit Task')).not.toBeDisabled();
      expect(screen.queryByTestId('task-locked-hint')).not.toBeInTheDocument();
    });

    it('When the task is marked complete / Then Reschedule becomes disabled immediately', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Mark as Complete')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Mark as Complete'));
      await waitFor(() =>
        expect(screen.getByText('Reschedule').closest('button')).toBeDisabled(),
      );
    });
  });

  describe('Given task-level actions on the detail header', () => {
    it('When the page renders / Then Edit and Delete are grouped in one action area', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      const group = screen.getByTestId('task-actions');
      expect(group.querySelector('[aria-label="Edit Task"]')).toBeTruthy();
      expect(group.querySelector('[aria-label="Delete Task"]')).toBeTruthy();
    });

    it('When the page renders / Then both actions expose descriptive tooltips', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      expect(screen.getByLabelText('Edit Task').getAttribute('title')).toBe('Edit Task');
      expect(screen.getByLabelText('Delete Task').getAttribute('title')).toBe('Delete Task');
    });
  });

  describe('Given the Notes & Comments composer', () => {
    it('When idle / Then only a compact input is shown and no Cancel exists', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByTestId('note-composer-trigger')).toBeInTheDocument());
      expect(screen.getByTestId('note-composer-trigger')).toHaveTextContent('Add a note or comment...');
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    it('When the compact input is clicked / Then the editor expands with exactly one Cancel', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByTestId('note-composer-trigger')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('note-composer-trigger'));
      expect(screen.getByPlaceholderText('Add a note or comment...')).toBeInTheDocument();
      expect(screen.getAllByText('Cancel')).toHaveLength(1);
      // header affordance collapses away while editing — no duplicate control
      expect(screen.queryByText('+ Add Note')).not.toBeInTheDocument();
    });

    it('When Cancel is clicked / Then the editor collapses and unsaved input is discarded', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByTestId('note-composer-trigger')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('note-composer-trigger'));
      fireEvent.change(screen.getByPlaceholderText('Add a note or comment...'), { target: { value: 'draft' } });
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => expect(screen.getByTestId('note-composer-trigger')).toBeInTheDocument());
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(mockCreateNote).not.toHaveBeenCalled();
    });

    it('When a note is submitted / Then the editor collapses back to the compact input', async () => {
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByTestId('note-composer-trigger')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('note-composer-trigger'));
      fireEvent.change(screen.getByPlaceholderText('Add a note or comment...'), { target: { value: 'a note' } });
      fireEvent.click(screen.getByText('Add Note'));
      await waitFor(() => expect(mockCreateNote).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByTestId('note-composer-trigger')).toBeInTheDocument());
    });

    it('When notes failed to load / Then the compact composer is not offered', async () => {
      mockGetTaskNotes.mockRejectedValue(new Error('boom'));
      render(<TaskDetailPage />);
      await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
      expect(screen.queryByTestId('note-composer-trigger')).not.toBeInTheDocument();
    });
  });
});

// ── Project connection status (optional) ────────────────────────────────────
describe('Given a task with no sync_status', () => {
  it('When TaskDetailPage renders / Then no connection UI is shown at all', async () => {
    mockGetTaskById.mockResolvedValue(makeTask());
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByText('Follow up with client')).toBeInTheDocument());
    expect(screen.queryByTestId('project-sync-connected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-sync-failed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-sync-disconnected')).not.toBeInTheDocument();
  });
});

describe('Given a task with sync_status: connected', () => {
  it('When rendered / Then the Connected indicator and a Disconnect action appear', async () => {
    mockGetTaskById.mockResolvedValue(makeTask({ sync_status: 'connected', project_id: 'proj-1' }));
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByTestId('project-sync-connected')).toBeInTheDocument());
    expect(screen.getByText('Connected to Project')).toBeInTheDocument();
    expect(screen.getByLabelText('Disconnect from Project')).toBeInTheDocument();
  });

  it('When last_synced_at is present / Then a "Last synced" timestamp is shown', async () => {
    mockGetTaskById.mockResolvedValue(
      makeTask({ sync_status: 'connected', project_id: 'proj-1', last_synced_at: '2026-06-10T10:00:00Z' })
    );
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByTestId('project-sync-connected')).toBeInTheDocument());
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
  });
});

describe('Given a task with sync_status: sync_failed', () => {
  it('When rendered / Then "Sync Failed" and a Retry Sync button appear', async () => {
    mockGetTaskById.mockResolvedValue(makeTask({ sync_status: 'sync_failed' }));
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByTestId('project-sync-failed')).toBeInTheDocument());
    expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    expect(screen.getByText('Retry Sync')).toBeInTheDocument();
  });

  it('When the Retry Sync button is clicked / Then retryTaskProjectSync is called with the task id', async () => {
    mockGetTaskById.mockResolvedValue(makeTask({ sync_status: 'sync_failed' }));
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByText('Retry Sync')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Retry Sync'));
    await waitFor(() => expect(mockRetryTaskProjectSync).toHaveBeenCalledWith('task-1'));
  });
});

describe('Given a task with sync_status: disconnected', () => {
  it('When rendered / Then a subtle "Previously connected" note is shown, not a persistent indicator', async () => {
    mockGetTaskById.mockResolvedValue(makeTask({ sync_status: 'disconnected' }));
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByTestId('project-sync-disconnected')).toBeInTheDocument());
    expect(screen.queryByTestId('project-sync-connected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-sync-failed')).not.toBeInTheDocument();
  });
});

describe('Given the Disconnect action is triggered', () => {
  it('When the user confirms keep_but_disconnect / Then disconnectTaskFromProject is called with that exact mode', async () => {
    mockGetTaskById.mockResolvedValue(makeTask({ sync_status: 'connected', project_id: 'proj-1' }));
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByLabelText('Disconnect from Project')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Disconnect from Project'));

    await waitFor(() => expect(screen.getByText('Disconnect from Project')).toBeInTheDocument());
    // keep_but_disconnect is the default-selected radio; confirm directly.
    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() =>
      expect(mockDisconnectTaskFromProject).toHaveBeenCalledWith('task-1', 'keep_but_disconnect')
    );
  });

  it('When the user picks remove_project_task and confirms / Then disconnectTaskFromProject is called with that mode', async () => {
    mockGetTaskById.mockResolvedValue(makeTask({ sync_status: 'connected', project_id: 'proj-1' }));
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByLabelText('Disconnect from Project')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Disconnect from Project'));

    await waitFor(() => expect(screen.getByText('Remove the Project task too')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remove the Project task too'));
    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() =>
      expect(mockDisconnectTaskFromProject).toHaveBeenCalledWith('task-1', 'remove_project_task')
    );
  });

  it('When Cancel is clicked / Then disconnectTaskFromProject is never called', async () => {
    mockGetTaskById.mockResolvedValue(makeTask({ sync_status: 'connected', project_id: 'proj-1' }));
    render(<TaskDetailPage />);
    await waitFor(() => expect(screen.getByLabelText('Disconnect from Project')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Disconnect from Project'));

    await waitFor(() => expect(screen.getByText('Disconnect from Project')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));

    expect(mockDisconnectTaskFromProject).not.toHaveBeenCalled();
  });
});
