import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { CreateItemModal } from './create-item-modal';

afterEach(() => {
  cleanup();
});

// Mock dependencies
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({
    token: 'mock-token',
    user: { email: 'test@example.com', name: 'Test User', picture: '' },
  }),
}));

const { mockBoardStore } = vi.hoisted(() => {
  const mockBoardStore = {
    showCreateModal: { value: true },
    createModalInitialStatus: { value: null as string | null },
    createModalInitialDueDate: { value: null as string | null },
    owners: {
      value: [
        { name: 'Test User', google_account: 'test@example.com' },
        { name: 'Mom', google_account: 'mom@test.com' },
        { name: 'Dad', google_account: 'dad@test.com' },
      ],
    },
    labels: { value: [{ label: 'Urgent', color: '#ff0000' }] },
    openDetailWithTitleEdit: { value: false },
    clearCreateItemUrlParams: vi.fn(),
    activeView: { value: 'boards' as string },
    activeBoardId: { value: 'b1' },
    accessibleBoards: {
      value: [
        { id: 'b1', name: 'Family', icon: '' },
        { id: 'b2', name: 'Work', icon: '' },
      ],
    },
    firstStatusNameForBoard: (id: string) => (id === 'b2' ? 'Backlog' : 'To Do'),
  };
  return { mockBoardStore };
});
vi.mock('../../state/board-store', () => mockBoardStore);

const mockCreateItem = vi.fn();
const mockCreateItemWithSubtasks = vi.fn();
vi.mock('../../state/actions', () => ({
  createItem: (...args: unknown[]) => mockCreateItem(...args),
  createItemWithSubtasks: (...args: unknown[]) => mockCreateItemWithSubtasks(...args),
}));

vi.mock('../labels/label-picker-manager', () => ({
  LabelPickerManager: () => <div data-testid="label-picker" />,
}));

vi.mock('../../utils/color', () => ({
  getContrastTextColor: () => '#000',
}));

beforeEach(() => {
  mockCreateItem.mockClear();
  mockCreateItemWithSubtasks.mockClear();
  mockBoardStore.clearCreateItemUrlParams.mockClear();
  mockBoardStore.showCreateModal.value = true;
  mockBoardStore.createModalInitialStatus.value = null;
  mockBoardStore.createModalInitialDueDate.value = null;
  mockBoardStore.activeView.value = 'boards';
  mockBoardStore.activeBoardId.value = 'b1';
});

