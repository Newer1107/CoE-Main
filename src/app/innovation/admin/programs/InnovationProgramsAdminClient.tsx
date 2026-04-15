"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useToast } from '@/components/ToastProvider';

export type AdminProgramItem = {
  id: string;
  title: string;
  description: string;
  programType: string;
  venue: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  noticeFileUrl: string | null;
  interestCount: number;
};

type ProgramFormState = {
  title: string;
  description: string;
  programType: string;
  venue: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  noticeFile: File | null;
  removeNoticeFile: boolean;
};

const emptyForm: ProgramFormState = {
  title: '',
  description: '',
  programType: 'Seminar',
  venue: '',
  eventDate: '',
  startTime: '',
  endTime: '',
  noticeFile: null,
  removeNoticeFile: false,
};

const toDateInput = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const toTimeInput = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
};

const toDateTimeIso = (date: string, time: string) => `${date}T${time}:00`;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

export default function InnovationProgramsAdminClient({ initialPrograms }: { initialPrograms: AdminProgramItem[] }) {
  const { pushToast } = useToast();
  const [programs, setPrograms] = useState<AdminProgramItem[]>(initialPrograms);
  const [createForm, setCreateForm] = useState<ProgramFormState>(emptyForm);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProgramFormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const sortedPrograms = useMemo(
    () => [...programs].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()),
    [programs]
  );

  const updateForm = (
    setter: (value: ProgramFormState | ((prev: ProgramFormState) => ProgramFormState)) => void,
    field: keyof ProgramFormState,
    value: string | boolean | File | null,
  ) => {
    setter((prev) => ({ ...prev, [field]: value }));
  };

  const buildFormData = (form: ProgramFormState) => {
    const formData = new FormData();
    formData.set('title', form.title.trim());
    formData.set('description', form.description.trim());
    formData.set('programType', form.programType.trim());
    formData.set('venue', form.venue.trim());
    formData.set('eventDate', `${form.eventDate}T00:00:00`);
    formData.set('startTime', toDateTimeIso(form.eventDate, form.startTime));
    formData.set('endTime', toDateTimeIso(form.eventDate, form.endTime));
    if (form.noticeFile) formData.set('noticeFile', form.noticeFile);
    if (form.removeNoticeFile) formData.set('removeNoticeFile', 'true');
    return formData;
  };

  const createProgram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/innovation/programs', {
        method: 'POST',
        body: buildFormData(createForm),
      });
      const payload = (await res.json()) as { success: boolean; message: string; data?: AdminProgramItem };
      if (!res.ok || !payload.success || !payload.data) throw new Error(payload.message || 'Failed to create program');

      setPrograms((prev) => [payload.data!, ...prev]);
      setCreateForm(emptyForm);
      pushToast(payload.message || 'Program created successfully');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to create program', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (program: AdminProgramItem) => {
    setEditingProgramId(program.id);
    setEditForm({
      title: program.title,
      description: program.description,
      programType: program.programType,
      venue: program.venue,
      eventDate: toDateInput(program.eventDate),
      startTime: toTimeInput(program.startTime),
      endTime: toTimeInput(program.endTime),
      noticeFile: null,
      removeNoticeFile: false,
    });
  };

  const saveEdit = async (programId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/innovation/programs/${programId}`, {
        method: 'PATCH',
        body: buildFormData(editForm),
      });
      const payload = (await res.json()) as { success: boolean; message: string; data?: AdminProgramItem };
      if (!res.ok || !payload.success || !payload.data) throw new Error(payload.message || 'Failed to update program');

      setPrograms((prev) => prev.map((program) => (program.id === programId ? payload.data! : program)));
      setEditingProgramId(null);
      pushToast(payload.message || 'Program updated successfully');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update program', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteProgram = async (programId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/innovation/programs/${programId}`, { method: 'DELETE' });
      const payload = (await res.json()) as { success: boolean; message: string };
      if (!res.ok || !payload.success) throw new Error(payload.message || 'Failed to delete program');

      setPrograms((prev) => prev.filter((program) => program.id !== programId));
      pushToast(payload.message || 'Program deleted successfully');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to delete program', 'error');
    } finally {
      setBusy(false);
    }
  };

  const programTypeOptions = ['Seminar', 'Workshop', 'Talk', 'Webinar', 'Bootcamp', 'Conference'];

  return (
    <div className="space-y-8">
      <section className="border border-[#c4c6d3] bg-white p-5">
        <h2 className="text-xl font-bold text-[#002155]">Create Program</h2>
        <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={createProgram}>
          <input
            required
            value={createForm.title}
            onChange={(event) => updateForm(setCreateForm, 'title', event.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
            placeholder="Title"
          />
          <select
            required
            value={createForm.programType}
            onChange={(event) => updateForm(setCreateForm, 'programType', event.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
          >
            {programTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <textarea
            required
            value={createForm.description}
            onChange={(event) => updateForm(setCreateForm, 'description', event.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm md:col-span-2 min-h-[110px]"
            placeholder="Description"
          />
          <input
            required
            value={createForm.venue}
            onChange={(event) => updateForm(setCreateForm, 'venue', event.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
            placeholder="Venue"
          />
          <input
            required
            type="date"
            value={createForm.eventDate}
            onChange={(event) => updateForm(setCreateForm, 'eventDate', event.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
          />
          <input
            required
            type="time"
            value={createForm.startTime}
            onChange={(event) => updateForm(setCreateForm, 'startTime', event.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
          />
          <input
            required
            type="time"
            value={createForm.endTime}
            onChange={(event) => updateForm(setCreateForm, 'endTime', event.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
          />
          <input
            type="file"
            accept="application/pdf"
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm(setCreateForm, 'noticeFile', event.target.files?.[0] ?? null)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm md:col-span-2"
          />

          <button
            type="submit"
            disabled={busy}
            className="md:col-span-2 bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
          >
            {busy ? 'Saving...' : 'Create Program'}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-[#002155]">Programs</h2>
        {sortedPrograms.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-5 text-[#434651]">No programs created yet.</p>
        ) : (
          sortedPrograms.map((program) => {
            const isEditing = editingProgramId === program.id;

            return (
              <article key={program.id} className="border border-[#c4c6d3] bg-white p-5">
                {!isEditing ? (
                  <>
                    <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{program.programType}</p>
                    <h3 className="mt-1 text-lg font-bold text-[#002155]">{program.title}</h3>
                    <p className="mt-2 text-sm text-[#434651] whitespace-pre-wrap">{program.description}</p>
                    <p className="mt-2 text-xs text-[#434651]">Date: {formatDate(program.eventDate)}</p>
                    <p className="mt-1 text-xs text-[#434651]">Venue: {program.venue}</p>
                    <p className="mt-1 text-xs text-[#434651]">Interested: {program.interestCount}</p>
                    {program.noticeFileUrl ? (
                      <a
                        href={program.noticeFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex mt-2 border border-[#002155] text-[#002155] px-3 py-1 text-xs font-bold uppercase tracking-wider"
                      >
                        Open Notice
                      </a>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(program)}
                        className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteProgram(program.id)}
                        className="border border-[#8b1d1d] text-[#8b1d1d] px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      required
                      value={editForm.title}
                      onChange={(event) => updateForm(setEditForm, 'title', event.target.value)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm"
                      placeholder="Title"
                    />
                    <select
                      required
                      value={editForm.programType}
                      onChange={(event) => updateForm(setEditForm, 'programType', event.target.value)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm"
                    >
                      {programTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <textarea
                      required
                      value={editForm.description}
                      onChange={(event) => updateForm(setEditForm, 'description', event.target.value)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm md:col-span-2 min-h-[100px]"
                      placeholder="Description"
                    />
                    <input
                      required
                      value={editForm.venue}
                      onChange={(event) => updateForm(setEditForm, 'venue', event.target.value)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm"
                      placeholder="Venue"
                    />
                    <input
                      required
                      type="date"
                      value={editForm.eventDate}
                      onChange={(event) => updateForm(setEditForm, 'eventDate', event.target.value)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="time"
                      value={editForm.startTime}
                      onChange={(event) => updateForm(setEditForm, 'startTime', event.target.value)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="time"
                      value={editForm.endTime}
                      onChange={(event) => updateForm(setEditForm, 'endTime', event.target.value)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm"
                    />
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => updateForm(setEditForm, 'noticeFile', event.target.files?.[0] ?? null)}
                      className="border border-[#c4c6d3] px-3 py-2 text-sm md:col-span-2"
                    />
                    <label className="md:col-span-2 flex items-center gap-2 text-xs text-[#434651]">
                      <input
                        type="checkbox"
                        checked={editForm.removeNoticeFile}
                        onChange={(event) => updateForm(setEditForm, 'removeNoticeFile', event.target.checked)}
                      />
                      Remove existing notice file
                    </label>
                    <div className="md:col-span-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveEdit(program.id)}
                        className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                      >
                        {busy ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProgramId(null)}
                        className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
