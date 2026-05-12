'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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
  createdAt: string;
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

export default function FacultyInternshipClient({ problemId }: { problemId: number }) {
  const [internship, setInternship] = useState<InternshipDetail | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assignedToId: '',
    deadline: '',
  });
  const [meetingForm, setMeetingForm] = useState({
    title: '',
    datetime: '',
    link: '',
    description: '',
    repeat: false,
    recurrenceInterval: 1,
    recurrenceDay: new Date().getDay(),
  });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentInputKey, setDocumentInputKey] = useState(0);
  const [documentMode, setDocumentMode] = useState<'FILE' | 'LINK'>('FILE');
  const [documentLinkTitle, setDocumentLinkTitle] = useState('');
  const [documentLinkUrl, setDocumentLinkUrl] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [messageAttachment, setMessageAttachment] = useState<File | null>(null);
  const [messageAttachmentKey, setMessageAttachmentKey] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const weekdayOptions = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const participants = useMemo(() => internship?.participants ?? [], [internship]);

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

  const handleCreateTask = async () => {
    if (!taskForm.title.trim() || !taskForm.assignedToId) {
      setError('Task title and assignee are required.');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId,
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          assignedToId: Number(taskForm.assignedToId),
          deadline: taskForm.deadline || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to create task');

      setTaskForm({ title: '', description: '', assignedToId: '', deadline: '' });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setActionLoading(false);
    }
  };

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

  const handleCreateMeeting = async () => {
    if (!meetingForm.title.trim() || !meetingForm.datetime || !meetingForm.link.trim()) {
      setError('Meeting title, time, and link are required.');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId,
          title: meetingForm.title.trim(),
          datetime: meetingForm.datetime,
          link: meetingForm.link.trim(),
          description: meetingForm.description.trim() || undefined,
          recurrenceType: meetingForm.repeat ? 'WEEKLY' : 'NONE',
          recurrenceInterval: meetingForm.repeat ? meetingForm.recurrenceInterval : undefined,
          recurrenceDay: meetingForm.repeat ? meetingForm.recurrenceDay : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to create meeting');

      setMeetingForm({
        title: '',
        datetime: '',
        link: '',
        description: '',
        repeat: false,
        recurrenceInterval: 1,
        recurrenceDay: new Date().getDay(),
      });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadDocument = async () => {
    setActionLoading(true);
    setError(null);

    try {
      let res: Response;
      if (documentMode === 'FILE') {
        if (!documentFile) {
          setError('Please select a file to upload.');
          setActionLoading(false);
          return;
        }

        const formData = new FormData();
        formData.set('problemId', String(problemId));
        formData.set('file', documentFile);

        res = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
        });
      } else {
        if (!documentLinkTitle.trim() || !documentLinkUrl.trim()) {
          setError('Document title and link are required.');
          setActionLoading(false);
          return;
        }

        res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            problemId,
            documentType: 'LINK',
            title: documentLinkTitle.trim(),
            linkUrl: documentLinkUrl.trim(),
          }),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to upload document');

      setDocumentFile(null);
      setDocumentInputKey((value) => value + 1);
      setDocumentLinkTitle('');
      setDocumentLinkUrl('');
      setDocumentMode('FILE');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
        <div className="text-center text-[#434651]">Loading internship workspace...</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          {internship?.title || 'Internship Workspace'}
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Manage tasks, conversations, meetings, and shared documents for this internship cohort.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
          <p className="font-medium">{error}</p>
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <div className="border border-[#c4c6d3] rounded p-5 bg-white">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Participants</h2>
            <ul className="space-y-2">
              {participants.length === 0 && (
                <li className="text-sm text-[#747782]">No participants yet.</li>
              )}
              {participants.map((participant) => (
                <li key={participant.student.id} className="text-sm text-[#434651]">
                  <span className="font-semibold">{participant.student.name}</span>
                  <span className="block text-xs text-[#747782]">{participant.student.email}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-[#c4c6d3] rounded p-5 bg-white">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Create Task</h2>
            <div className="space-y-3">
              <input
                value={taskForm.title}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Task title"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <textarea
                value={taskForm.description}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm min-h-[90px]"
              />
              <select
                value={taskForm.assignedToId}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, assignedToId: event.target.value }))}
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              >
                <option value="">Assign to</option>
                {participants.map((participant) => (
                  <option key={participant.student.id} value={participant.student.id}>
                    {participant.student.name}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={taskForm.deadline}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, deadline: event.target.value }))}
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <button
                onClick={handleCreateTask}
                disabled={actionLoading}
                className="w-full px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
              >
                {actionLoading ? 'Saving...' : 'Create Task'}
              </button>
            </div>
          </div>

          <div className="border border-[#c4c6d3] rounded p-5 bg-white">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Schedule Meeting</h2>
            <div className="space-y-3">
              <input
                value={meetingForm.title}
                onChange={(event) => setMeetingForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Meeting title"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <input
                type="datetime-local"
                value={meetingForm.datetime}
                onChange={(event) =>
                  setMeetingForm((prev) => {
                    const nextDatetime = event.target.value;
                    if (!prev.repeat) return { ...prev, datetime: nextDatetime };
                    const nextDay = nextDatetime ? new Date(nextDatetime).getDay() : prev.recurrenceDay;
                    return { ...prev, datetime: nextDatetime, recurrenceDay: nextDay };
                  })
                }
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <input
                value={meetingForm.link}
                onChange={(event) => setMeetingForm((prev) => ({ ...prev, link: event.target.value }))}
                placeholder="Meeting link"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <textarea
                value={meetingForm.description}
                onChange={(event) => setMeetingForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Agenda"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm min-h-[80px]"
              />
              <label className="flex items-center gap-2 text-sm text-[#434651]">
                <input
                  type="checkbox"
                  checked={meetingForm.repeat}
                  onChange={(event) =>
                    setMeetingForm((prev) => {
                      const repeat = event.target.checked;
                      const recurrenceDay = prev.datetime
                        ? new Date(prev.datetime).getDay()
                        : prev.recurrenceDay;
                      return { ...prev, repeat, recurrenceDay };
                    })
                  }
                />
                Repeat meeting weekly
              </label>
              {meetingForm.repeat && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-[#747782] mb-2">
                      Every (weeks)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={meetingForm.recurrenceInterval}
                      onChange={(event) =>
                        setMeetingForm((prev) => ({
                          ...prev,
                          recurrenceInterval: Math.max(1, Number(event.target.value || 1)),
                        }))
                      }
                      className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-[#747782] mb-2">
                      Day
                    </label>
                    <select
                      value={meetingForm.recurrenceDay}
                      onChange={(event) =>
                        setMeetingForm((prev) => ({
                          ...prev,
                          recurrenceDay: Number(event.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
                    >
                      {weekdayOptions.map((label, index) => (
                        <option key={label} value={index}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <button
                onClick={handleCreateMeeting}
                disabled={actionLoading}
                className="w-full px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
              >
                {actionLoading ? 'Saving...' : 'Create Meeting'}
              </button>
            </div>
          </div>

          <div className="border border-[#c4c6d3] rounded p-5 bg-white">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Upload Document</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="documentMode"
                    checked={documentMode === 'FILE'}
                    onChange={() => setDocumentMode('FILE')}
                  />
                  Upload File
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="documentMode"
                    checked={documentMode === 'LINK'}
                    onChange={() => setDocumentMode('LINK')}
                  />
                  Add Document Link
                </label>
              </div>

              {documentMode === 'FILE' ? (
                <input
                  key={documentInputKey}
                  type="file"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                  className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
                />
              ) : (
                <div className="space-y-3">
                  <input
                    value={documentLinkTitle}
                    onChange={(event) => setDocumentLinkTitle(event.target.value)}
                    placeholder="Document title"
                    className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
                  />
                  <input
                    value={documentLinkUrl}
                    onChange={(event) => setDocumentLinkUrl(event.target.value)}
                    placeholder="https://docs.google.com/..."
                    className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
                  />
                </div>
              )}
              <button
                onClick={handleUploadDocument}
                disabled={actionLoading}
                className="w-full px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
              >
                {actionLoading ? 'Saving...' : 'Upload Document'}
              </button>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <section className="border border-[#c4c6d3] rounded p-5 bg-white">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Tasks</h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-[#747782]">No tasks yet.</p>
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
                          Assigned to {task.assignedTo.name} • Deadline {task.deadline ? formatDate(task.deadline) : 'None'}
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
          </section>

          <section className="border border-[#c4c6d3] rounded p-5 bg-white">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Messages</h2>
            <div className="space-y-3">
              <div className="max-h-[280px] overflow-y-auto border border-[#e0e2ea] rounded p-3 bg-[#faf9f5]">
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
          </section>

          <section className="border border-[#c4c6d3] rounded p-5 bg-white">
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
          </section>

          <section className="border border-[#c4c6d3] rounded p-5 bg-white">
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
          </section>
        </div>
      </section>
    </main>
  );
}
