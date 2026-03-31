'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface StudentProfile {
  id: number;
  userId: number;
  skills: string | null;
  experience: string | null;
  interests: string | null;
  resumeUrl: string | null;
  isComplete: boolean;
  updatedAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    skills: '',
    experience: '',
    interests: '',
    resume: null as File | null,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/profile/me');
        if (res.ok) {
          const data = await res.json();
          setProfile(data.data);
          setFormData({
            skills: data.data.skills || '',
            experience: data.data.experience || '',
            interests: data.data.interests || '',
            resume: null,
          });
        } else if (res.status === 404) {
          setProfile(null);
        } else {
          setError('Failed to load profile');
        }
      } catch (err) {
        setError('Error loading profile');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!formData.skills || !formData.experience || !formData.interests) {
      setError('Please fill in all fields');
      return;
    }

    if (!profile && !formData.resume) {
      setError('Resume is required when creating a profile');
      return;
    }

    try {
      setSaving(true);
      const form = new FormData();
      form.append('skills', formData.skills);
      form.append('experience', formData.experience);
      form.append('interests', formData.interests);
      if (formData.resume) {
        form.append('resume', formData.resume);
      }

      const method = profile ? 'PATCH' : 'POST';
      const res = await fetch('/api/profile', {
        method,
        body: form,
      });

      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.message || 'Failed to save profile');
        return;
      }

      const data = await res.json();
      setProfile(data.data);
      setSuccess(true);
      setFormData({ ...formData, resume: null });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Error saving profile');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
        <div className="text-center text-[#434651]">Loading profile...</div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      {/* Header */}
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          My Profile
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Update your student profile with skills, experience, interests, and resume. This information will be used for all your applications.
        </p>
      </header>

      <div className="max-w-2xl">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 text-green-800 text-sm rounded">
            <p className="font-medium">✓ Profile saved successfully!</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-[#c4c6d3] p-6 md:p-8">
          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Skills <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.skills}
              onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
              placeholder="e.g., React, Node.js, Python, Machine Learning"
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] placeholder-[#747782] focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50 text-sm"
              rows={3}
              required
            />
            <p className="text-xs text-[#747782] mt-1">Comma-separated list of your technical skills</p>
          </div>

          {/* Experience */}
          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Experience <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.experience}
              onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
              placeholder="e.g., 2 years as fullstack developer at XYZ company"
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] placeholder-[#747782] focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50 text-sm"
              rows={3}
              required
            />
            <p className="text-xs text-[#747782] mt-1">Summary of your professional experience</p>
          </div>

          {/* Interests */}
          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Interests <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.interests}
              onChange={(e) => setFormData({ ...formData, interests: e.target.value })}
              placeholder="e.g., Web development, AI/ML, Blockchain, Mobile apps"
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] placeholder-[#747782] focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50 text-sm"
              rows={3}
              required
            />
            <p className="text-xs text-[#747782] mt-1">Areas you're interested in</p>
          </div>

          {/* Resume */}
          <div>
            <label className="block text-sm font-medium text-[#002155] mb-2">
              Resume {!profile && <span className="text-red-500">*</span>}
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFormData({ ...formData, resume: e.target.files?.[0] || null })}
              className="w-full p-3 border border-[#c4c6d3] rounded text-[#434651] text-sm"
            />
            <p className="text-xs text-[#747782] mt-1">PDF, DOC, or DOCX format (Max 10MB)</p>
            {profile?.resumeUrl && (
              <p className="text-xs text-green-600 mt-2">
                ✓ Resume already uploaded{formData.resume && ' (will be replaced)'}
              </p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-4 border-t border-[#c4c6d3]">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#fd9923] text-white rounded font-medium hover:bg-[#e68a00] disabled:opacity-50 transition-colors text-sm"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            <Link
              href="/innovation/problems"
              className="px-6 py-2.5 bg-[#efeeea] text-[#434651] rounded font-medium hover:bg-[#e0ded8] transition-colors text-sm"
            >
              Back
            </Link>
          </div>
        </form>

        {/* Completion Status */}
        {profile?.isComplete && (
          <div className="mt-6 p-4 bg-green-50 border-l-4 border-[#0b6b2e] rounded">
            <p className="text-sm text-[#0b6b2e] font-medium">
              ✓ Your profile is complete! You can now apply for open problems.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

