import { auth } from '../lib/firebase';
import { apiUrl } from '../lib/apiBase';

export interface AdminLogEntry {
  id?: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  action: string;
  details: string;
  targetId?: string;
  timestamp: any;
}

export async function logAdminAction(action: string, details: string, targetId?: string) {
  const user = auth.currentUser;
  if (!user) return; // Silent return if no user, though it should be an admin

  try {
    const token = await user.getIdToken();
    const response = await fetch(apiUrl('/api/admin-logs'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action, details, targetId })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn("Server failed to log admin action", errorData);
    }
  } catch (error) {
    console.error("Failed to log admin action", error);
  }
}

export async function getAdminLogs(limitCount: number = 100): Promise<AdminLogEntry[]> {
  const user = auth.currentUser;
  if (!user) throw new Error("Unauthorized");

  const token = await user.getIdToken();
  const response = await fetch(apiUrl(`/api/admin-logs?limit=${limitCount}`), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch admin logs");
  }

  const data = await response.json();
  
  // Create a mock timestamp object so UI code doesn't break when calling timestamp.toDate()
  return data.logs.map((log: any) => ({
    ...log,
    timestamp: log.timestamp ? { toDate: () => new Date(log.timestamp) } : null
  }));
}

