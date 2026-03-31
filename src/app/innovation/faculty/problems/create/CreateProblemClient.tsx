'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Question {
  id?: string;
  questionText: string;
  questionType: 'SHORT_TEXT' | 'LONG_TEXT';
  isRequired: boolean;
  order: number;
}

export default function CreateProblemClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [supportDocument, setSupportDocument] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    tags: '',
    isIndustryProblem: false,
    industryName: '',
  });

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: `temp-${Date.now()}`,
      questionText: '',
      questionType: 'LONG_TEXT',
      isRequired: true,
      order: questions.length + 1,
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleUpdateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    if (field === 'questionType') {
      updated[index].questionType = value as 'SHORT_TEXT' | 'LONG_TEXT';
    } else if (field === 'isRequired') {
      updated[index].isRequired = value as boolean;
    } else {
      (updated[index] as any)[field] = value;
    }
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;

    const updated = [...questions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    
    // Reorder
    updated.forEach((q, i) => {
      q.order = i + 1;
    });
    setQuestions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validate
    if (!formData.title.trim()) {
      setError('Problem title is required');
      return;
    }
    if (!formData.description.trim()) {
      setError('Problem description is required');
      return;
    }
    if (questions.some(q => !q.questionText.trim())) {
      setError('All questions must have text');
      return;
    }

    if (supportDocument && supportDocument.type !== 'application/pdf') {
      setError('Support document must be a PDF file');
      return;
    }

    try {
      setLoading(true);

      const requestBody = new FormData();
      requestBody.append('title', formData.title.trim());
      requestBody.append('description', formData.description.trim());
      requestBody.append('tags', formData.tags.trim());
      requestBody.append('isIndustryProblem', String(formData.isIndustryProblem));
      requestBody.append('industryName', formData.isIndustryProblem ? formData.industryName.trim() : '');
      requestBody.append('mode', 'OPEN');
      if (supportDocument) {
        requestBody.append('supportDocument', supportDocument);
      }

      // Create problem
      const problemRes = await fetch('/api/innovation/problems', {
        method: 'POST',
        body: requestBody,
      });

      if (!problemRes.ok) {
        const errData = await problemRes.json();
        throw new Error(errData.message || 'Failed to create problem');
      }

      const problemData = await problemRes.json();
      const problemId = problemData.data.id;

      // Create questions
      if (questions.length > 0) {
        const questionsRes = await fetch(`/api/innovation/problems/${problemId}/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: questions.map(q => ({
              questionText: q.questionText,
              questionType: q.questionType,
              isRequired: q.isRequired,
              order: q.order,
            })),
          }),
        });

        if (!questionsRes.ok) {
          throw new Error('Failed to create questions');
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/innovation/faculty');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating problem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      {/* Header */}
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Create New Problem
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Define a new open problem and create custom application questions for students
        </p>
      </header>

      {/* Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 text-green-800 text-sm rounded">
          <p className="font-medium">✓ Problem created successfully! Redirecting...</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Problem Details Section */}
        <div className="border border-[#c4c6d3] bg-white p-6 rounded">
          <h2 className="font-bold text-lg text-[#002155] mb-6">Problem Details</h2>

          {/* Title */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Problem title"
              className="w-full px-4 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
              required
            />
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed problem description"
              className="w-full px-4 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
              rows={4}
              required
            />
          </div>

          {/* Tags */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#002155] mb-2">Tags</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="e.g., Web Development, AI, Database (comma-separated)"
              className="w-full px-4 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
            />
          </div>

          {/* Industry Problem */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isIndustryProblem}
                onChange={(e) => setFormData({ ...formData, isIndustryProblem: e.target.checked })}
                className="w-4 h-4 border border-[#c4c6d3] rounded"
              />
              <span className="text-sm font-medium text-[#002155]">Industry Problem</span>
            </label>
            {formData.isIndustryProblem && (
              <input
                type="text"
                value={formData.industryName}
                onChange={(e) => setFormData({ ...formData, industryName: e.target.value })}
                placeholder="Company/Industry name"
                className="mt-3 w-full px-4 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
              />
            )}
          </div>

          {/* Support Document */}
          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">Support Document (PDF)</label>
            <div className="border-2 border-dashed border-[#8c4f00] bg-[#fff8ee] p-4 rounded">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8c4f00] mb-1">Optional Upload</p>
              <p className="text-xs text-[#434651] mb-2">Students can view this PDF from the problem card.</p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setSupportDocument(e.target.files?.[0] ?? null)}
              />
              <p className="mt-2 text-[11px] text-[#434651]">
                {supportDocument ? `Selected: ${supportDocument.name}` : 'No file selected yet.'}
              </p>
            </div>
          </div>
        </div>

        {/* Custom Questions Section */}
        <div className="border border-[#c4c6d3] bg-white p-6 rounded">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-lg text-[#002155]">Custom Questions</h2>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="px-4 py-2 bg-[#002155] text-white rounded text-sm font-medium hover:bg-[#003380] transition-colors"
            >
              + Add Question
            </button>
          </div>

          {questions.length === 0 ? (
            <div className="border border-dashed border-[#c4c6d3] p-6 rounded text-center">
              <p className="text-[#434651] text-sm">No questions added yet. Click "Add Question" to start.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((question, idx) => (
                <div key={question.id} className="border border-[#c4c6d3] p-4 rounded bg-[#f9f8f4]">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <h3 className="font-medium text-[#002155] text-sm">Question {idx + 1}</h3>
                    <div className="flex gap-2">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(idx, 'up')}
                          className="px-2 py-1 border border-[#c4c6d3] rounded text-xs hover:bg-white transition-colors"
                          title="Move up"
                        >
                          ↑
                        </button>
                      )}
                      {idx < questions.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(idx, 'down')}
                          className="px-2 py-1 border border-[#c4c6d3] rounded text-xs hover:bg-white transition-colors"
                          title="Move down"
                        >
                          ↓
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(idx)}
                        className="px-3 py-1 border border-red-300 text-red-700 rounded text-xs hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-[#002155] mb-2">
                      Question <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={question.questionText}
                      onChange={(e) => handleUpdateQuestion(idx, 'questionText', e.target.value)}
                      placeholder="Enter question text"
                      className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
                      required
                    />
                  </div>

                  {/* Question Type and Required */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#002155] mb-2">Type</label>
                      <select
                        value={question.questionType}
                        onChange={(e) => handleUpdateQuestion(idx, 'questionType', e.target.value)}
                        className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
                      >
                        <option value="SHORT_TEXT">Short Text</option>
                        <option value="LONG_TEXT">Long Text</option>
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mt-6">
                        <input
                          type="checkbox"
                          checked={question.isRequired}
                          onChange={(e) => handleUpdateQuestion(idx, 'isRequired', e.target.checked)}
                          className="w-4 h-4 border border-[#c4c6d3] rounded"
                        />
                        <span className="text-xs font-medium text-[#002155]">Required</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex gap-4 pt-6 border-t border-[#c4c6d3]">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-[#fd9923] text-white rounded font-medium hover:bg-[#e68a00] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating...' : 'Create Problem'}
          </button>
          <Link
            href="/innovation/faculty"
            className="px-6 py-2 bg-[#efeeea] text-[#434651] rounded font-medium hover:bg-[#e0ded8] transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
