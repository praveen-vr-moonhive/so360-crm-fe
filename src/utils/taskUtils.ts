import { User, Task } from '../types/crm';

/**
 * Checks if current user can be assigned to tasks (exists in org members list)
 */
export function canCurrentUserBeAssigned(
  currentUser: any | null | undefined,
  usersList: User[]
): boolean {
  if (!currentUser || !currentUser.id) return false;
  return usersList.some(u => u.id === currentUser.id);
}

/**
 * Checks if task is currently assigned to specified user
 */
export function isTaskAssignedToUser(
  task: Task | null | undefined,
  currentUserId: string | undefined
): boolean {
  if (!task || !currentUserId) return false;
  return task.assigned_to?.id === currentUserId;
}

/**
 * Finds current user in users list
 */
export function getCurrentUserFromList(
  currentUserId: string | undefined,
  usersList: User[]
): User | undefined {
  if (!currentUserId) return undefined;
  return usersList.find(u => u.id === currentUserId);
}
