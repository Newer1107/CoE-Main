'use client';

import { useCallback, useEffect, useState } from 'react';

interface UserSummary {
  id: number;
  name: string;
  email: string;
}

interface ParticipantRow {
  student: UserSummary;
}

interface InternshipDetail {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  industry?: { id: number; name: string } | null;
  participants: ParticipantRow[];
}

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  assignedTo: UserSummary;
  deadline: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface MessageRow {
  id: number;
  content: string;
  createdAt: string;
  sender: UserSummary & { role: string };
}

interface MeetingRow {
  id: number | string;
  title: string;
  datetime: string;
  link: string;
  description: string | null;
}

interface DocumentRow {
  id: number;
  documentType: 'FILE' | 'LINK';
  title: string | null;
  fileUrl: string | null;
  linkUrl: string | null;
  createdAt: string;
  uploadedBy: UserSummary;
}

interface ApiResponse<T> {
  data: T;
}

const formatDate = (value: string) => new Date(value).toLocaleString();

const renderMessageContent = (content: string) => {
  const parts = content.split(/(https?:\/\/\S+|\/api\/storage\/\S+)/g);
  return parts.map((part, index) => {
    const isLink = /^(https?:\/\/\S+|\/api\/storage\/\S+)$/.test(part);
    if (isLink) {
      return (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="text-[#002155] underline break-all">
          {part}
        </a>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

export default function StudentInternshipClient({ problemId }: { problemId: number }) {
  const [internship, setInternship] = useState<InternshipDetail | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [messageAttachment, setMessageAttachment] = useState<File | null>(null);
  const [messageAttachmentKey, setMessageAttachmentKey] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [internshipRes, tasksRes, messagesRes, meetingsRes, documentsRes] = await Promise.all([
        fetch(`/api/internships?id=${problemId}`),
        fetch(`/api/tasks?problemId=${problemId}`),
        fetch(`/api/messages?problemId=${problemId}`),
        fetch(`/api/meetings?problemId=${problemId}`),
        fetch(`/api/documents?problemId=${problemId}`),
      ]);

      if (!internshipRes.ok) throw new Error('Failed to load internship');
      if (!tasksRes.ok) throw new Error('Failed to load tasks');
      if (!messagesRes.ok) throw new Error('Failed to load messages');
      if (!meetingsRes.ok) throw new Error('Failed to load meetings');
      if (!documentsRes.ok) throw new Error('Failed to load documents');

      const internshipJson = (await internshipRes.json()) as ApiResponse<InternshipDetail>;
      const tasksJson = (await tasksRes.json()) as ApiResponse<TaskRow[]>;
      const messagesJson = (await messagesRes.json()) as ApiResponse<MessageRow[]>;
      const meetingsJson = (await meetingsRes.json()) as ApiResponse<MeetingRow[]>;
      const documentsJson = (await documentsRes.json()) as ApiResponse<DocumentRow[]>;

      setInternship(internshipJson.data);
      setTasks(tasksJson.data || []);
      setMessages(messagesJson.data || []);
      setMeetings(meetingsJson.data || []);
      setDocuments(documentsJson.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load internship workspace');
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleTaskStatus = async (taskId: number, status: TaskRow['status']) => {
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to update task');

      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim() && !messageAttachment) {
      setError('Message content or an attachment is required.');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set('problemId', String(problemId));
      if (messageContent.trim()) {
        formData.set('content', messageContent.trim());
      }
      if (messageAttachment) {
        formData.set('attachment', messageAttachment);
      }

      const res = await fetch('/api/messages', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to send message');

      setMessageContent('');
      setMessageAttachment(null);
      setMessageAttachmentKey((value) => value + 1);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
        <div className="text-center text-[#434651]">Loading internship workspace...</div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          {internship?.title || 'Internship Workspace'}
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Track your internship tasks and collaborate with your industry mentor.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
          <p className="font-medium">{error}</p>
        </div>
      )}

      <section className="space-y-6">
        <div className="border border-[#c4c6d3] rounded p-5 bg-white">
          <h2 className="text-lg font-bold text-[#002155] mb-3">Tasks</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-[#747782]">No tasks assigned yet.</p>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="border border-[#e0e2ea] rounded p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#002155]">{task.title}</p>
                      {task.description && (
                        <p className="text-sm text-[#434651] mt-1">{task.description}</p>
                      )}
                      <p className="text-xs text-[#747782] mt-1">
                        Deadline {task.deadline ? formatDate(task.deadline) : 'None'}
                      </p>
                    </div>
                    <select
                      value={task.status}
                      onChange={(event) => handleTaskStatus(task.id, event.target.value as TaskRow['status'])}
                      className="px-2 py-1 border border-[#c4c6d3] rounded text-xs"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-[#c4c6d3] rounded p-5 bg-white">
          <h2 className="text-lg font-bold text-[#002155] mb-3">Messages</h2>
          <div className="space-y-3">
            <div className="max-h-[240px] overflow-y-auto border border-[#e0e2ea] rounded p-3 bg-[#faf9f5]">
              {messages.length === 0 ? (
                <p className="text-sm text-[#747782]">No messages yet.</p>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="mb-3">
                    <p className="text-sm text-[#002155] font-semibold">
                      {message.sender.name} <span className="text-xs text-[#747782]">({message.sender.role})</span>
                    </p>
                    <p className="text-sm text-[#434651] whitespace-pre-wrap break-words">{renderMessageContent(message.content)}</p>
                    <p className="text-xs text-[#747782]">{formatDate(message.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={messageContent}
                onChange={(event) => setMessageContent(event.target.value)}
                placeholder="Write a message"
                className="flex-1 px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <input
                key={messageAttachmentKey}
                type="file"
                onChange={(event) => setMessageAttachment(event.target.files?.[0] ?? null)}
                className="w-[200px] px-2 py-2 border border-[#c4c6d3] rounded text-xs"
              />
              <button
                onClick={handleSendMessage}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        <div className="border border-[#c4c6d3] rounded p-5 bg-white">
          <h2 className="text-lg font-bold text-[#002155] mb-3">Meetings</h2>
          {meetings.length === 0 ? (
            <p className="text-sm text-[#747782]">No meetings scheduled.</p>
          ) : (
            <div className="space-y-3">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="border border-[#e0e2ea] rounded p-4">
                  <p className="font-semibold text-[#002155]">{meeting.title}</p>
                  <p className="text-sm text-[#747782]">{formatDate(meeting.datetime)}</p>
                  <a
                    href={meeting.link}
                    className="text-sm text-[#fd9923] underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join meeting
                  </a>
                  {meeting.description && (
                    <p className="text-sm text-[#434651] mt-1">{meeting.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-[#c4c6d3] rounded p-5 bg-white">
          <h2 className="text-lg font-bold text-[#002155] mb-3">Documents</h2>
          {documents.length === 0 ? (
            <p className="text-sm text-[#747782]">No documents uploaded.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((document) => (
                <div key={document.id} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <a
                      href={document.documentType === 'LINK' ? document.linkUrl ?? '#' : document.fileUrl ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[#002155] underline"
                    >
                      {document.title || document.linkUrl || document.fileUrl}
                    </a>
                    <span className="text-[11px] uppercase tracking-wide text-[#747782]">
                      {document.documentType === 'LINK' ? 'Link' : 'File'}
                    </span>
                  </div>
                  <span className="text-xs text-[#747782]">{formatDate(document.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
