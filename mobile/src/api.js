import { API_BASE_URL } from './config';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h.Authorization = `Bearer ${authToken}`;
  return h;
}

export async function fetchPlacards(full = false) {
  const url = full ? `${API_BASE_URL}/placards?full=true` : `${API_BASE_URL}/placards`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error('Failed to fetch placards');
  return res.json();
}

export async function fetchPlacardById(id) {
  const res = await fetch(`${API_BASE_URL}/placards/${id}`, { headers: headers() });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error('Placard not found');
  return res.json();
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE_URL}/me`, { headers: headers() });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function connectRepo(repoOwner, repoName, leetcodePathPrefix = 'LeetCode') {
  const res = await fetch(`${API_BASE_URL}/me/repo`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repo_owner: repoOwner,
      repo_name: repoName,
      leetcode_path_prefix: leetcodePathPrefix || 'LeetCode',
    }),
  });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to connect repo');
  }
  return res.json();
}

export async function syncNow() {
  const res = await fetch(`${API_BASE_URL}/me/sync`, { method: 'POST', headers: headers() });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error('Sync failed');
  return res.json();
}

export async function resyncCards(force = false) {
  const res = await fetch(`${API_BASE_URL}/me/resync`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ force }),
  });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error('Resync failed');
  return res.json();
}

export async function getResyncStatus() {
  const res = await fetch(`${API_BASE_URL}/me/resync/status`, { headers: headers() });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error('Failed to get status');
  return res.json();
}

export async function toggleMastered(placardId) {
  const res = await fetch(`${API_BASE_URL}/placards/${placardId}/mastered`, {
    method: 'POST',
    headers: headers(),
  });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error('Failed to toggle mastered');
  return res.json();
}