// --- Inline Sub-tasks (Issue #55) ---
describe('CreateItemModal — Inline Sub-tasks (Issue #55)', () => {
  function getSubtaskInput(container: Element) {
    return container.querySelector('#subtask-title') as HTMLInputElement;
  }

  function getAddButton(container: Element) {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add') as HTMLButtonElement;
  }

  function addSubtaskViaEnter(container: Element, title: string) {
    const input = getSubtaskInput(container);
    fireEvent.input(input, { target: { value: title } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  function getStagedSubtasks(container: Element) {
    return container.querySelectorAll('.staged-subtask');
  }

  // AC1: Sub-task input section visible in create modal
  describe('AC1: Sub-task input section visible', () => {
    it('renders a Sub-tasks section with input and Add button', () => {
      const { container } = render(<CreateItemModal />);
      const section = container.querySelector('.subtasks-section');
      expect(section).not.toBeNull();

      const input = getSubtaskInput(container);
      expect(input).not.toBeNull();
      expect(input.placeholder).toBe('Sub-task title...');

      const addBtn = getAddButton(container);
      expect(addBtn).not.toBeNull();
    });

    it('shows Enter to add hint', () => {
      const { container } = render(<CreateItemModal />);
      const hints = container.querySelectorAll('.form-hint');
      const subtaskHint = Array.from(hints).find((h) => h.textContent?.includes('Enter to add'));
      expect(subtaskHint).not.toBeNull();
    });

    it('shows count when sub-tasks are present', () => {
      const { container } = render(<CreateItemModal />);
      addSubtaskViaEnter(container, 'Task A');
      addSubtaskViaEnter(container, 'Task B');

      const label = container.querySelector('.subtasks-section label');
      expect(label!.textContent).toBe('Sub-tasks (2)');
    });

    it('shows no count when no sub-tasks exist', () => {
      const { container } = render(<CreateItemModal />);
      const label = container.querySelector('.subtasks-section label');
      expect(label!.textContent).toBe('Sub-tasks');
    });
  });

  // AC2: Adding multiple sub-tasks before saving
  describe('AC2: Adding multiple sub-tasks', () => {
    it('adds sub-task to list on Enter and clears input', () => {
      const { container } = render(<CreateItemModal />);
      addSubtaskViaEnter(container, 'Buy milk');

      const staged = getStagedSubtasks(container);
      expect(staged).toHaveLength(1);
      expect(staged[0].querySelector('.staged-subtask-title')!.textContent).toBe('Buy milk');

      // Input should be cleared
      const input = getSubtaskInput(container);
      expect(input.value).toBe('');
    });

    it('adds sub-task on Add button click', () => {
      const { container } = render(<CreateItemModal />);
      const input = getSubtaskInput(container);
      fireEvent.input(input, { target: { value: 'Buy eggs' } });

      const addBtn = getAddButton(container);
      fireEvent.click(addBtn);

      const staged = getStagedSubtasks(container);
      expect(staged).toHaveLength(1);
      expect(staged[0].querySelector('.staged-subtask-title')!.textContent).toBe('Buy eggs');
    });

    it('can add multiple sub-tasks', () => {
      const { container } = render(<CreateItemModal />);
      addSubtaskViaEnter(container, 'Task A');
      addSubtaskViaEnter(container, 'Task B');
      addSubtaskViaEnter(container, 'Task C');

      const staged = getStagedSubtasks(container);
      expect(staged).toHaveLength(3);
    });

    it('does not add empty/whitespace sub-tasks', () => {
      const { container } = render(<CreateItemModal />);
      addSubtaskViaEnter(container, '   ');

      const staged = getStagedSubtasks(container);
      expect(staged).toHaveLength(0);
    });
  });

  // AC3: Removing a staged sub-task
  describe('AC3: Removing a staged sub-task', () => {
    it('removes a sub-task when ✕ is clicked', () => {
      const { container } = render(<CreateItemModal />);
      addSubtaskViaEnter(container, 'Task A');
      addSubtaskViaEnter(container, 'Task B');

      const removeBtn = container.querySelector('.staged-subtask-remove') as HTMLButtonElement;
      fireEvent.click(removeBtn);

      const staged = getStagedSubtasks(container);
      expect(staged).toHaveLength(1);
      expect(staged[0].querySelector('.staged-subtask-title')!.textContent).toBe('Task B');
    });

    it('remove button has correct aria-label', () => {
      const { container } = render(<CreateItemModal />);
      addSubtaskViaEnter(container, 'Buy milk');

      const removeBtn = container.querySelector('.staged-subtask-remove') as HTMLButtonElement;
      expect(removeBtn.getAttribute('aria-label')).toBe('Remove sub-task: Buy milk');
    });
  });

  // AC4: Sub-tasks inherit parent owner — removed (Issue #209 removed subtask owner feature)

  // AC5: Saving parent and sub-tasks together
  describe('AC5: Saving parent and sub-tasks', () => {
    it('calls createItemWithSubtasks when sub-tasks exist', () => {
      const { container } = render(<CreateItemModal />);
      const titleInput = container.querySelector('#title') as HTMLInputElement;
      fireEvent.input(titleInput, { target: { value: 'Parent task' } });

      addSubtaskViaEnter(container, 'Child A');
      addSubtaskViaEnter(container, 'Child B');

      const form = container.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);

      expect(mockCreateItemWithSubtasks).toHaveBeenCalledTimes(1);
      expect(mockCreateItem).not.toHaveBeenCalled();

      const [data, subtasks, actor, token] = mockCreateItemWithSubtasks.mock.calls[0];
      expect(data.title).toBe('Parent task');
      expect(subtasks).toHaveLength(2);
      expect(subtasks[0].title).toBe('Child A');
      expect(subtasks[1].title).toBe('Child B');
      expect(actor).toBe('Test User');
      expect(token).toBe('mock-token');
    });

    it('closes the modal after saving', () => {
      const { container } = render(<CreateItemModal />);
      const titleInput = container.querySelector('#title') as HTMLInputElement;
      fireEvent.input(titleInput, { target: { value: 'Parent' } });
      addSubtaskViaEnter(container, 'Child');

      const form = container.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);

      expect(mockBoardStore.showCreateModal.value).toBe(false);
    });
  });

  // AC6: Keyboard-driven flow
  describe('AC6: Keyboard-driven flow', () => {
    it('Enter adds sub-task and clears input', () => {
      const { container } = render(<CreateItemModal />);
      const input = getSubtaskInput(container);
      fireEvent.input(input, { target: { value: 'Sub A' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(getStagedSubtasks(container)).toHaveLength(1);
      expect(input.value).toBe('');
    });

    it('Escape clears input when text is present', () => {
      const { container } = render(<CreateItemModal />);
      const input = getSubtaskInput(container);
      fireEvent.input(input, { target: { value: 'partial text' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(input.value).toBe('');
      // Modal should still be open (stopPropagation prevents close)
      expect(mockBoardStore.showCreateModal.value).toBe(true);
    });

    it('Escape on empty input closes modal', () => {
      const { container } = render(<CreateItemModal />);
      const input = getSubtaskInput(container);
      // Input is empty
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(mockBoardStore.showCreateModal.value).toBe(false);
    });

    it('Enter does not add empty sub-task', () => {
      const { container } = render(<CreateItemModal />);
      const input = getSubtaskInput(container);
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(getStagedSubtasks(container)).toHaveLength(0);
    });
  });

  // AC7: Empty state — no sub-tasks required
  describe('AC7: Empty state — no sub-tasks required', () => {
    it('calls createItem (not createItemWithSubtasks) when no sub-tasks', () => {
      const { container } = render(<CreateItemModal />);
      const titleInput = container.querySelector('#title') as HTMLInputElement;
      fireEvent.input(titleInput, { target: { value: 'Solo task' } });

      const form = container.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);

      expect(mockCreateItem).toHaveBeenCalledTimes(1);
      expect(mockCreateItemWithSubtasks).not.toHaveBeenCalled();
    });
  });

  // AC9: Modal accessibility attributes (Issue #55)
  describe('AC9: Modal accessibility attributes', () => {
    it('modal has role="dialog" and aria-modal="true"', () => {
      const { container } = render(<CreateItemModal />);
      const modal = container.querySelector('.modal');
      expect(modal!.getAttribute('role')).toBe('dialog');
      expect(modal!.getAttribute('aria-modal')).toBe('true');
    });

    it('modal has aria-labelledby pointing to the heading', () => {
      const { container } = render(<CreateItemModal />);
      const modal = container.querySelector('.modal');
      const heading = container.querySelector('h2');
      expect(heading!.id).toBe('create-modal-title');
      expect(modal!.getAttribute('aria-labelledby')).toBe('create-modal-title');
    });

    it('close button has aria-label="Close"', () => {
      const { container } = render(<CreateItemModal />);
      const closeBtn = container.querySelector('.modal-header .btn.btn-ghost') as HTMLButtonElement;
      expect(closeBtn.getAttribute('aria-label')).toBe('Close');
    });
  });
});

// --- Quick Date Shortcuts (Issue #82) ---
describe('CreateItemModal — Quick Date Shortcuts (Issue #82)', () => {
  describe('AC1: Quick date chips on create modal', () => {
    it('renders quick date chips below the due date input', () => {
      const { container } = render(<CreateItemModal />);
      const dueDateField = container.querySelector('#due-date')!.closest('.form-field')!;
      const chips = dueDateField.querySelector('.quick-date-chips');
      expect(chips).not.toBeNull();
      expect(chips!.querySelectorAll('.quick-date-chip')).toHaveLength(4);
    });

    it('tapping a due date chip populates the due date input', () => {
      const { container } = render(<CreateItemModal />);
      const dueDateField = container.querySelector('#due-date')!.closest('.form-field')!;
      const todayChip = dueDateField.querySelector('.quick-date-chip') as HTMLButtonElement;
      fireEvent.click(todayChip);

      // Submitting the form should include today's date as due_date
      const titleInput = container.querySelector('#title') as HTMLInputElement;
      fireEvent.input(titleInput, { target: { value: 'Test' } });
      const form = container.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);

      const today = new Date();
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(mockCreateItem.mock.calls[0][0].due_date).toBe(expected);
    });

    it('date input can still be edited manually after chip selection', () => {
      const { container } = render(<CreateItemModal />);
      const dueDateField = container.querySelector('#due-date')!.closest('.form-field')!;
      const todayChip = dueDateField.querySelector('.quick-date-chip') as HTMLButtonElement;
      fireEvent.click(todayChip);

      // Override with manual date
      const dueDateInput = container.querySelector('#due-date') as HTMLInputElement;
      fireEvent.change(dueDateInput, { target: { value: '2026-12-25' } });

      const titleInput = container.querySelector('#title') as HTMLInputElement;
      fireEvent.input(titleInput, { target: { value: 'Test' } });
      const form = container.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);

      expect(mockCreateItem.mock.calls[0][0].due_date).toBe('2026-12-25');
    });
  });
});

// --- Owner removed from the create form (Issue #647) ---
describe('CreateItemModal — no owner field (Issue #647)', () => {
  beforeEach(() => {
    mockCreateItem.mockClear();
    mockCreateItemWithSubtasks.mockClear();
    mockBoardStore.showCreateModal.value = true;
  });

  it('has no Owner field and creates the item with owner: ""', () => {
    const { container } = render(<CreateItemModal />);
    expect(container.querySelector('#owner')).toBeNull();

    const titleInput = container.querySelector('#title') as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: 'My task' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockCreateItem).toHaveBeenCalledTimes(1);
    expect(mockCreateItem.mock.calls[0][0].owner).toBe('');
  });
});

// --- Inline Add Item to Column (Issue #170) ---
describe('CreateItemModal — Inline Add Item (Issue #170)', () => {
  beforeEach(() => {
    mockCreateItem.mockClear();
    mockCreateItemWithSubtasks.mockClear();
    mockBoardStore.showCreateModal.value = true;
    mockBoardStore.createModalInitialStatus.value = null;
  });

  // AC1: Pre-filled status is passed to createItem
  it('passes pre-filled status to createItem when createModalInitialStatus is set', () => {
    mockBoardStore.createModalInitialStatus.value = 'In Progress';

    const { container } = render(<CreateItemModal />);
    const titleInput = container.querySelector('#title') as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: 'New task' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockCreateItem).toHaveBeenCalledTimes(1);
    expect(mockCreateItem.mock.calls[0][0].status).toBe('In Progress');
  });

  // AC1: No status property when createModalInitialStatus is null (defaults to To Do)
  it('does not set status when createModalInitialStatus is null', () => {
    mockBoardStore.createModalInitialStatus.value = null;

    const { container } = render(<CreateItemModal />);
    const titleInput = container.querySelector('#title') as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: 'New task' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockCreateItem).toHaveBeenCalledTimes(1);
    expect(mockCreateItem.mock.calls[0][0]).not.toHaveProperty('status');
  });

  // AC3: Pre-filled status works for Done column
  it('passes Done status when createModalInitialStatus is Done', () => {
    mockBoardStore.createModalInitialStatus.value = 'Done';

    const { container } = render(<CreateItemModal />);
    const titleInput = container.querySelector('#title') as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: 'Completed task' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockCreateItem).toHaveBeenCalledTimes(1);
    expect(mockCreateItem.mock.calls[0][0].status).toBe('Done');
  });

  // Closing modal clears createModalInitialStatus
  it('clears createModalInitialStatus when modal is closed', () => {
    mockBoardStore.createModalInitialStatus.value = 'In Progress';

    const { container } = render(<CreateItemModal />);
    const closeBtn = container.querySelector('.modal-header .btn.btn-ghost') as HTMLButtonElement;
    fireEvent.click(closeBtn);

    expect(mockBoardStore.createModalInitialStatus.value).toBeNull();
  });

  // Pre-filled status works with subtasks
  it('passes pre-filled status to createItemWithSubtasks', () => {
    mockBoardStore.createModalInitialStatus.value = 'To Do';

    const { container } = render(<CreateItemModal />);
    const titleInput = container.querySelector('#title') as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: 'Parent task' } });

    // Add subtask
    const subtaskInput = container.querySelector('#subtask-title') as HTMLInputElement;
    fireEvent.input(subtaskInput, { target: { value: 'Child task' } });
    fireEvent.keyDown(subtaskInput, { key: 'Enter' });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockCreateItemWithSubtasks).toHaveBeenCalledTimes(1);
    expect(mockCreateItemWithSubtasks.mock.calls[0][0].status).toBe('To Do');
  });
});

describe('CreateItemModal clear date button (Issue #207)', () => {
  beforeEach(() => {
    mockBoardStore.showCreateModal.value = true;
    mockBoardStore.createModalInitialStatus.value = null;
    mockCreateItem.mockReset();
  });

  // AC6: Clear button in create modal
  it('AC6: no clear button when date is empty', () => {
    const { container } = render(<CreateItemModal />);
    const clearBtn = container.querySelector('[aria-label="Clear due date"]');
    expect(clearBtn).toBeNull();
  });

  it('AC6: clear button appears after setting a date', () => {
    const { container } = render(<CreateItemModal />);
    const dateInput = container.querySelector('#due-date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-04-10' } });
    const clearBtn = container.querySelector('[aria-label="Clear due date"]');
    expect(clearBtn).not.toBeNull();
  });

  it('AC6: clicking clear removes the date', () => {
    const { container } = render(<CreateItemModal />);
    const dateInput = container.querySelector('#due-date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-04-10' } });

    const clearBtn = container.querySelector('[aria-label="Clear due date"]') as HTMLElement;
    fireEvent.click(clearBtn);

    expect(dateInput.value).toBe('');
    expect(container.querySelector('[aria-label="Clear due date"]')).toBeNull();
  });
});

describe('CreateItemModal — deep-link due date pre-fill (Issue #263)', () => {
  beforeEach(() => {
    mockCreateItem.mockClear();
    mockBoardStore.showCreateModal.value = true;
    mockBoardStore.createModalInitialStatus.value = null;
    mockBoardStore.createModalInitialDueDate.value = null;
    mockBoardStore.clearCreateItemUrlParams.mockClear();
  });

  // AC1: the due date field is pre-filled from createModalInitialDueDate
  it('AC1: pre-fills the due date field from createModalInitialDueDate', () => {
    mockBoardStore.createModalInitialDueDate.value = '2026-09-24';

    const { container } = render(<CreateItemModal />);
    const dateInput = container.querySelector('#due-date') as HTMLInputElement;

    expect(dateInput.value).toBe('2026-09-24');
  });

  // AC1: the matching quick-date chip shows as active when the pre-filled date matches
  it('AC1: shows the matching quick-date chip as active for the pre-filled date', () => {
    // "Today" always resolves to today's date; use it to keep the test stable.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockBoardStore.createModalInitialDueDate.value = todayStr;

    const { container } = render(<CreateItemModal />);
    const activeChip = container.querySelector('.quick-date-chip-active');

    expect(activeChip?.textContent).toBe('Today');
  });

  // AC1: title field still gets focus, as with any other modal open
  it('AC1: title field has focus when opened with a pre-filled due date', () => {
    mockBoardStore.createModalInitialDueDate.value = '2026-09-24';

    const { container } = render(<CreateItemModal />);
    const titleInput = container.querySelector('#title') as HTMLInputElement;

    expect(document.activeElement).toBe(titleInput);
  });

  // AC4: an empty pre-fill (missing/malformed `due`) leaves the field blank, no error
  it('AC4: an empty createModalInitialDueDate leaves the due date field blank', () => {
    mockBoardStore.createModalInitialDueDate.value = '';

    const { container } = render(<CreateItemModal />);
    const dateInput = container.querySelector('#due-date') as HTMLInputElement;

    expect(dateInput.value).toBe('');
  });

  // AC1: saving creates the item with the pre-filled due date, unchanged
  it('AC1: saving creates an item with the pre-filled due_date', () => {
    mockBoardStore.createModalInitialDueDate.value = '2026-09-24';

    const { container } = render(<CreateItemModal />);
    const titleInput = container.querySelector('#title') as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: 'Buy milk' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockCreateItem.mock.calls[0][0].due_date).toBe('2026-09-24');
  });

  // AC3: closing the modal (any route) strips the URL params and clears the signal
  it('AC3: close() strips new/due params and clears createModalInitialDueDate', () => {
    mockBoardStore.createModalInitialDueDate.value = '2026-09-24';

    const { container } = render(<CreateItemModal />);
    const closeBtn = container.querySelector('[aria-label="Close"]') as HTMLElement;
    fireEvent.click(closeBtn);

    expect(mockBoardStore.clearCreateItemUrlParams).toHaveBeenCalledTimes(1);
    expect(mockBoardStore.createModalInitialDueDate.value).toBeNull();
  });

  // AC3: submitting (Create) also goes through close(), so params are stripped too
  it('AC3: submitting also strips new/due params', () => {
    mockBoardStore.createModalInitialDueDate.value = '2026-09-24';

    const { container } = render(<CreateItemModal />);
    const titleInput = container.querySelector('#title') as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: 'Buy milk' } });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockBoardStore.clearCreateItemUrlParams).toHaveBeenCalledTimes(1);
  });

  // AC3: on close, focus restores to the "+" FAB when nothing was focused on mount
  it('AC3: restores focus to the "+" FAB button when the modal had no opening trigger', () => {
    mockBoardStore.createModalInitialDueDate.value = '2026-09-24';

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.setAttribute('aria-label', 'Create new item');
    document.body.appendChild(fab);
    // Simulate the cold-deep-link case: nothing has focus (focus sits on body).
    (document.activeElement as HTMLElement | null)?.blur?.();

    const { container, unmount } = render(<CreateItemModal />);
    const closeBtn = container.querySelector('[aria-label="Close"]') as HTMLElement;
    fireEvent.click(closeBtn);
    unmount();

    expect(document.activeElement).toBe(fab);
    fab.remove();
  });

  // AC3: falls back to the main content region when the FAB isn't rendered (Upcoming view)
  it('AC3: restores focus to .board-main when no FAB is present', () => {
    mockBoardStore.createModalInitialDueDate.value = '2026-09-24';

    const main = document.createElement('main');
    main.className = 'board-main';
    document.body.appendChild(main);
    (document.activeElement as HTMLElement | null)?.blur?.();

    const { container, unmount } = render(<CreateItemModal />);
    const closeBtn = container.querySelector('[aria-label="Close"]') as HTMLElement;
    fireEvent.click(closeBtn);
    unmount();

    expect(document.activeElement).toBe(main);
    main.remove();
  });
});

// #624: opened from Today, the form asks which board the item goes on.
describe('Board field (#624)', () => {
  beforeEach(() => {
    mockBoardStore.activeView.value = 'today';
    mockBoardStore.createModalInitialDueDate.value = '2026-10-24';
  });

  it('is absent on a board, where the board is already known', () => {
    mockBoardStore.activeView.value = 'boards';
    const { queryByText } = render(<CreateItemModal />);
    expect(queryByText('Board')).toBeNull();
  });

  it('offers one chip per board, defaulting to the active one, with the due date preset', () => {
    const { getByText, container } = render(<CreateItemModal />);
    expect(getByText('Board')).not.toBeNull();
    const chips = container.querySelectorAll('.board-choice-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].getAttribute('aria-pressed')).toBe('false');
    expect((container.querySelector('#due-date') as HTMLInputElement).value).toBe('2026-10-24');
  });

  it("creates the item on the chosen board, in that board's first column", () => {
    const { container } = render(<CreateItemModal />);
    fireEvent.click(container.querySelectorAll('.board-choice-chip')[1]);
    fireEvent.input(container.querySelector('#title') as HTMLInputElement, { target: { value: 'Pay invoice' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(mockCreateItem).toHaveBeenCalledTimes(1);
    expect(mockCreateItem.mock.calls[0][0]).toMatchObject({
      title: 'Pay invoice',
      board_id: 'b2',
      status: 'Backlog',
      due_date: '2026-10-24',
    });
  });
});
